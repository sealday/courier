'use strict';
const EventEmitter = require('events');
const Job = require('./job');
const async = require('async');
const RedisWrapper = require('./redis');
const Warlock = require('node-redis-warlock');
const util = require('util');

class Courier extends EventEmitter {
  /**
   *
   * @param options 前缀设置 prefix 是否监视滞留、失败等任务 monitor
   */
  constructor(options) {
    super();
    this._redis = new RedisWrapper(options.prefix);
    const doMonitor = options.monitor || true;
    if (doMonitor) {
      this._monitor();
    }
  }

  /**
   * 监视延迟、滞留工作
   * @private
   */
  _monitor() {
    const client = this._redis.client;
    const warlock = Warlock(client);

    setInterval(() => {
      warlock.lock('locks:monitor', 2000, (err, unlock) => {
        if (err) return this.emit('error', err);

        if (typeof unlock === 'function') {
          this._promote(() => {
            this._ttlCheck(() => {
              this._restartFailed(() => {
                unlock();
              });
            });
          });
        } else {
          // 没有持有锁，也就是有其他的监视者在工作，我们就不处理了
        }
      });
    }, 2000);
  }

  /**
   * 发布新的工作
   * @param type
   * @param data
   * @returns {Job}
   */
  post(type, data, opts) {
    const client = this._redis.client;
    const pubsub = this._redis.pubsub;
    const options = opts || {};

    let job = new Job(type, data);
    job.maxAttempts = options.maxAttempts || 1;
    client.incr('id', (err, id) => {
      if (err) return this.emit('error', err);

      job.init(id, pubsub);

      const multi = client.multi();
      multi.hmset(`job:${id}`, job.toJSON())
        .lpush('jobs:ready', id)
        .lpush(`jobs:${type}:ready`, id);

      multi.exec(err => {
        if (err) return this.emit('error', err);

        client.publish(`events:${id}`, JSON.stringify({
          id: id,
          name: '-> ready',
        }));
      });
    });
    return job;
  }

  /**
   * 发布延迟执行的工作
   * @param type
   * @param data
   * @param delay
   * @returns {Job}
   */
  postDelay(type, data, delay) {
    const client = this._redis.client;
    const pubsub = this._redis.pubsub;

    let job = new Job(type, data);
    client.incr('id', (err, id) => {
      if (err) return this.emit('error', err);

      job.init(id, pubsub);
      job.delay = delay * 1000;

      const multi = client.multi();
      multi.hmset(`job:${id}`, job.toJSON())
        .lpush('jobs:delayed', id)
        .lpush(`jobs:${type}:delayed`, id);

      multi.exec(err => {
        if (err) {
          return this.emit('error', err);
        }
        client.hset(`job:${id}`, 'state', 'delayed');
        client.publish(`events:${id}`, JSON.stringify({
          id: id,
          name: '-> delayed',
        }));
      });
    });
    return job;
  }

  /**
   * 处理特定类型的工作
   * @param type
   * @param fn
   */
  process(type, fn) {
    const client = this._redis.client;
    const blockingClient = this._redis.blocking;

    blockingClient.brpoplpush(`jobs:${type}:ready`, `jobs:${type}:active`, 1, (err, id) => {
      if (!id) return this.process(type, fn);

      client.publish(`events:${id}`, JSON.stringify({
        id: id,
        name: 'ready -> active'
      }));

      client.multi()
        .lrem('jobs:ready', 1, id)
        .lpush('jobs:active', id)
        .hset(`job:${id}`, 'updatedAt', Date.now())
        .hset(`job:${id}`, 'state', 'active').exec();

      client.hgetall(`job:${id}`, (err, job) => {
        if (err) return this.emit('error', err);
        fn(job, err => {
          const multi = client.multi();
          multi.lrem(`jobs:${type}:active`, 1, id);
          multi.lrem('jobs:active', 1, id);
          if (err) { // 工作进行出错
            multi.lpush(`jobs:${type}:failed`, id);
            multi.lpush('jobs:failed', id);
            multi.hset(`job:${id}`, 'error', err.message || util.inspect(err));
            multi.hset(`job:${id}`, 'state', 'failed');
            multi.exec(e => {
              if (e) return this.emit('error', e);
              client.publish(`events:${id}`, JSON.stringify({
                id: id,
                name: 'active -> failed',
                data: err.message || util.inspect(err),
              }));
              this.process(type, fn);
            });
          } else { // 工作进行顺利完成
            multi.lpush(`job:${type}:done`, id);
            multi.lpush('jobs:done', id);
            multi.hset(`job:${id}`, 'state', 'done');
            multi.exec(err => {
              if (err) return this.emit('error', err);
              client.publish(`events:${id}`, JSON.stringify({
                id: id,
                name: 'active -> done'
              }));
              this.process(type, fn);
            });
          }
        });
      });
    });
  }


  /**
   * 定时将到期的延迟执行的工作放入就绪队列
   */
  _promote(unlock) {
    const client = this._redis.client;
    client.lrange('jobs:delayed', 0, -1, (err, jobs) => {
      async.each(jobs, (job, callback) => {
        client.hgetall(`job:${job}`, (err, job) => {
          if (err) return callback(err);
          if (job.createdAt * 1 + job.delay * 1 > Date.now()) {
            return callback();
          }

          client.multi()
            .hmset(`job:${job}`,
              'promotedAt', Date.now(),
              'updatedAt', Date.now(),
              'state', 'ready'
            )
            .lrem('jobs:delayed', 1, job.id)
            .lrem(`jobs:${job.type}:delayed`, 1, job.id)
            .lpush('jobs:ready', job.id)
            .lpush(`jobs:${job.type}:ready`, job.id)
            .hset(`job:${job.id}`, 'state', 'ready')
            .exec(err => {
              if (err) return callback(err);
              client.publish(`events:${job.id}`, JSON.stringify({
                id  : job.id,
                name: 'delayed -> ready'
              }));
              callback();
            });
        });
      }, err => {
        if (err) {
          this.emit('error', err);
        }
        unlock();
      });
    });
  }

  /**
   * 处理超时任务
   */
  _ttlCheck(unlock) {
    const client = this._redis.client;
    client.lrange('jobs:active', 0, -1, (err, jobs) => {
      async.each(jobs, (job, callback) => {
        client.hgetall(`job:${job}`, (err, job) => {
          if (err) return callback(err);
          if (job.updatedAt * 1 + job.ttl * 1000 > Date.now()) {
            return callback();
          }

          client.multi()
            .hmset(`job:${job}`,
              'updatedAt', Date.now(),
              'state', 'failed'
            )
            .lrem('jobs:active', 1, job.id)
            .lrem(`jobs:${job.type}:active`, 1, job.id)
            .lpush('jobs:failed', job.id)
            .lpush(`jobs:${job.type}:failed`, job.id)
            .exec(err => {
              if (err) return callback(err);
              client.publish(`events:${job.id}`, JSON.stringify({
                id  : job.id,
                name: 'active -> failed',
                data: '工作超时',
              }));
              callback();
            });
        });
      }, err => {
        if (err) {
          this.emit('error', err);
        }
        unlock();
      });
    });
  }

  /**
   * 处理失败任务
   * TODO 支持 backoff
   */
  _restartFailed(unlock) {
    const client = this._redis.client;
    client.lrange('jobs:failed', 0, -1, (err, jobs) => {
      async.each(jobs, (job, callback) => {
        client.hgetall(`job:${job}`, (err, job) => {
          if (err) return callback(err);
          if (job.maxAttempts <= job.attempts) {
            return callback();
          }

          client.multi()
            .hmset(`job:${job}`,
              'updatedAt', Date.now(),
              'state', 'ready'
            )
            .lrem('jobs:failed', 1, job.id)
            .lrem(`jobs:${job.type}:failed`, 1, job.id)
            .lpush('jobs:ready', job.id)
            .lpush(`jobs:${job.type}:ready`, job.id)
            .exec(err => {
              if (err) return callback(err);
              client.publish(`events:${job.id}`, JSON.stringify({
                id  : job.id,
                name: 'failed -> ready',
              }));
              callback();
            });
        });
      }, err => {
        if (err) {
          this.emit('error', err);
        }
        unlock();
      });
    });
  }

  /**
   * TODO 为了实现安全退出，需要在退出的时候做一个标记，让其他操作都不再执行
   */
  quit() {
    this._redis.quit();
  }
}

exports.createCourier = options => new Courier(options);

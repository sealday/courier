'use strict';
const EventEmitter = require('events');
const Job = require('./job');
const async = require('async');
const RedisWrapper = require('./redis');
const Warlock = require('node-redis-warlock');
const util = require('util');

class Courier extends EventEmitter {
  constructor(options) {
    super();
    this._redis = new RedisWrapper(options.prefix);
    setInterval(this.promote.bind(this), 2000);
  }

  /**
   * 发布新的工作
   * @param type
   * @param data
   * @returns {Job}
   */
  post(type, data) {
    const client = this._redis.client;
    const pubsub = this._redis.pubsub;

    let job = new Job(type, data);
    client.incr('id', (err, id) => {
      if (err) {
        return this.emit('error', err);
      }

      job.init(id, pubsub);

      const multi = client.multi();
      multi.hmset(`job:${id}`, job.toJSON())
        .lpush('jobs:ready', id)
        .lpush(`jobs:${type}:ready`, id);

      multi.exec(err => {
        if (err) {
          return this.emit('error', err);
        }
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
      if (err) {
        return this.emit('error', err);
      }

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

      blockingClient.hgetall(`job:${id}`, (err, job) => {
        fn(job, err => {
          const multi = blockingClient.multi();
          multi.lrem(`jobs:${type}:active`, 1, id);
          multi.lrem('jobs:active', 1, id);
          if (err) { // 工作进行出错
            multi.lpush(`jobs:${type}:failed`, id);
            multi.lpush('jobs:failed', id);
            multi.hset(`job:${id}`, 'error', err.message || util.inspect(err));
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
  promote() {
    const client = this._redis.client;
    const warlock = Warlock(client);

    warlock.lock('locks:monitor', 2000, (err, unlock) => {
      if (err) {
        // 这里发生错误是连接错误，通知用户
        this.emit('error', err);
      } else if (typeof unlock === 'function') {
        client.lrange('jobs:delayed', 0, -1, (err, jobs) => {
          async.each(jobs, (job, callback) => {
            client.hgetall(`job:${job}`, (err, job) => {
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
                .exec(() => {
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
            } else {
              unlock();
            }
          });
        });
      } else {
        // 我们没拥有锁，则说明不需要我们做什么
      }
    });
  }
}

exports.createCourier = options => new Courier(options);

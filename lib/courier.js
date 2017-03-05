'use strict';
const EventEmitter = require('events');
const Job = require('./job');
const async = require('async');
const RedisWrapper = require('./redis');
const Warlock = require('node-redis-warlock');

class Courier extends EventEmitter {
  constructor() {
    super();
    this._redis = new RedisWrapper();
    setInterval(this.promote.bind(this), 2000);
  }

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
        fn(err, job, err => {
          const multi = blockingClient.multi();
          multi.lrem(`jobs:${type}:active`, 1, id);
          multi.lrem('jobs:active', 1, id);
          if (err) {
            multi.lpush(`jobs:${type}:failed`, id);
            multi.lpush('jobs:failed', id);
            multi.exec(err => {
              if (err) {
                return;
              }
              client.publish(`events:${id}`, JSON.stringify({
                id: id,
                name: 'active -> failed'
              }));
              this.process(type, fn);
            });
          } else {
            multi.lpush(`job:${type}:done`, id);
            multi.lpush('jobs:done', id);
            multi.exec(err => {
              if (err) {
                return;
              }
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

module.exports = new Courier();

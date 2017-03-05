'use strict';
const EventEmitter = require('events');
const Job = require('./job');
const RedisWrapper = require('./redis');

class Courier extends EventEmitter {
  constructor() {
    super();
    this._redis = new RedisWrapper();
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
}

module.exports = new Courier();

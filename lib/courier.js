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

  process(topic, options, fn) {
    this.on(topic, msg => {
      let job = new Job(msg);
      fn(job, () => {
        job.done = true;
      });
    });
  }
}

module.exports = new Courier();

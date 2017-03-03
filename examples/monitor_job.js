'use strict';
const redis = require('redis');
const EventEmitter = require('events');
const Warlock = require('node-redis-warlock');
const async = require('async');

const events = new EventEmitter();
// 在监视的里面，需要监视两个队列，分别是 delayed 队列和 active 队列
const client = redis.createClient({
  prefix: 'courier:'
});

// 我们应该只有一个监视器
const warlock = Warlock(client);

const promote = () => warlock.lock('locks:monitor', 2000, (err, unlock) => {
  if (err) {
    // ？？
    console.log(err);
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
              events.emit('promotion', job.id);
              client.publish(`events:${job.id}`, JSON.stringify({
                id: job.id,
                name: 'delayed -> ready'
              }));
              callback();
            });
        });
      }, err => {
        if (err) {
          console.log(err);
        } else {
          unlock();
        }
      });
    });
  } else {
    // 我们没拥有锁，则说明不需要我们做什么
  }
});

// 每隔两秒查询一次
setInterval(promote, 2000);

events.on('promotion', id => {
  console.log('promote a job $%d', id);
});

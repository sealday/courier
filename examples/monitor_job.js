'use strict';
const redis = require('redis');
const EventEmitter = require('events');

const events = new EventEmitter();
// 在监视的里面，需要监视两个队列，分别是 delayed 队列和 active 队列
const pubsubClient = client.duplicate();

const client = redis.createClient({
  prefix: 'courier:'
});

const promote = () => client.lrange('jobs:delayed', 0, -1, (err, jobs) => {
  jobs.forEach(job => {
    client.hgetall(`job:${job}`, (err, job) => {
      if (job.createdAt * 1 + job.delay * 1 <= Date.now()) {
        const multi = client.multi();
        multi.hmset(`job:${job}`,
          'promotedAt', Date.now(),
          'updatedAt', Date.now(),
          'state', 'ready'
        );
        multi.lrem('jobs:delayed', 1, job.id);
        multi.lrem(`jobs:${job.type}:delayed`, 1, job.id);
        multi.lpush('jobs:ready', job.id);
        multi.lpush(`jobs:${job.type}:ready`, job.id);
        events.emit('promotion');
        multi.exec(() => {
          pubsubClient.publish(`events:${id}`, JSON.stringify({
            id: job.id,
            name: 'delayed -> ready'
          }));
        });
      }
    });
  });
});

// 每隔一秒查询一次
setInterval(promote, 1000);

events.on('promotion', () => {
  console.log('promote a job');
});

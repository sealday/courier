'use strict';
const redis = require('redis');
const EventEmitter = require('events');
const Job = require('../lib/job');
const client = redis.createClient({
  prefix: 'courier:'
});

const events = new EventEmitter();
const pubsubClient = client.duplicate();

pubsubClient.on('message', (channel, message) => {
  console.log(channel);
  console.log(message);
});

const run = type => setTimeout(() => {
// 新增加的任务总是要创建id
  client.incr('id', (err, id) => {
    if (err) {
      events.emit('error', err);
    } else {
      events.emit('job ready');
      const multi = client.multi();

      pubsubClient.subscribe(`events:${id}`);

      let job = new Job(id, type, 'delayed');
      job.delay = 10 * 1000;
      multi.hmset(`job:${id}`, job);

      multi.lpush('jobs:delayed', id);
      multi.lpush(`jobs:${type}:delayed`, id);
      // 实际上上面这个事务也没有什么必要，id 不会被多个客户端
      // 这个地方就失败了，只有连接出错的时候才会发生
      multi.exec(() => {
        client.publish(`events:${id}`, JSON.stringify({
          id: id,
          name: '-> delayed'
        }));
      });
    }
  });
  run(type);
}, Math.random() * 5000);

run('email');
run('video');

events.on('error', err => {
  console.log(err);
});

events.on('job ready', () => {
  console.log('job ready');
});

'use strict';
const redis = require('redis');
const EventEmitter = require('events');
const client = redis.createClient({
  prefix: 'courier:'
});

const pubsubClient = client.duplicate();

pubsubClient.on('message', (channel, message) => {
  console.log(channel);
  console.log(message);
});

const events = new EventEmitter();

const run = type => setTimeout(() => {
// 新增加的任务总是要创建id
  client.incr('id', (err, id) => {
    if (err) {
      events.emit('error', err);
    } else {
      events.emit('job ready');

      pubsubClient.subscribe(`events:${id}`);

      const multi = client.multi();
      multi.hmset(`job:${id}`, {
        id: id,
        data: JSON.stringify('stub data'),
        failedAt: Date.now(),
        updatedAt: Date.now(),
        progress: 0,
        promotedAt: Date.now(),
        error: JSON.stringify(new Error('error stub')),
        createdAt: Date.now(),
        maxAttempts: 1,
        priority: -10,
        type: type,
        state: 'ready'
      });

      multi.lpush('jobs:ready', id);
      multi.lpush(`jobs:${type}:ready`, id);
      // 实际上上面这个事务也没有什么必要，id 不会被多个客户端
      // 这个地方就失败了，只有连接出错的时候才会发生
      multi.exec(() => {
        pubsubClient.publish(`events:${id}`, JSON.stringify({
          id: id,
          name: '-> ready',
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

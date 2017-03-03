'use strict';
const redis = require('redis');
const EventEmitter = require('events');
const client = redis.createClient({
  prefix: 'courier:'
});

// redis-client 可能会产生两种错误

client.on('error', err => {

});

client.on('end', err => {
  console.log('end');
  console.log(err);
});

client.on('warning', data => {
  console.log(data);
  console.log('warning');
});

client.on('end', data => {
  console.log(data);
  console.log('end');
});

const blockingClient = client.duplicate();

const brpop = () => {
  console.log('brpop called');
  blockingClient.brpop('nonexisting', 5, function() {
    console.log('brpop return');
    setTimeout(brpop, 1000);
  });
};

// brpop();

client.hmset('hosts', {
  'www.badiu.com': '192.168.1.1',
  'www.hao123.com': '192.168.1.2'
}, redis.print);

const events = new EventEmitter();

class Monitor {
  constructor() {
    this.client = redis.createClient({
      prefix: 'courier:'
    });
    this.client.on('connect', (arg1, arg2) => {
      console.log(arg1);
      console.log(arg2);
      console.log('connect');
    });

    this.client.on('reconnect', (arg1, arg2) => {
      console.log(arg1);
      console.log(arg2);
      console.log('reconnect');
    });
  }
}

const monitor = new Monitor();

client.incr('id', redis.print);

// 转换成 json
const j = o => JSON.stringify(o);

// 转换成 object
const o = j => JSON.parse(j);

class Job {
  toJSON() {
    return {
      id: 1,
      zid: '01|1',
    };
  }
}

console.log(JSON.stringify(new Job()));


// 这里不需要用 multi，获取并增加 id 的时候已经确保了 id 肯定是唯一的
// 新的任务到来
client.incr('id', (err, id) => {
  let multi = client.multi();

  // client.hset(`job:${id}`,
  //   'id', id,
  // );
  client.lpush('jobs', j({
    id: id,
    data: {
      title: 'today'
    },
    createAt: Date.now()
  }));

  multi.exec();
});

client.on('error', err => {
  console.log(err);
});

// client.quit();

blockingClient.end(true);


// 新增加的任务总是要创建id
client.incr('id', (err, id) => {
  if (err) {
    events.emit('error', err);
  } else {
    client.hmset(`job:${id}`, {
      data: JSON.stringify('stub data'),
      failedAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
      promotedAt: Date.now(),
      error: JSON.stringify(new Error('error stub')),
      createdAt: Date.now(),
      maxAttempts: 1,
      priority: -10,
      type: 'email',
      state: 'ready'
    });
  }
});

events.on('error', err => {
  console.log(err);
});

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


// 每隔两秒查询一次
setInterval(promote, 2000);

events.on('promotion', id => {
  console.log('promote a job $%d', id);
});

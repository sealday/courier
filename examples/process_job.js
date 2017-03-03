'use strict';
const redis = require('redis');
const EventEmitter = require('events');
const async = require('async');
const client = redis.createClient({
  prefix: 'courier:'
});

const events = new EventEmitter();

const blockingClient = client.duplicate();
const pubsubClient = client.duplicate();

const type = 'email';
// 这里只是取任务，将任务放在活跃队列中
const watiFor = (type, fn) => {
  blockingClient.brpoplpush(`jobs:${type}:ready`, `jobs:${type}:active`, 0, (err, id) => {

    pubsubClient.publish(`events:${id}`, JSON.stringify({
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
          multi.exec((err, a) => {
            if (err) {
              return;
            }
            pubsubClient.publish(`events:${id}`, JSON.stringify({
              id: id,
              name: 'active -> failed'
            }));
            watiFor(type, fn);
          });
        } else {
          multi.lpush(`job:${type}:done`, id);
          multi.lpush('jobs:done', id);
          multi.exec((err, a) => {
            if (err) {
              return;
            }
            pubsubClient.publish(`events:${id}`, JSON.stringify({
              id: id,
              name: 'active -> done'
            }));
            watiFor(type, fn);
          });
        }
      });
    });
  });
};

watiFor('email', (err, job, done) => {
  console.log('working video on $%d', job.id);

  let ms = Math.random() * 5000;
  setTimeout(() => {
    if (ms > 2000) {
      done(new Error('too much time'));
    } else {
      done();
    }
  }, ms);
});

watiFor('video', (err, job, done) => {
  console.log('working email on $%d', job.id);

  let ms = Math.random() * 5000;
  setTimeout(() => {
    if (ms > 2000) {
      done(new Error('too much time'));
    } else {
      done();
    }
  }, ms);
});

events.on('error', err => {
  console.log(err);
});

events.on('job ready', () => {
  console.log('job ready');
});

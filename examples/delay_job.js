'use strict';
const courier = require('../').createCourier({ prefix: 'c:' });

/*
 * 模拟不定期发布延时工作
 */
setInterval(() => {
  courier.postDelay('email', {
    title: 'Sample Title',
    from: 'A',
    to: 'B',
    content: 'Some contents'
  }, 2).on('-> delayed', (job) => {
    console.log(`#${job.id}进入延迟工作队列`);
  }).on('-> ready', (job) => {
    console.log(`#${job.id} 工作准备就绪`);
  }).on('ready -> active', (job) => {
    console.log(`#${job.id} 工作开始进行`);
  }).on('active -> done', (job) => {
    console.log(`#${job.id} 工作完成`);
  }).on('active -> failed', (job) => {
    console.log(`#${job.id} 工作失败`);
  });
}, Math.random() * 5000);

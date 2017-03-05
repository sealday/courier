'use strict';
const courier = require('../').createCourier({ prefix: 'c:' });

/*
 * 模拟不定期发布工作
 */
setInterval(() => {
  courier.post('email', {
    title: 'Sample Title',
    from: 'A',
    to: 'B',
    content: 'Some contents'
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

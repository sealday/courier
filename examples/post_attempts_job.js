'use strict';
const courier = require('../').createCourier({ prefix: 'c:' });

/*
 * 模拟不定期发布可重试工作
 */
const postJob = () => setTimeout(() => {
  courier.post('email', {
    title: 'Sample Title',
    from: 'A',
    to: 'B',
    content: 'Some contents'
  }, { maxAttempts: 5 }).on('-> ready', (job) => {
    console.log(`#${job.id} 工作准备就绪`);
  }).on('ready -> active', (job) => {
    console.log(`#${job.id} 工作开始进行`);
  }).on('active -> done', (job) => {
    console.log(`#${job.id} 工作完成`);
  }).on('active -> failed', (job, message) => {
    console.log(`#${job.id} 工作失败`);
    console.log(`失败信息：${message}`);
  });
  postJob();
}, Math.random() * 5000);

postJob();

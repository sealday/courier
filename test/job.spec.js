'use strict';
const expect = require('chai').expect;
const Job = require('../lib/job');
const _  = require('lodash');

describe('测试基本的消息发收', () => {

  it('输出 job 的内容', () => {
    const job = new Job('xxx', '');
    console.log(job);
  });

  it('更新 job 的内容', () => {
    const rawJob = {
      progress: 80,
    };

    let job = new Job('xxxx', '');
    _.assign(job, rawJob);

    expect(job.progress).to.equal(rawJob.progress);
  });
});

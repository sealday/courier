'use strict';
const expect = require('chai').expect;
const courier = require('../');

describe('测试基本的消息发收', () => {
  it('先发消息后收', done => {
    const sampleMsg = {
      title: 'Email Test',
      from: 'Me',
      to: 'You'
    };

    courier.deliver('email', sampleMsg);

    courier.onReceive('email', (job, jobDone) => {
      expect(job.msg).to.equal(sampleMsg);
      jobDone();
      done();
    });
  });

  it('先收消息后发', done => {
    const sampleMsg = {
      title: 'Email Test',
      from: 'Me',
      to: 'You'
    };

    courier.onReceive('email', (job, jobDone) => {
      jobDone();
      done();
    });

    courier.deliver('email', sampleMsg);
  });
});


'use strict';
const courier = require('../').createCourier({ prefix: 'c:' });
const Job = require('../lib/job');

courier.process('email', (job, done) => {
  console.log('working email on $%d', job.id);

  let count = 0;
  let ms = 200;
  const next = () => setTimeout(() => {
    if (count === 10) {
      done();
    } else {
      count++;
      job.doProgress(count, 10);
      next();
    }
  }, ms);
  next();
});

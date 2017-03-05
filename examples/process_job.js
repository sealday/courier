'use strict';
const courier = require('../');

courier.process('video', (job, done) => {
  console.log('working video on $%d', job.id);

  let ms = Math.random() * 1000;
  setTimeout(() => {
    if (ms > 500) {
      done(new Error('too much time'));
    } else {
      done();
    }
  }, ms);
});

courier.process('email', (job, done) => {
  console.log('working email on $%d', job.id);

  let ms = Math.random() * 1000;
  setTimeout(() => {
    if (ms > 500) {
      done(new Error('too much time'));
    } else {
      done();
    }
  }, ms);
});

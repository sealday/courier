'use strict';
const courier = require('../');

courier.process('video', (err, job, done) => {
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

courier.process('email', (err, job, done) => {
  console.log('working email on $%d', job.id);

  let ms = Math.random() * 2000;
  setTimeout(() => {
    if (ms > 1000) {
      done(new Error('too much time'));
    } else {
      done();
    }
  }, ms);
});

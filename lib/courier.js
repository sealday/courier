'use strict';
const EventEmitter = require('events');
const Job = require('./job');
const redis = require('redis');

class Courier extends EventEmitter {
  constructor() {
    super();

  }

  deliver(topic, msg, options) {
    this.emit(topic, msg);
  }

  process(topic, options, fn) {
    this.on(topic, msg => {
      let job = new Job(msg);
      fn(job, () => {
        job.done = true;
      });
    });
  }
}

module.exports = new Courier();

'use strict';
const EventEmitter = require('events');
const Job = require('./job');
class Courier extends EventEmitter {
  constructor() {
    super();

  }

  deliver(topic, msg) {
    this.emit(topic, msg);
  }

  onReceive(topic, fn) {
    this.on(topic, msg => {
      let job = new Job(msg);
      fn(job, () => {
        job.done = true;
      });
    });
  }
}

module.exports = new Courier();

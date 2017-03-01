'use strict';
class Job {
  constructor(msg, id, done) {
    this.msg = msg;
    this.id = id || Date.now();
    this.done = done || false;
  }
}

module.exports = Job;

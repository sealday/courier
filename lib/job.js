'use strict';
const EventEmitter = require('events');
/**
 * 工作单位，用来表示工作的内容、相关时间与状态
 */
class Job extends EventEmitter {
  constructor(type, data) {
    super();
    this.data = JSON.stringify(data);
    this.createdAt = Date.now();
    this.failedAt = 0;
    this.updatedAt = this.createdAt;
    this.promotedAt = 0;
    this.progress = 0;
    this.error = '';
    this.attempts = 1;
    this.maxAttempts = 1;
    this.delay = 0;
    this.priority = -10;
    this.type = type;
    this.state = 'ready'; // 默认是就绪状态

  }

  init(id, pubsub) {
    this.id = id;
    const channel = `events:${id}`;
    pubsub.subscribe(channel);
    pubsub.on('message', (revChannel, message) => {
      if (revChannel === channel) {
        const msg = JSON.parse(message);
        this.emit(msg.name, this, msg.data);
      }
    });
  }

  toJSON() {
    return {
      id: this.id,
      data: this.data,
      createdAt: this.createdAt,
      failedAt: this.failedAt,
      updatedAt: this.updatedAt,
      promotedAt: this.promotedAt,
      progress: this.progress,
      error: this.error,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      delay: this.delay,
      priority: this.priority,
      type: this.type,
      state: this.state,
    };
  }
}

module.exports = Job;

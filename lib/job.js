'use strict';
/**
 * 工作单位，用来表示工作的内容、相关时间与状态
 */
class Job {
  constructor(id, type, state) {
    this.id = id;
    this.data = '';
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
    this.state = state;
  }
}

module.exports = Job;

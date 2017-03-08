'use strict';
const EventEmitter = require('events');
const assert = require('assert');
const courier = require('./courier');
/**
 * 工作单位，用来表示工作的内容、相关时间与状态
 * - id: 工作号
 * - data: 工作数据
 * - createdAt: 创建时间，默认为创建时时间，类型为时间戳数据
 * - failedAt: 失败时间，默认为0，类型为时间戳数据
 * - updatedAt: 更新时间，默认为创建时间，类型为时间戳数据
 * - promotedAt: 开始处理时间，默认为0，类型为时间戳数据（考虑改成进入就绪工作时间，而开始处理时间由 startedAt 表示）
 * - progress: 进度数据，默认为0，类型为从 0 - 100 的整数
 * - error: 描述错误发生的字符串，默认为空（考虑去掉）
 * - attempts: 1 失败尝试次数
 * - maxAttempts: 1 最多允许失败尝试次数
 * - delay: 默认为0，标示延迟多少毫秒执行
 * - priority: -10 任务优先级，未实现
 * - ttl: 默认是60 * 60（1 小时），单位是秒
 * - type: 任务类型
 * - state: 任务状态，字符串表达
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
    this.ttl = 60 * 60;
    this.state = 'ready'; // 默认是就绪状态

  }

  /**
   * 初始化
   * @param id
   * @param pubsub
   * @param redis
   */
  init(id, pubsub, redis) {
    this.id = id;
    this.redis = redis;
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
      ttl: this.ttl,
      type: this.type,
      state: this.state,
    };
  }

  /**
   *
   * 切换状态，在系统实现中就是重新排队
   * 系统中每一个状态都是一个队列，从一个状态切换到另一个状态的时候，就需要重新排队
   *
   * @param from - 原来的状态，可以为空，但是必须明确是 null
   * @param to - 到什么队列，不可以为空
   * @param callback
   */
  requeue(from, to, callback) {
    assert(to, 'to 不可以为空！');
    const client = this.redis.client;
    const id = this.id;
    assert(id != null);
    assert(client !=  null);

    client.multi()
      .hmset(`job:${id}`, this.toJSON())
      .lpush(`jobs:${to}`, id)
      .lpush(`jobs:${this.type}:${to}`, id)
      .hset(`job:${id}`, 'state', to)
      .exec(err => {
        if (err) return callback(err);

        client.publish(`events:${id}`, JSON.stringify({
          id: id,
          name: `${from} -> ${to}`,
        }));
        callback();
      });
  }

  log() {

  }
}

module.exports = Job;

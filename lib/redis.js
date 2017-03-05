'use strict';

const redis = require('redis');
const EventEmitter = require('events');

/**
 * redis 客户端的包装
 */
class RedisWrapper extends EventEmitter {
  /**
   * @param prefix 数据库前缀
   */
  constructor(prefix) {
    super();
    this._client = redis.createClient({
      prefix: prefix ? prefix : 'courier:'
    });
    this._pubsubClient = this._client.duplicate();
    this._blockingClient = this._client.duplicate();

    this._client.on('error', err => {
      this.emit('error', err);
    });

    this._pubsubClient.on('error', err => {
      this.emit('error', err);
    });

    // 提高可以设置的监听器数量
    this._pubsubClient.setMaxListeners(Infinity);

    this._blockingClient.on('error', err => {
      this.emit('error', err);
    });
  }

  get client() {
    return this._client;
  }

  get pubsub() {
    return this._pubsubClient;
  }

  get blocking() {
    return this._blockingClient;
  }

  quit() {
    this._client.quit();
    this._pubsubClient.quit();
    this._blockingClient.quit();
  }
}

module.exports = RedisWrapper;

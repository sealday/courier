'use strict';

const redis = require('redis');
const EventEmitter = require('events');

/**
 * redis 客户端的包装
 */
class RedisWrapper extends EventEmitter {
  constructor() {
    // TODO 在这里可以传入参数定制 redis 连接
    this._client = redis.createClient({
      prefix: 'courier:'
    });
    this._pubsubClient = this._client.duplicate();
    this._blockingClient = this._client.duplicate();

    this._client.on('error', err => {
      this.emit('error', err);
    });

    this._pubsubClient.on('error', err => {
      this.emit('error', err);
    });

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

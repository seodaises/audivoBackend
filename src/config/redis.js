'use strict';
require('dotenv').config();

// Shared BullMQ connection options. Passed to both Queue and Worker
// instances — BullMQ manages its own ioredis client internally from this,
// so no direct ioredis dependency is needed here.
module.exports = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
};
'use strict';
const Redis = require('ioredis');
const redisConnection = require('./redis');
const redisClient = new Redis({
  ...redisConnection,
  lazyConnect: true,
  maxRetriesPerRequest: 1, 
});
redisClient.on('error', (err) => {
  console.error('[redisClient] connection error:', err.message);
});

module.exports = redisClient;
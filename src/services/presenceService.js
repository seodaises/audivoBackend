'use strict';
const db = require('../models');
const redisClient = require('../config/redisClient');

const PRESENCE_KEY = 'presence:online';
const DEFAULT_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 24 * 60; 

const touch = async (userId) => {
  try {
    await redisClient.zadd(PRESENCE_KEY, Date.now(), String(userId));
  } catch (err) {
    console.error('[presenceService] touch failed:', err.message);
  }
};

const windowStartMs = (minutes) => Date.now() - minutes * 60 * 1000;

const clampWindow = (minutes) => {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WINDOW_MINUTES;
  return Math.min(n, MAX_WINDOW_MINUTES);
};

const listActiveUsers = async ({ minutes = DEFAULT_WINDOW_MINUTES } = {}) => {
  const windowMinutes = clampWindow(minutes);

  let entries;
  try {
    entries = await redisClient.zrangebyscore(
      PRESENCE_KEY,
      windowStartMs(windowMinutes),
      '+inf',
      'WITHSCORES'
    );
  } catch (err) {
    console.error('[presenceService] listActiveUsers Redis read failed:', err.message);
    return { items: [], windowMinutes, redisUnavailable: true };
  }

  const lastActiveByUserId = new Map();
  for (let i = 0; i < entries.length; i += 2) {
    lastActiveByUserId.set(Number(entries[i]), new Date(Number(entries[i + 1])));
  }

  if (lastActiveByUserId.size === 0) {
    return { items: [], windowMinutes, redisUnavailable: false };
  }

  const users = await db.User.findAll({
    where: { id: Array.from(lastActiveByUserId.keys()) },
    include: [{ model: db.Role, as: 'role' }],
    attributes: ['id', 'username', 'display_name', 'email'],
  });

  const items = users
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      email: u.email,
      role: u.role ? u.role.name : null,
      lastActiveAt: lastActiveByUserId.get(u.id),
    }))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  return { items, windowMinutes, redisUnavailable: false };
};

const countActiveUsers = async ({ minutes = DEFAULT_WINDOW_MINUTES } = {}) => {
  const windowMinutes = clampWindow(minutes);

  try {
    const count = await redisClient.zcount(PRESENCE_KEY, windowStartMs(windowMinutes), '+inf');
    return { count, windowMinutes, redisUnavailable: false };
  } catch (err) {
    console.error('[presenceService] countActiveUsers Redis read failed:', err.message);
    return { count: 0, windowMinutes, redisUnavailable: true };
  }
};

module.exports = {
  touch,
  listActiveUsers,
  countActiveUsers,
  DEFAULT_WINDOW_MINUTES,
  MAX_WINDOW_MINUTES,
};
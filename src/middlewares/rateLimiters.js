'use strict';
const rateLimit = require('express-rate-limit');
const { error } = require('../utils/response');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: true,    // RateLimit-* headers, so a good client can back off
  legacyHeaders: false,     // drop the deprecated X-RateLimit-* set
  skipSuccessfulRequests: true,
  handler: (req, res) =>
    error(res, 429, 'Too many attempts. Please try again in 15 minutes.'),
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    error(res, 429, 'Too many requests. Please try again later.'),
});
const keyByUser = (req, res) =>
  req.user ? `user:${req.user.id}` : req.ip;

const authedValidate = { keyGeneratorIpFallback: false };

const socialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  validate: authedValidate,
  handler: (req, res) =>
    error(res, 429, 'You are doing that too quickly. Please slow down and try again shortly.'),
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUser,
  validate: authedValidate,
  handler: (req, res) =>
    error(res, 429, 'Upload limit reached. Please try again later.'),
});

module.exports = { authLimiter, emailLimiter, socialLimiter, uploadLimiter };
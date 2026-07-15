'use strict';
const rateLimit = require('express-rate-limit');
const { error } = require('../utils/response');

// Rate limiting exists to make an attack SLOW. It does not make it impossible —
// nothing does. A password-guessing attack against an un-limited login endpoint is
// bounded only by network speed: thousands of guesses a second, indefinitely. With
// a limit of 10 per 15 minutes, the same attack takes years. That's the whole idea.
//
// The handler goes through our `error()` envelope rather than express-rate-limit's
// default plain-text 429, so the frontend's axios interceptor — which expects
// { success, message } on every failure — can read the message and show it. A raw
// 429 body would surface in the UI as "Request failed" with no explanation.

// LOGIN and other CREDENTIAL endpoints. Strict, because the thing being guessed is
// a secret and every attempt is a free roll of the dice for the attacker.
//
// keyGenerator is left at the default (the client IP). That's imperfect — everyone
// behind one office NAT shares a bucket, and an attacker with a botnet has many
// buckets. Both are true and neither makes it useless: it stops the overwhelmingly
// common case, which is one machine hammering one endpoint.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // 10 attempts per IP per window
  standardHeaders: true,    // RateLimit-* headers, so a good client can back off
  legacyHeaders: false,     // drop the deprecated X-RateLimit-* set
  // Only FAILED attempts count. Someone logging in successfully ten times because
  // they're testing the app has done nothing wrong and shouldn't be locked out;
  // someone FAILING ten times is the pattern we care about.
  skipSuccessfulRequests: true,
  handler: (req, res) =>
    error(res, 429, 'Too many attempts. Please try again in 15 minutes.'),
});

// EMAIL-SENDING endpoints (forgot-password, resend-verification). Limited for a
// different reason: these aren't guessing attacks, they're an amplification vector.
// An unlimited /forgot-password lets anyone use our SMTP server to mail-bomb a
// stranger's inbox — free, from our domain, until our domain is blacklisted.
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    error(res, 429, 'Too many requests. Please try again later.'),
});

module.exports = { authLimiter, emailLimiter };
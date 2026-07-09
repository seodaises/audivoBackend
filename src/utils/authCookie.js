'use strict';
const COOKIE_NAME = 'audivo_token';

const baseOptions = () => ({
  httpOnly: true, // JS cannot read it — this is the XSS protection
  sameSite: 'lax', // blocks the dangerous cross-site cases; dev-friendly
  secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod; off for localhost dev
  path: '/',
});

// Convert JWT_EXPIRES_IN-style config into a maxAge (ms). Falls back to 24 hours.
// Accepts values like '7d', '24h', '3600' (seconds), or a raw number of ms via
// COOKIE_MAX_AGE_MS if you'd rather set it explicitly.
const resolveMaxAge = () => {
  if (process.env.COOKIE_MAX_AGE_MS) {
    const ms = Number(process.env.COOKIE_MAX_AGE_MS);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  return 24 * 60 * 60 * 1000; // 24 hours default
};

const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: resolveMaxAge(),
  });
};

const clearAuthCookie = (res) => {
  // clearCookie must be given the SAME options (minus maxAge) used to set it.
  res.clearCookie(COOKIE_NAME, baseOptions());
};

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie };


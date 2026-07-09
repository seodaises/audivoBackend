'use strict';

// Prevents browsers from caching responses (and returning a stale 304) on
// session-sensitive endpoints. Auth responses like /auth/me depend on the
// current session and must always be revalidated against the server, or a
// cached response can make a logged-in user appear logged out after a refresh.
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};

module.exports = noCache;


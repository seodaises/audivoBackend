'use strict';
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

// Gate a route to one or more EXACT role names (case-sensitive, matching the
// seeded role names: 'Super Admin', 'Admin', 'Moderator', 'Artist', 'Listener').
//
// This is deliberately an exact-name check, NOT a level threshold. Some
// capabilities are tied to a role's IDENTITY rather than its rank. Artist
// profile creation is the motivating case: being an Artist means "this account
// is a performer with a public catalog." A Moderator or Admin is a staff
// function, not a performer, so they should not be able to mint artist profiles
// even though they outrank an Artist by level. Rank inheritance ("higher roles
// can do everything lower roles can") applies to ABILITIES; it does not apply to
// IDENTITY. For rank-based gates, use requireMinLevel instead.
//
// `protect` must run first: it sets req.user.role to the role NAME string, which
// is what we compare here — so this middleware needs no database call.
const requireRole = (...allowedRoles) =>
  catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.role) {
      throw new ApiError(401, 'Not authenticated');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `This action is restricted to: ${allowedRoles.join(', ')}`
      );
    }

    next();
  });

module.exports = { requireRole };
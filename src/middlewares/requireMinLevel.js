'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const requireMinLevel = (minLevel) =>
  catchAsync(async (req, res, next) => {
    // protect must have run first.
    if (!req.user || !req.user.roleId) {
      throw new ApiError(401, 'Not authenticated');
    }

    const role = await db.Role.findByPk(req.user.roleId);
    if (!role) {
      throw new ApiError(403, 'Role not found');
    }

    if (role.level < minLevel) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }

    req.user.level = role.level;
    next();
  });

module.exports = { requireMinLevel };
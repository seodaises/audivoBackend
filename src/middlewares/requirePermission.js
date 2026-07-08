'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const requirePermission = (permissionKey) =>
  catchAsync(async (req, res, next) => {
    if (!req.user || !req.user.roleId) {
      throw new ApiError(401, 'Not authenticated');
    }

    const role = await db.Role.findByPk(req.user.roleId, {
      include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
    });

    if (!role) {
      throw new ApiError(403, 'Role not found');
    }

    const keys = (role.permissions || []).map((p) => p.key);

    if (!keys.includes(permissionKey)) {
      throw new ApiError(403, `Missing required permission: ${permissionKey}`);
    }

    req.user.permissions = keys;
    next();
  });

module.exports = { requirePermission };
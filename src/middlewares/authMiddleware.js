'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/jwt');
const catchAsync = require('../utils/catchAsync');
const { COOKIE_NAME, clearAuthCookie } = require('../utils/authCookie');

const protect = catchAsync(async (req, res, next) => {
  // Token now travels in an httpOnly cookie (set at login), not the
  // Authorization header. cookie-parser populates req.cookies.
  const token = req.cookies ? req.cookies[COOKIE_NAME] : undefined;

  if (!token) {
    throw new ApiError(401, 'Not authenticated — no session cookie');
  }

  let payload;
  try {
    payload = verifyToken(token); // throws on invalid/expired
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token');
  }

  // payload was signed as { sub: userId, role: roleName }
  const user = await db.User.findByPk(payload.sub, {
    include: [{ model: db.Role, as: 'role' }],
  });

  if (!user) {
    throw new ApiError(401, 'User no longer exists');
  }
  
  if (user.deleted_at !== null) {
    clearAuthCookie(res);
    throw new ApiError(401, 'This account no longer exists');
  }

  if (!user.is_active) {
    throw new ApiError(403, 'Account is disabled');
  }

  // Hand the controller a trimmed identity — never the password hash.
  req.user = {
    id: user.id,
    email: user.email,
    role: user.role.name,
    roleId: user.role_id,
  };

  next();
});

module.exports = { protect };
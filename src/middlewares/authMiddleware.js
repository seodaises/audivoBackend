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

  // A JWT is a bearer token: once signed, it stays cryptographically valid until it expires. Soft-deleting the row does NOT invalidate a cookie that is already sitting in someone's browser — so without this check, a deleted user keeps full access for the remaining life of their token. authService.login already rejects deleted accounts (it checks deleted_at before issuing a token); this closes the same door on sessions that were opened BEFORE the delete happened.
  // This costs no extra query — we already loaded the row above. That is the tradeoff this middleware made from the start: it re-verifies against the DB on every request rather than trusting the token's claims alone. Having paid for that read, we may as well use it.
  // Clear the cookie on the way out. The account is gone, and there is no state in which that token becomes valid again, so leaving it in the browser only guarantees a 401 on every subsequent request.
  
  if (user.deleted_at !== null) {
    clearAuthCookie(res);
    throw new ApiError(401, 'This account no longer exists');
  }

  // Deliberately a DIFFERENT outcome from deletion:
  //   deleted  -> 401 + cookie cleared. The identity is gone; log them out.
  //   disabled -> 403, cookie kept. The identity is valid, they are just barred.
  //               An admin can flip is_active back on and the existing session
  //               resumes without a re-login.
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
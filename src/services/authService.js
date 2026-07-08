'use strict';
const db = require('../models');
const { differenceInCalendarDays } = require('date-fns');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { sendVerificationEmail, sendResetPasswordEmail } = require('./emailService');
const {
  generateVerificationToken,
  expiryFromNow,
  hashToken,
} = require('../utils/verificationToken');

const REGISTERABLE_ROLES = ['Listener', 'Artist'];
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const INACTIVITY_ROLES = ['Listener', 'Artist'];
const INACTIVITY_LIMIT_DAYS = 30;

const register = async ({ email, password, displayName, username, role = 'Listener' }) => {
  const existing = await db.User.findOne({ where: { email } });
  if (existing) throw new ApiError(409, 'Email already registered');

  if (!REGISTERABLE_ROLES.includes(role)) {
    throw new ApiError(400, 'You can only register as a Listener or Artist');
  }

  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(normalizedUsername)) {
    throw new ApiError(
      400,
      'username must be 3-20 characters: lowercase letters, numbers, or underscores'
    );
  }

  const usernameTaken = await db.User.findOne({ where: { username: normalizedUsername } });
  if (usernameTaken) throw new ApiError(409, 'Username already taken');

  const roleRow = await db.Role.findOne({ where: { name: role } });
  if (!roleRow) throw new ApiError(500, 'Role not configured');

  const password_hash = await hashPassword(password);
  const user = await db.User.create({
    email,
    password_hash,
    display_name: displayName,
    username: normalizedUsername,
    role_id: roleRow.id,
  });

  const token = generateVerificationToken();
  await db.EmailVerificationToken.create({
    user_id: user.id, token, expires_at: expiryFromNow(24),
  });

  const emailDelivery = await sendVerificationEmail({ to: user.email, token });
  return { user: publicUser(user), emailDelivery };
};

const login = async ({ email, password, ipAddress, userAgent }) => {
  const user = await db.User.findOne({
    where: { email },
    include: [
      {
        model: db.Role,
        as: 'role',
        include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
      },
    ],
  });

  if (!user) throw new ApiError(401, 'Invalid credentials');

  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid credentials');

  if (user.deleted_at !== null) throw new ApiError(401, 'Invalid credentials');

  // --- Lazy inactivity sweep -------------------------------------------------
  const roleName = user.role ? user.role.name : null;
  if (
    user.is_active &&
    INACTIVITY_ROLES.includes(roleName) &&
    user.last_login_at !== null &&
    differenceInCalendarDays(new Date(), user.last_login_at) > INACTIVITY_LIMIT_DAYS
  ) {
    user.is_active = false;
    await user.save();
    throw new ApiError(
      403,
      'Your account was deactivated after 30 days of inactivity. Please use the contact form to request reactivation.'
    );
  }
  // ---------------------------------------------------------------------------

  if (!user.is_active) throw new ApiError(403, 'Account is disabled');

  if (process.env.REQUIRE_VERIFIED_EMAIL === 'true' && !user.email_verified_at) {
    throw new ApiError(403, 'Please verify your email before logging in');
  }

  user.last_login_at = new Date();
  await user.save();

  await db.LoginHistory.create({
    user_id: user.id,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });

  const permissions = user.role && user.role.permissions
    ? user.role.permissions.map((p) => p.key)
    : [];

  const token = generateToken({ sub: user.id, role: user.role.name });
  return { token, user: publicUser(user, permissions) };
};

const verifyEmail = async (token) => {
  const record = await db.EmailVerificationToken.findOne({
    where: { token },
    include: [{ model: db.User, as: 'user' }],
  });

  if (!record) {
    throw new ApiError(400, 'Invalid verification token');
  }
  if (record.used_at !== null) {
    throw new ApiError(400, 'Token already used');
  }
  if (record.expires_at < new Date()) {
    throw new ApiError(400, 'Token has expired');
  }

  const now = new Date();
  record.used_at = now;
  await record.save();

  record.user.email_verified_at = now;
  await record.user.save();

  return { verified: true, email: record.user.email };
};


const resendVerification = async ({ email }) => {
  const user = await db.User.findOne({ where: { email } });

  if (!user || user.email_verified_at) {
    return { sent: false, verificationUrl: null };
  }
  await db.EmailVerificationToken.update(
    { used_at: new Date() },
    { where: { user_id: user.id, used_at: null } }
  );

  const token = generateVerificationToken();
  await db.EmailVerificationToken.create({
    user_id: user.id,
    token,
    expires_at: expiryFromNow(24),
  });

  const emailDelivery = await sendVerificationEmail({ to: user.email, token });
  return emailDelivery; // { sent: true } | { sent: false, verificationUrl }
};

const changePassword = async ({ userId, oldPassword, newPassword }) => {
  const user = await db.User.findByPk(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const ok = await comparePassword(oldPassword, user.password_hash);
  if (!ok) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  const same = await comparePassword(newPassword, user.password_hash);
  if (same) {
    throw new ApiError(400, 'New password must be different from the current one');
  }

  user.password_hash = await hashPassword(newPassword);
  user.must_change_password = false;
  await user.save();

  return { changed: true };
};

const forgotPassword = async ({ email }) => {
  const user = await db.User.findOne({ where: { email } });
  if (!user) return { sent: false, url: null }; // never reveal existence

  const rawToken = generateVerificationToken();
  const token_hash = hashToken(rawToken);
  await db.PasswordResetToken.create({
    user_id: user.id, token_hash, expires_at: expiryFromNow(24),
  });
  const mail = await sendResetPasswordEmail({ to: user.email, token: rawToken });
  return { sent: mail.sent, url: mail.resetUrl || null };
};

const resetPassword = async ({ token, newPassword }) => {
  const token_hash = hashToken(token);
  const record = await db.PasswordResetToken.findOne({
    where: { token_hash }, include: [{ model: db.User, as: 'user' }],
  });
  if (!record) throw new ApiError(400, 'Invalid reset token');
  if (record.used_at !== null) throw new ApiError(400, 'Reset token already used');
  if (record.expires_at < new Date()) throw new ApiError(400, 'Reset token has expired');

  const now = new Date();
  record.user.password_hash = await hashPassword(newPassword);
  await record.user.save();
  record.used_at = now; await record.save();

  await db.PasswordResetToken.update(
    { used_at: now },
    { where: { user_id: record.user_id, used_at: null } }
  );
  return { reset: true, email: record.user.email };
};

const getLoginHistory = async ({ userId, limit = 20 }) => {
  const rows = await db.LoginHistory.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit,
  });
  return rows.map((r) => ({
    id: r.id,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    at: r.created_at,
  }));
};

const getMe = async ({ userId }) => {
  const user = await db.User.findByPk(userId, {
    include: [
      {
        model: db.Role,
        as: 'role',
        include: [{ model: db.Permission, as: 'permissions', attributes: ['key'] }],
      },
    ],
  });
  if (!user) throw new ApiError(404, 'User not found');

  const permissions = user.role && user.role.permissions
    ? user.role.permissions.map((p) => p.key)
    : [];

  return publicUser(user, permissions);
};

const updateMe = async ({ userId, patch }) => {
  const user = await db.User.findByPk(userId, {
    include: [{ model: db.Role, as: 'role' }],
  });
  if (!user) throw new ApiError(404, 'User not found');

  const WRITABLE = [
    'display_name',
    'first_name',
    'last_name',
    'avatar_url',
    'gender',
    'birthday',
    'phone_number',
    'address_street',
    'address_city',
    'address_country',
    'address_postal_code',
  ];

  const incoming = {
    display_name: patch.displayName,
    first_name: patch.firstName,
    last_name: patch.lastName,
    avatar_url: patch.avatarUrl,
    gender: patch.gender,
    birthday: patch.birthday,
    phone_number: patch.phoneNumber,
    address_street: patch.addressStreet,
    address_city: patch.addressCity,
    address_country: patch.addressCountry,
    address_postal_code: patch.addressPostalCode,
  };

  for (const field of WRITABLE) {
    if (incoming[field] !== undefined) {
      // display_name is NOT NULL - guard against blanking it out.
      if (field === 'display_name') {
        const v = (incoming[field] ?? '').trim();
        if (!v) throw new ApiError(400, 'displayName cannot be empty');
        user.display_name = v;
      } else {
        user[field] = incoming[field] === '' ? null : incoming[field];
      }
    }
  }

  await user.save(); // model validators (e.g. avatar_url URL check) run here
  return publicUser(user);
};

// PATCH /auth/me/username — dedicated handle change. No rate limit (for now).
// Uniqueness (409) and format (400) are enforced; a no-op change is rejected.
const changeUsername = async ({ userId, newUsername }) => {
  const user = await db.User.findByPk(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const normalized = String(newUsername || '').trim().toLowerCase();
  if (!USERNAME_RE.test(normalized)) {
    throw new ApiError(
      400,
      'username must be 3-20 characters: lowercase letters, numbers, or underscores'
    );
  }

  // No-op guard: same handle (case-insensitive) is nothing to do.
  if (normalized === String(user.username).toLowerCase()) {
    throw new ApiError(400, 'That is already your username');
  }

  // Friendly pre-check; the DB unique index is the real guarantee.
  const taken = await db.User.findOne({ where: { username: normalized } });
  if (taken) throw new ApiError(409, 'Username already taken');

  user.username = normalized;
  await user.save();

  return { username: user.username };
};

const deleteMe = async ({ userId, password }) => {
  const user = await db.User.findByPk(userId);
  if (!user) throw new ApiError(404, 'User not found');

  // Ownership check: the account owner must confirm with their password.
  if (!password) throw new ApiError(400, 'Password is required to delete your account');
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Password is incorrect');

  // Already gone — idempotent, don't error on a double-submit.
  if (user.deleted_at !== null) return { deleted: true };

  user.deleted_at = new Date();
  await user.save();

  return { deleted: true };
};

const publicUser = (user, permissions = []) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  displayName: user.display_name,
  firstName: user.first_name ?? null,
  lastName: user.last_name ?? null,
  fullName: user.fullName ?? null, // model getter: first + last when present
  avatarUrl: user.avatar_url ?? null,
  gender: user.gender ?? null,
  birthday: user.birthday ?? null,
  phoneNumber: user.phone_number ?? null,
  address: {
    street: user.address_street ?? null,
    city: user.address_city ?? null,
    country: user.address_country ?? null,
    postalCode: user.address_postal_code ?? null,
  },
  roleId: user.role_id,
  role: user.role ? user.role.name : null, // role NAME, for the frontend
  permissions, // array of permission keys the role grants (server-trusted)
  isActive: user.is_active,
  isVerified: user.email_verified_at !== null,
  mustChangePassword: user.must_change_password,
});

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  changePassword,
  forgotPassword,
  resetPassword,
  getLoginHistory,
  getMe,
  updateMe,
  changeUsername,
  deleteMe,
};
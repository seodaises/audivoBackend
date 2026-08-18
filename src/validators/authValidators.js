'use strict';
const Joi = require('joi');

const email = Joi.string().trim().lowercase().email().max(255).messages({
  'string.email': 'email must be a valid email address',
  'string.max': 'email must be at most 255 characters',
  'string.empty': 'email is required',
  'any.required': 'email is required',
});

// The account-creation password: this is where strength is enforced. 8 is a
// deliberate minimum (the service previously enforced none). 128 cap keeps a
// giant string from ever reaching bcrypt (which silently truncates at 72 bytes
// anyway — the cap just makes the boundary explicit rather than surprising).
const strongPassword = Joi.string().min(8).max(128).messages({
  'string.min': 'password must be at least 8 characters',
  'string.max': 'password must be at most 128 characters',
  'string.empty': 'password is required',
  'any.required': 'password is required',
});

const username = Joi.string()
  .trim()
  .lowercase()
  .min(3)
  .max(20)
  .pattern(/^[a-z0-9_]+$/)
  .messages({
    'string.min': 'username must be between 3 and 20 characters',
    'string.max': 'username must be between 3 and 20 characters',
    'string.pattern.base':
      'username may contain only lowercase letters, numbers, and underscores',
    'string.empty': 'username is required',
    'any.required': 'username is required',
  });

const displayName = Joi.string().trim().max(100).messages({
  'string.max': 'displayName must be at most 100 characters',
  'string.empty': 'displayName is required',
  'any.required': 'displayName is required',
});

// Only self-service roles may be requested at registration. Anything else
// (Admin, Moderator, Super Admin) is provisioned by an admin, never self-claimed.
const registerableRole = Joi.string().valid('Listener', 'Artist').messages({
  'any.only': 'role must be either Listener or Artist',
});

// Opaque token used by verify-email / reset-password links. We only assert it's
// a non-empty string of sane length; the service verifies it against the DB.
const token = Joi.string().trim().min(10).max(512).messages({
  'string.min': 'token is invalid',
  'string.max': 'token is invalid',
  'string.empty': 'token is required',
  'any.required': 'token is required',
});

// ── Schemas, grouped by the request part they validate ───────────────────────

// POST /auth/register
const register = {
  body: Joi.object({
    email: email.required(),
    password: strongPassword.required(),
    displayName: displayName.required(),
    username: username.required(),
    role: registerableRole.optional(), // service defaults to 'Listener'
  }),
};

// POST /auth/login — existence only, NO strength rules (see file header note).
const login = {
  body: Joi.object({
    email: Joi.string().trim().lowercase().email().max(255).required().messages({
      'string.email': 'email must be a valid email address',
      'string.empty': 'email is required',
      'any.required': 'email is required',
    }),
    password: Joi.string().required().messages({
      'string.empty': 'password is required',
      'any.required': 'password is required',
    }),
  }),
};

// GET /auth/verify-email?token=...
const verifyEmail = {
  query: Joi.object({
    token: token.required(),
  }),
};

// POST /auth/resend-verification
const resendVerification = {
  body: Joi.object({
    email: email.required(),
  }),
};

// POST /auth/forgot-password
const forgotPassword = {
  body: Joi.object({
    email: email.required(),
  }),
};

// POST /auth/reset-password
const resetPassword = {
  body: Joi.object({
    token: token.required(),
    newPassword: strongPassword.required(),
  }),
};

// POST /auth/change-password (protected)
const changePassword = {
  body: Joi.object({
    oldPassword: Joi.string().required().messages({
      'string.empty': 'oldPassword is required',
      'any.required': 'oldPassword is required',
    }),
    newPassword: strongPassword.required(),
  }),
};

// PUT /auth/me — profile patch. Every field optional (it's a partial update),
// but at least one must be present, else the request is pointless. Field names
// are camelCase to match what the service's `incoming` map reads. '' is allowed
// on nullable fields because the service treats '' as "clear this to NULL".
const updateMe = {
  body: Joi.object({
    displayName: Joi.string().trim().min(1).max(100).messages({
      'string.min': 'displayName cannot be empty',
      'string.max': 'displayName must be at most 100 characters',
    }),
    firstName: Joi.string().trim().max(100).allow(''),
    lastName: Joi.string().trim().max(100).allow(''),
    avatarUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(2048).allow('').messages({
      'string.uri': 'avatarUrl must be a valid http(s) URL',
      'string.uriCustomScheme': 'avatarUrl must be a valid http(s) URL',
      'string.max': 'avatarUrl must be at most 2048 characters',
    }),
    gender: Joi.string().trim().max(30).allow(''),
    birthday: Joi.date().iso().allow('', null).messages({
      'date.format': 'birthday must be a valid date (YYYY-MM-DD)',
    }),
    phoneNumber: Joi.string().trim().max(30).allow(''),
    addressStreet: Joi.string().trim().max(255).allow(''),
    addressCity: Joi.string().trim().max(120).allow(''),
    addressCountry: Joi.string().trim().max(120).allow(''),
    addressPostalCode: Joi.string().trim().max(20).allow(''),
  })
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' }),
};

// PATCH /auth/me/username
const changeUsername = {
  body: Joi.object({
    username: username.required(),
  }),
};

// DELETE /auth/me — password confirms ownership. Presence only; the service
// compares it against the stored hash.
const deleteMe = {
  body: Joi.object({
    password: Joi.string().required().messages({
      'string.empty': 'password is required to delete your account',
      'any.required': 'password is required to delete your account',
    }),
  }),
};

module.exports = {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  updateMe,
  changeUsername,
  deleteMe,
};
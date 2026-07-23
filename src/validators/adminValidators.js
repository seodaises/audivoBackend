'use strict';
const Joi = require('joi');
const { idParam, pagination } = require('./commonValidators');

// ─────────────────────────────────────────────────────────────────────────────
// Admin validation. This is the most authority-sensitive surface, so the split
// between SHAPE (here) and AUTHORIZATION (service) matters most:
//
//   Joi here:   "is 'role' one of the five real role names?"  (400 on a typo)
//   Service:    "may THIS actor assign that role to THAT target?" — level checks,
//               self-role guard, Super-Admin lock. Those stay in adminService as
//               403s, because only the service knows the actor's level and the
//               target's current role.
// ─────────────────────────────────────────────────────────────────────────────

// The five real roles. Validating the NAME is shape; whether it's ASSIGNABLE by
// the caller is the service's job.
const roleName = Joi.string()
  .valid('Super Admin', 'Admin', 'Moderator', 'Artist', 'Listener')
  .messages({
    'any.only': 'role must be a valid role name',
    'any.required': 'role is required',
  });

// Permission keys are lowercase snake_case tokens (manage_users, view_analytics…).
const permissionKey = Joi.string()
  .trim()
  .pattern(/^[a-z][a-z0-9_]*$/)
  .max(64)
  .required()
  .messages({
    'string.pattern.base': 'permKey must be a lowercase snake_case permission key',
    'any.required': 'permKey is required',
  });

// GET /admin/users
const listUsers = { query: pagination };

// GET /admin/admins
const listAdmins = { query: pagination };

// GET /admin/users/search?username=
const searchByUsername = {
  query: Joi.object({
    username: Joi.string().trim().min(1).max(20).required().messages({
      'string.empty': 'username query param is required',
      'any.required': 'username query param is required',
    }),
  }).unknown(true),
};

// PATCH /admin/users/:id/role
const changeUserRole = {
  params: idParam,
  body: Joi.object({ role: roleName.required() }),
};

// POST /admin/users — create an Admin account (no password: it's generated).
const createUser = {
  body: Joi.object({
    email: Joi.string().trim().lowercase().email().max(255).required().messages({
      'string.email': 'email must be a valid email address',
      'any.required': 'email is required',
    }),
    displayName: Joi.string().trim().min(1).max(100).required().messages({
      'string.empty': 'displayName is required',
      'any.required': 'displayName is required',
    }),
    username: Joi.string().trim().lowercase().min(3).max(20).pattern(/^[a-z0-9_]+$/).required().messages({
      'string.pattern.base': 'username may contain only lowercase letters, numbers, and underscores',
      'any.required': 'username is required',
    }),
  }),
};

// PATCH /admin/users/:id/status — must be a real boolean.
const setStatus = {
  params: idParam,
  body: Joi.object({
    isActive: Joi.boolean().required().messages({
      'boolean.base': 'isActive must be true or false',
      'any.required': 'isActive must be true or false',
    }),
  }),
};

// PATCH /admin/users/:id/delete
const deleteUser = { params: idParam };

// POST/DELETE /admin/roles/:id/permissions/:permKey
const rolePermission = {
  params: Joi.object({
    id: Joi.number().integer().positive().required().messages({
      'number.base': 'role id must be a number',
      'any.required': 'role id is required',
    }),
    permKey: permissionKey,
  }),
};

// GET /admin/contact-messages
const listContactMessages = {
  query: pagination.keys({
    status: Joi.string().valid('new', 'read', 'resolved').optional().messages({
      'any.only': 'status must be one of: new, read, resolved',
    }),
  }),
};

// PATCH /admin/contact-messages/:id/status
const setContactStatus = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid('new', 'read', 'resolved').required().messages({
      'any.only': 'status must be one of: new, read, resolved',
      'any.required': 'status is required',
    }),
  }),
};

module.exports = {
  listUsers,
  listAdmins,
  searchByUsername,
  changeUserRole,
  createUser,
  setStatus,
  deleteUser,
  rolePermission,
  listContactMessages,
  setContactStatus,
};

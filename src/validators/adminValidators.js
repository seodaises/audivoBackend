'use strict';
const Joi = require('joi');
const { idParam, pagination } = require('./commonValidators');

const roleName = Joi.string()
  .valid('Super Admin', 'Admin', 'Moderator', 'Artist', 'Listener')
  .messages({
    'any.only': 'role must be a valid role name',
    'any.required': 'role is required',
  });

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

// GET /admin/active-sessions & /admin/active-sessions/count 
const activeSessionsWindow = {
  query: Joi.object({
    minutes: Joi.number().integer().min(1).max(1440).optional().messages({
      'number.base': 'minutes must be a number',
      'number.min': 'minutes must be at least 1',
      'number.max': 'minutes must be at most 1440 (24 hours)',
    }),
  }),
};

// GET /admin/admins
const listAdmins = { query: pagination };

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
  changeUserRole,
  createUser,
  setStatus,
  deleteUser,
  rolePermission,
  activeSessionsWindow,
  listContactMessages,
  setContactStatus,
};
'use strict';
const Joi = require('joi');

// Shared, reusable schema fragments used across many domains. Defining them once
// keeps pagination and :id rules identical everywhere instead of drifting.

// A positive integer route param called `id`. Reused by every /:id route.
const idParam = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'id must be a number',
    'number.positive': 'id must be a positive number',
    'any.required': 'id is required',
  }),
});

// Standard list pagination. Services already clamp these, but validating here
// rejects obvious garbage (limit=-5, page=abc) early with a clean message and
// documents the accepted range. convert:true turns "2" into 2.
const pagination = Joi.object({
  page: Joi.number().integer().min(1).optional().messages({
    'number.base': 'page must be a number',
    'number.min': 'page must be at least 1',
  }),
  limit: Joi.number().integer().min(1).max(100).optional().messages({
    'number.base': 'limit must be a number',
    'number.min': 'limit must be at least 1',
    'number.max': 'limit must be at most 100',
  }),
}).unknown(true); // tolerate extra query keys on list routes (e.g. search, sort)

// Pagination + a free-text search term (discovery feeds).
const paginationWithSearch = pagination.keys({
  search: Joi.string().trim().max(255).allow('').optional(),
});

// A bare limit-only query (history endpoints that page by limit alone).
const limitOnly = Joi.object({
  limit: Joi.number().integer().min(1).max(100).optional().messages({
    'number.base': 'limit must be a number',
    'number.max': 'limit must be at most 100',
  }),
}).unknown(true);

module.exports = { idParam, pagination, paginationWithSearch, limitOnly };
'use strict';
const Joi = require('joi');

// Artist profile: stage_name STRING(100) NOT NULL, bio TEXT nullable,
// avatar_url STRING(2048) http(s) nullable. Uniqueness ("one profile per user",
// 409) and the verified-artist gate stay in artistProfileService.

const stageName = Joi.string().trim().min(1).max(100).messages({
  'string.empty': 'stageName is required',
  'string.max': 'stageName must be at most 100 characters',
  'any.required': 'stageName is required',
});

const bio = Joi.string().trim().max(5000).allow('', null).messages({
  'string.max': 'bio must be at most 5000 characters',
});

const avatarUrl = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(2048)
  .allow('', null)
  .messages({
    'string.uri': 'avatarUrl must be a valid http(s) URL',
    'string.uriCustomScheme': 'avatarUrl must be a valid http(s) URL',
    'string.max': 'avatarUrl must be at most 2048 characters',
  });

// POST /artist/profile
const createMyProfile = {
  body: Joi.object({
    stageName: stageName.required(),
    bio: bio.optional(),
    avatarUrl: avatarUrl.optional(),
  }),
};

// PATCH /artist/profile — partial, at least one field.
const updateMyProfile = {
  body: Joi.object({
    stageName: stageName.optional(),
    bio: bio.optional(),
    avatarUrl: avatarUrl.optional(),
  })
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' }),
};

// GET /catalog/artists/:username — public artist page.
const getPublicProfile = {
  params: Joi.object({
    username: Joi.string().trim().lowercase().min(3).max(20).pattern(/^[a-z0-9_]+$/).required().messages({
      'string.pattern.base': 'username is invalid',
      'any.required': 'username is required',
    }),
  }),
};

// GET /artist/analytics/tracks?range=30d|all
const myTrackPerformance = {
  query: Joi.object({
    range: Joi.string().valid('30d', 'all').optional().messages({
      'any.only': "range must be '30d' or 'all'",
    }),
  }).unknown(true),
};

module.exports = {
  createMyProfile,
  updateMyProfile,
  getPublicProfile,
  myTrackPerformance,
};

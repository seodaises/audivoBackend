'use strict';
const Joi = require('joi');

// ─────────────────────────────────────────────────────────────────────────────
// Album validation schemas.
//
// title        albums.title        STRING(255) NOT NULL
// coverUrl     albums.cover_url     STRING(2048), http(s) (model validates URL)
// description  albums.description   TEXT (no length cap — but we set a sane 5000)
// releaseDate  albums.release_date  DATEONLY ('YYYY-MM-DD') — display only
// isSingle     albums.is_single     BOOLEAN
// status       via albumService.VALID_STATUSES = draft|published|archived
// releaseAt    albums.release_at    DATE — future instant for a scheduled release
// ─────────────────────────────────────────────────────────────────────────────

const idParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required().messages({
      'number.base': 'id must be a number',
      'any.required': 'id is required',
    }),
  }),
};

const title = Joi.string().trim().min(1).max(255).messages({
  'string.empty': 'title is required',
  'string.max': 'title must be at most 255 characters',
  'any.required': 'title is required',
});

const coverUrl = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(2048)
  .allow('', null)
  .messages({
    'string.uri': 'coverUrl must be a valid http(s) URL',
    'string.uriCustomScheme': 'coverUrl must be a valid http(s) URL',
    'string.max': 'coverUrl must be at most 2048 characters',
  });

const description = Joi.string().trim().max(5000).allow('', null).messages({
  'string.max': 'description must be at most 5000 characters',
});

// DATEONLY: accept 'YYYY-MM-DD'. Joi's date with a strict ISO check keeps it clean.
const releaseDate = Joi.date().iso().allow('', null).messages({
  'date.format': 'releaseDate must be a valid date (YYYY-MM-DD)',
  'date.base': 'releaseDate must be a valid date',
});

const status = Joi.string().valid('draft', 'published', 'archived').messages({
  'any.only': 'status must be one of: draft, published, archived',
  'any.required': 'status is required',
});

// POST /albums
const createAlbum = {
  body: Joi.object({
    title: title.required(),
    coverUrl: coverUrl.optional(),
    description: description.optional(),
    releaseDate: releaseDate.optional(),
    isSingle: Joi.boolean().optional(),
  }),
};

// PATCH /albums/:id — partial; at least one field.
const updateAlbum = {
  params: idParam.params,
  body: Joi.object({
    title: title.optional(),
    coverUrl: coverUrl.optional(),
    description: description.optional(),
    releaseDate: releaseDate.optional(),
  })
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' }),
};

// PATCH /albums/:id/status
const updateStatus = {
  params: idParam.params,
  body: Joi.object({ status: status.required() }),
};

// PATCH /albums/:id/schedule — releaseAt must be a real future instant.
const scheduleRelease = {
  params: idParam.params,
  body: Joi.object({
    releaseAt: Joi.date().iso().greater('now').required().messages({
      'date.greater': 'releaseAt must be a future date/time',
      'date.base': 'releaseAt must be a valid date/time',
      'any.required': 'releaseAt is required',
    }),
  }),
};

// DELETE /albums/:id/schedule
const cancelSchedule = { params: idParam.params };

// GET /albums/:id
const getAlbum = { params: idParam.params };

// DELETE /albums/:id — optional password confirm.
const deleteAlbum = {
  params: idParam.params,
  body: Joi.object({
    password: Joi.string().allow('', null).optional(),
  }),
};

module.exports = {
  createAlbum,
  updateAlbum,
  updateStatus,
  scheduleRelease,
  cancelSchedule,
  getAlbum,
  deleteAlbum,
};

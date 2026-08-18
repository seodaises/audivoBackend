'use strict';
const Joi = require('joi');

// ─────────────────────────────────────────────────────────────────────────────
// Song validation schemas.
//
// A wrinkle unique to songs: the upload route is MULTIPART. Every body value
// arrives as a STRING (multipart has no types), so these schemas lean on
// convert:true to coerce "3" -> 3. Two fields need special care:
//
//   • The audio FILE is not validated here — Joi never sees req.file. The
//     "file is required" check stays in the controller, where multer put it.
//   • genreIds on UPLOAD may be an array, a comma-string, or a JSON string —
//     the service's normalizeGenreIds() is built to swallow all three. So we
//     validate it loosely (allow string or array) and let the service parse.
//     On the dedicated PUT /:id/genres route we're stricter (real array).
//
// status values mirror songService.VALID_STATUSES = draft|published|archived
// (note: NOT 'scheduled' — that's an album-only concept).
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

const trackNumber = Joi.number().integer().min(1).max(10000).messages({
  'number.base': 'trackNumber must be a whole number',
  'number.min': 'trackNumber must be at least 1',
});

const durationSeconds = Joi.number().integer().min(1).max(86400).messages({
  'number.base': 'durationSeconds must be a whole number',
  'number.min': 'durationSeconds must be at least 1',
});

// Loose genreIds for multipart upload: array of ints, OR a string the service
// will split/parse. Empty/absent is fine (a song can start genre-less).
const genreIdsLoose = Joi.alternatives().try(
  Joi.array().items(Joi.number().integer().positive()),
  Joi.string().allow('') // "1,2,3" or "[1,2,3]" — service normalizes
);

// Strict genreIds for the dedicated replace-genres endpoint.
const genreIdsStrict = Joi.array()
  .items(Joi.number().integer().positive())
  .required()
  .messages({
    'array.base': 'genreIds must be an array',
    'any.required': 'genreIds must be an array',
  });

const status = Joi.string().valid('draft', 'published', 'archived').messages({
  'any.only': 'status must be one of: draft, published, archived',
  'any.required': 'status is required',
});

// POST /songs  (multipart: validate runs AFTER multer)
const uploadSong = {
  body: Joi.object({
    title: title.required(),
    albumId: Joi.number().integer().positive().required().messages({
      'number.base': 'albumId must be a number',
      'any.required': 'albumId is required',
    }),
    trackNumber: trackNumber.optional(),
    durationSeconds: durationSeconds.optional(),
    genreIds: genreIdsLoose.optional(),
  }),
};

// PATCH /songs/:id  — metadata edit, all fields optional but at least one.
const updateSong = {
  params: idParam.params,
  body: Joi.object({
    title: title.optional(),
    trackNumber: trackNumber.allow(null).optional(),
    durationSeconds: durationSeconds.allow(null).optional(),
  })
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' }),
};

// PATCH /songs/:id/status
const updateStatus = {
  params: idParam.params,
  body: Joi.object({ status: status.required() }),
};

// PUT /songs/:id/genres  — strict array replace.
const setGenres = {
  params: idParam.params,
  body: Joi.object({ genreIds: genreIdsStrict }),
};

// GET /songs/:id/file
const serveFile = { params: idParam.params };

// DELETE /songs/:id  — optional password confirm (service decides if required).
const deleteSong = {
  params: idParam.params,
  body: Joi.object({
    password: Joi.string().allow('', null).optional(),
  }),
};

// POST /songs/:id/play
const recordPlay = {
  params: idParam.params,
  body: Joi.object({
    msPlayed: Joi.number().integer().min(0).max(86400000).optional().messages({
      'number.base': 'msPlayed must be a whole number of milliseconds',
    }),
    source: Joi.string().trim().max(50).optional(),
  }),
};

module.exports = {
  uploadSong,
  updateSong,
  updateStatus,
  setGenres,
  serveFile,
  deleteSong,
  recordPlay,
};

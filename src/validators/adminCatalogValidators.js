'use strict';
const Joi = require('joi');
const { idParam, pagination } = require('./commonValidators');

// Admin catalog: status enum is draft|published|archived (adminCatalogService
// .VALID_STATUSES) — same three as the artist side; no 'scheduled' here.
const status = Joi.string().valid('draft', 'published', 'archived').messages({
  'any.only': 'status must be one of: draft, published, archived',
  'any.required': 'status is required',
});

// List filters share page/limit/search, plus an optional status filter that,
// if present, must be a real status (the service ignores invalid ones, but a
// clean 400 is friendlier than a silently-ignored filter).
const listFilter = {
  query: pagination.keys({
    status: status.optional(),
    search: Joi.string().trim().max(255).allow('').optional(),
  }),
};

// GET /admin/catalog/artists?verified=true|false
const listAllArtists = {
  query: pagination.keys({
    verified: Joi.boolean().optional().messages({
      'boolean.base': 'verified must be true or false',
    }),
    search: Joi.string().trim().max(255).allow('').optional(),
  }),
};

// PATCH /admin/catalog/songs/:id/status  &  albums/:id/status
const setSongStatus = { params: idParam, body: Joi.object({ status: status.required() }) };
const setAlbumStatus = { params: idParam, body: Joi.object({ status: status.required() }) };

// PATCH /admin/catalog/artists/:id/verify — isVerified optional (defaults true).
const verifyArtist = {
  params: idParam,
  body: Joi.object({
    isVerified: Joi.boolean().optional().messages({
      'boolean.base': 'isVerified must be true or false',
    }),
  }),
};

// DELETE /admin/catalog/songs/:id  &  albums/:id
const deleteSong = { params: idParam };
const deleteAlbum = { params: idParam };

module.exports = {
  listAllSongs: listFilter,
  listAllAlbums: listFilter,
  listAllArtists,
  setSongStatus,
  setAlbumStatus,
  verifyArtist,
  deleteSong,
  deleteAlbum,
};

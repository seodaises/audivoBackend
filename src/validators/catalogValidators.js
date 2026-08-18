'use strict';
const Joi = require('joi');
const { pagination } = require('./commonValidators');

// Public browse/search — all reads, all query-driven. No bodies.

// GET /catalog/songs?page=&limit=&genre=
const browseSongs = {
  query: pagination.keys({
    genre: Joi.alternatives()
      .try(Joi.number().integer().positive(), Joi.string().trim().max(100))
      .optional(), // genre id OR name; service resolves either
  }),
};

// GET /catalog/albums?page=&limit=&genre=
const browseAlbums = {
  query: pagination.keys({
    genre: Joi.alternatives()
      .try(Joi.number().integer().positive(), Joi.string().trim().max(100))
      .optional(),
  }),
};
// GET /catalog/artists
const browseArtists = { query: pagination };

// GET /catalog/search?q=&page=&limit=
const search = {
  query: pagination.keys({
    q: Joi.string().trim().min(1).max(255).required().messages({
      'string.empty': 'search query q is required',
      'any.required': 'search query q is required',
    }),
  }),
};

// GET /catalog/songs/:publicId — single song by its opaque public_id (UUID).
const getSong = {
  params: Joi.object({
    publicId: Joi.string().guid().required().messages({
      'string.guid': 'publicId must be a valid public id',
      'string.empty': 'publicId is required',
      'any.required': 'publicId is required',
    }),
  }),
};

module.exports = { browseSongs, browseAlbums, browseArtists, search, getSong };
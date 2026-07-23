'use strict';
const Joi = require('joi');
const { idParam, pagination, paginationWithSearch } = require('./commonValidators');

// Playlist: title STRING(255) NOT NULL, description TEXT nullable,
// is_public BOOLEAN. Track ops key off playlist_songs row ids, not song ids.

const title = Joi.string().trim().min(1).max(255).messages({
  'string.empty': 'Title is required',
  'string.max': 'Title must be 255 characters or fewer',
  'any.required': 'Title is required',
});

const description = Joi.string().trim().max(5000).allow('', null).messages({
  'string.max': 'description must be at most 5000 characters',
});

// The service coerces isPublic with `=== true || === 'true'`, so accept both a
// real boolean and the string forms a form/query might send.
const isPublic = Joi.boolean().optional();

// :id and :trackId together (track sub-routes).
const idAndTrackParams = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'playlist id must be a number',
    'any.required': 'playlist id is required',
  }),
  trackId: Joi.number().integer().positive().required().messages({
    'number.base': 'trackId must be a number',
    'any.required': 'trackId is required',
  }),
});

// POST /playlists
const createPlaylist = {
  body: Joi.object({
    title: title.required(),
    description: description.optional(),
    isPublic: isPublic,
  }),
};

// GET /playlists
const listMyPlaylists = { query: pagination };

// GET /playlists/public
const listPublicPlaylists = { query: paginationWithSearch };

// GET /playlists/:id
const getPlaylist = { params: idParam, query: pagination };

// PATCH /playlists/:id — partial update, at least one field.
const updatePlaylist = {
  params: idParam,
  body: Joi.object({
    title: title.optional(),
    description: description.optional(),
    isPublic: isPublic,
  })
    .min(1)
    .messages({ 'object.min': 'Provide at least one field to update' }),
};

// DELETE /playlists/:id
const deletePlaylist = { params: idParam };

// POST /playlists/:id/tracks
const addTrack = {
  params: idParam,
  body: Joi.object({
    songId: Joi.number().integer().positive().required().messages({
      'number.base': 'songId must be a number',
      'any.required': 'songId is required',
    }),
    afterPlaylistSongId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'afterPlaylistSongId must be a number',
    }),
  }),
};

// DELETE /playlists/:id/tracks/:trackId
const removeTrack = { params: idAndTrackParams };

// PATCH /playlists/:id/tracks/:trackId/move
const moveTrack = {
  params: idAndTrackParams,
  body: Joi.object({
    afterPlaylistSongId: Joi.number().integer().positive().allow(null).optional().messages({
      'number.base': 'afterPlaylistSongId must be a number',
    }),
  }),
};

module.exports = {
  createPlaylist,
  listMyPlaylists,
  listPublicPlaylists,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrack,
  removeTrack,
  moveTrack,
};

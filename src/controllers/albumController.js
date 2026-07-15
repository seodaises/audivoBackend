'use strict';
const albumService = require('../services/albumService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

// POST /api/albums  — create an album owned by the caller's artist profile.
const createAlbum = catchAsync(async (req, res) => {
  const { title, coverUrl, description, releaseDate, isSingle } = req.body || {};
  if (!title) throw new ApiError(400, 'title is required');

  const result = await albumService.createAlbum({
    actor: req.user,
    title,
    coverUrl,
    description,
    releaseDate,
    isSingle,
  });
  return success(res, 201, 'Album created', result);
});

// PATCH /api/albums/:id  — edit album fields (ownership enforced in service).
const updateAlbum = catchAsync(async (req, res) => {
  const albumId = req.params.id;
  const { title, coverUrl, description, releaseDate } = req.body || {};
  const result = await albumService.updateAlbum({
    actor: req.user,
    albumId,
    title,
    coverUrl,
    description,
    releaseDate,
  });
  return success(res, 200, 'Album updated', result);
});

// PATCH /api/albums/:id/status  — move draft -> published -> archived.
const updateStatus = catchAsync(async (req, res) => {
  const albumId = req.params.id;
  const { status } = req.body || {};
  if (!status) throw new ApiError(400, 'status is required');

  const result = await albumService.setStatus({
    actor: req.user,
    albumId,
    status,
  });
  return success(res, 200, 'Album status updated', result);
});

// GET /api/albums/:id  — visibility-gated: owner sees own drafts, others published-only.
const getAlbum = catchAsync(async (req, res) => {
  const albumId = req.params.id;
  const result = await albumService.getAlbumById({
    actor: req.user, // may be undefined for public reads; service handles both
    albumId,
  });
  return success(res, 200, 'Album retrieved', result);
});

// DELETE /api/albums/:id  — hard delete, CASCADING to every song in the album
// (rows, genre links, and audio files). Owner only.
const deleteAlbum = catchAsync(async (req, res) => {
  const result = await albumService.deleteAlbum({
    actor: req.user,
    albumId: req.params.id,
    password: req.body?.password,
  });
  return success(res, 200, 'Album deleted', result);
});

module.exports = {
  createAlbum,
  updateAlbum,
  updateStatus,
  getAlbum,
  deleteAlbum,
};
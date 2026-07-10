'use strict';
const adminCatalogService = require('../services/adminCatalogService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const listAllSongs = catchAsync(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await adminCatalogService.listAllSongs({ page, limit, status });
  return success(res, 200, 'Songs retrieved', result);
});

const listAllAlbums = catchAsync(async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await adminCatalogService.listAllAlbums({ page, limit, status });
  return success(res, 200, 'Albums retrieved', result);
});

const adminSetSongStatus = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const { status } = req.body || {};
  if (!status) throw new ApiError(400, 'status is required');
  const result = await adminCatalogService.setSongStatus({ actor: req.user, songId, status });
  return success(res, 200, 'Song status updated', result);
});

const adminSetAlbumStatus = catchAsync(async (req, res) => {
  const albumId = req.params.id;
  const { status } = req.body || {};
  if (!status) throw new ApiError(400, 'status is required');
  const result = await adminCatalogService.setAlbumStatus({ actor: req.user, albumId, status });
  return success(res, 200, 'Album status updated', result);
});

module.exports = { listAllSongs, listAllAlbums, adminSetSongStatus, adminSetAlbumStatus };
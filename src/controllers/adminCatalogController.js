'use strict';
const adminCatalogService = require('../services/adminCatalogService');
const artistProfileService = require('../services/artistProfileService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const listAllSongs = catchAsync(async (req, res) => {
  const { page, limit, status, search } = req.query;
  const result = await adminCatalogService.listAllSongs({ page, limit, status, search });
  return success(res, 200, 'Songs retrieved', result);
});

const listAllAlbums = catchAsync(async (req, res) => {
  const { page, limit, status, search } = req.query;
  const result = await adminCatalogService.listAllAlbums({ page, limit, status, search });
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

// GET /admin/catalog/artists?verified=true|false  — list artist profiles for the manage-artists page. Omit `verified` for all; pass false to see the approval queue (unverified artists awaiting verification).
const listAllArtists = catchAsync(async (req, res) => {
  const { page, limit, verified, search } = req.query;
  const result = await adminCatalogService.listAllArtists({ page, limit, verified, search });
  return success(res, 200, 'Artists retrieved', result);
});

// PATCH /admin/catalog/artists/:id/verify  { isVerified?: boolean } Flips an artist's verified flag. Defaults to verifying (true) when the body omits isVerified — the common case is "approve this artist." Pass { isVerified: false } to revoke. Replaces the manual SQL is_verified flip.
const adminVerifyArtist = catchAsync(async (req, res) => {
  const artistProfileId = req.params.id;
  const { isVerified } = req.body || {};
  const value = isVerified === undefined ? true : Boolean(isVerified);
  const result = await artistProfileService.setVerified({ artistProfileId, isVerified: value });
  return success(res, 200, value ? 'Artist verified' : 'Artist unverified', result);
});

module.exports = {
  listAllSongs,
  listAllAlbums,
  listAllArtists,
  adminSetSongStatus,
  adminSetAlbumStatus,
  adminVerifyArtist,
};
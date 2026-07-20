'use strict';
const socialService = require('../services/socialService');
const playService = require('../services/playService');
const commentService = require('../services/commentService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// ── Likes ────────────────────────────────────────────────────────────────────
const likeSong = catchAsync(async (req, res) => {
  const result = await socialService.likeSong({ actor: req.user, songId: req.params.id });
  return success(res, 201, 'Song liked', result);
});

const unlikeSong = catchAsync(async (req, res) => {
  const result = await socialService.unlikeSong({ actor: req.user, songId: req.params.id });
  return success(res, 200, 'Song unliked', result);
});

const listLikedSongs = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.listLikedSongs({ actor: req.user, page, limit });
  return success(res, 200, 'Liked songs', result);
});

// ── Saves ────────────────────────────────────────────────────────────────────
const saveSong = catchAsync(async (req, res) => {
  const result = await socialService.saveSong({ actor: req.user, songId: req.params.id });
  return success(res, 201, 'Song saved', result);
});

const unsaveSong = catchAsync(async (req, res) => {
  const result = await socialService.unsaveSong({ actor: req.user, songId: req.params.id });
  return success(res, 200, 'Song removed from library', result);
});

const listSavedSongs = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.listSavedSongs({ actor: req.user, page, limit });
  return success(res, 200, 'Saved songs', result);
});

const saveAlbum = catchAsync(async (req, res) => {
  const result = await socialService.saveAlbum({ actor: req.user, albumId: req.params.id });
  return success(res, 201, 'Album saved', result);
});

const unsaveAlbum = catchAsync(async (req, res) => {
  const result = await socialService.unsaveAlbum({ actor: req.user, albumId: req.params.id });
  return success(res, 200, 'Album removed from library', result);
});

const listSavedAlbums = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.listSavedAlbums({ actor: req.user, page, limit });
  return success(res, 200, 'Saved albums', result);
});

// ── Follows ──────────────────────────────────────────────────────────────────
const followArtist = catchAsync(async (req, res) => {
  const result = await socialService.followArtist({
    actor: req.user,
    artistProfileId: req.params.id,
  });
  return success(res, 201, 'Artist followed', result);
});

const unfollowArtist = catchAsync(async (req, res) => {
  const result = await socialService.unfollowArtist({
    actor: req.user,
    artistProfileId: req.params.id,
  });
  return success(res, 200, 'Artist unfollowed', result);
});

const listFollowedArtists = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.listFollowedArtists({ actor: req.user, page, limit });
  return success(res, 200, 'Followed artists', result);
});

const listMyFollowers = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.listMyFollowers({ actor: req.user, page, limit });
  return success(res, 200, 'Your followers', result);
});

// ── Status ───────────────────────────────────────────────────────────────────
const getSongStatus = catchAsync(async (req, res) => {
  const result = await socialService.getSongStatus({ actor: req.user, songId: req.params.id });
  return success(res, 200, 'Song status', result);
});

const getAlbumStatus = catchAsync(async (req, res) => {
  const result = await socialService.getAlbumStatus({ actor: req.user, albumId: req.params.id });
  return success(res, 200, 'Album status', result);
});

const getArtistStatus = catchAsync(async (req, res) => {
  const result = await socialService.getArtistStatus({
    actor: req.user,
    artistProfileId: req.params.id,
  });
  return success(res, 200, 'Artist status', result);
});

// ── Listening history + my comments ──────────────────────────────────────────
const listRecentlyPlayed = catchAsync(async (req, res) => {
  const result = await playService.getRecentlyPlayed({ actor: req.user, limit: req.query.limit });
  return success(res, 200, 'Recently played', result);
});

const listMostPlayed = catchAsync(async (req, res) => {
  const result = await playService.getMostPlayed({ actor: req.user, limit: req.query.limit });
  return success(res, 200, 'Most played', result);
});

const listMyComments = catchAsync(async (req, res) => {
  const result = await commentService.getMyComments({
    actor: req.user,
    page: req.query.page,
    limit: req.query.limit,
  });
  return success(res, 200, 'My comments', result);
});

module.exports = {
  likeSong,
  unlikeSong,
  listLikedSongs,
  saveSong,
  unsaveSong,
  listSavedSongs,
  saveAlbum,
  unsaveAlbum,
  listSavedAlbums,
  followArtist,
  unfollowArtist,
  listFollowedArtists,
  listMyFollowers,
  getSongStatus,
  getAlbumStatus,
  getArtistStatus,
  listRecentlyPlayed,
  listMostPlayed,
  listMyComments,
};
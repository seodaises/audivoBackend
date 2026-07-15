'use strict';
const playlistService = require('../services/playlistService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

const createPlaylist = catchAsync(async (req, res) => {
  const { title, description, isPublic } = req.body || {};
  const result = await playlistService.createPlaylist({
    actor: req.user,
    title,
    description,
    isPublic,
  });
  return success(res, 201, 'Playlist created', result);
});

const listMyPlaylists = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await playlistService.listMyPlaylists({ actor: req.user, page, limit });
  return success(res, 200, 'Playlists', result);
});

// GET /api/playlists/public?page=&limit=&search=
// Discovery feed: all public playlists from anyone, searchable by title.
const listPublicPlaylists = catchAsync(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await playlistService.listPublicPlaylists({
    actor: req.user,
    page,
    limit,
    search,
  });
  return success(res, 200, 'Public playlists', result);
});

const getPlaylist = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await playlistService.getPlaylist({
    actor: req.user,
    playlistId: req.params.id,
    page,
    limit,
  });
  return success(res, 200, 'Playlist', result);
});

const updatePlaylist = catchAsync(async (req, res) => {
  const { title, description, isPublic } = req.body || {};
  const result = await playlistService.updatePlaylist({
    actor: req.user,
    playlistId: req.params.id,
    title,
    description,
    isPublic,
  });
  return success(res, 200, 'Playlist updated', result);
});

const deletePlaylist = catchAsync(async (req, res) => {
  const result = await playlistService.deletePlaylist({
    actor: req.user,
    playlistId: req.params.id,
  });
  return success(res, 200, 'Playlist deleted', result);
});

// POST /api/playlists/:id/tracks
// body: { songId, afterPlaylistSongId? }
// Omit afterPlaylistSongId to append to the end.
const addTrack = catchAsync(async (req, res) => {
  const { songId, afterPlaylistSongId } = req.body || {};
  const result = await playlistService.addTrack({
    actor: req.user,
    playlistId: req.params.id,
    songId,
    afterPlaylistSongId,
  });
  return success(res, 201, 'Track added', result);
});

// DELETE /api/playlists/:id/tracks/:trackId
// trackId is the playlist_songs row id, NOT the song id — a playlist may hold
// the same song twice, so the song id alone cannot identify which one to remove.
const removeTrack = catchAsync(async (req, res) => {
  const result = await playlistService.removeTrack({
    actor: req.user,
    playlistId: req.params.id,
    playlistSongId: req.params.trackId,
  });
  return success(res, 200, 'Track removed', result);
});

// PATCH /api/playlists/:id/tracks/:trackId/move
// body: { afterPlaylistSongId }  — omit/null to move to the front.
const moveTrack = catchAsync(async (req, res) => {
  const { afterPlaylistSongId } = req.body || {};
  const result = await playlistService.moveTrack({
    actor: req.user,
    playlistId: req.params.id,
    playlistSongId: req.params.trackId,
    afterPlaylistSongId,
  });
  return success(res, 200, 'Track moved', result);
});

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
'use strict';
const lyricsService = require('../services/lyricsService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// POST /api/songs/:id/lyrics/generate
// RBAC-gated by requirePermission('generate_lyrics') at the route level;
// ownership (own songs only) is enforced inside lyricsService.
// 202, not 200/201: nothing is "created" synchronously here — the job is
// queued and the worker does the actual work.
const generateLyrics = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const result = await lyricsService.requestGeneration({ actor: req.user, songId });
  return success(res, 202, 'Lyrics generation queued', result);
});

// PATCH /api/songs/:id/lyrics
// Same 'generate_lyrics' permission as generating — editing an AI draft is
// the same "artist manages their own song's lyrics" capability, not a
// separate RBAC concern. Ownership (own songs only) is enforced inside
// lyricsService, same pattern as every other lyrics route.
const updateLyrics = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const result = await lyricsService.updateLyrics({
    actor: req.user,
    songId,
    lines: req.body.lines,
  });
  return success(res, 200, 'Lyrics updated', result);
});

// GET /api/songs/:id/lyrics
// Owner-only status/result check for now — see getOwnedLyrics in
// lyricsService for why this isn't the public listener-facing read path.
const getLyrics = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const result = await lyricsService.getOwnedLyrics({ actor: req.user, songId });
  return success(res, 200, 'Lyrics status', result);
});

// GET /api/songs/:id/lyrics/public
// Any authenticated listener, published songs only — see getPublicLyrics
// in lyricsService for the full reasoning on why this is separate from
// the owner-only getLyrics above.
const getPublicLyrics = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const result = await lyricsService.getPublicLyrics({ songId });
  return success(res, 200, 'Lyrics', result);
});

module.exports = { generateLyrics, updateLyrics, getLyrics, getPublicLyrics };
'use strict';
const songService = require('../services/songService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');
const playService = require('../services/playService');

// POST /api/songs  — multipart upload: audio file (multer) + metadata.
// multer has already written the file to disk and populated req.file by now.
const uploadSong = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'audio file is required');

  const { title, albumId, trackNumber, durationSeconds, genreIds } = req.body;

  const result = await songService.createSong({
    actor: req.user,
    title,
    albumId,
    trackNumber,
    durationSeconds,
    genreIds, // may arrive as array or comma string; service normalizes
    file: req.file, // { filename, path, mimetype, size, ... }
  });
  return success(res, 201, 'Song uploaded', result);
});

// PATCH /api/songs/:id  — edit metadata (not the audio file).
const updateSong = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const { title, trackNumber, durationSeconds } = req.body;
  const result = await songService.updateSong({
    actor: req.user,
    songId,
    title,
    trackNumber,
    durationSeconds,
  });
  return success(res, 200, 'Song updated', result);
});

// PATCH /api/songs/:id/status  — draft -> published -> archived.
const updateStatus = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const { status } = req.body;

  const result = await songService.setStatus({
    actor: req.user,
    songId,
    status,
  });
  return success(res, 200, 'Song status updated', result);
});

// PUT /api/songs/:id/genres  — replace the song's genre set (M2M).
const setGenres = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const { genreIds } = req.body;

  const result = await songService.setGenres({
    actor: req.user,
    songId,
    genreIds,
  });
  return success(res, 200, 'Song genres updated', result);
});

// GET /api/songs/:id/file  — gated file serve (NOT range streaming).
// Published song -> anyone; draft/archived -> owner only. Enforced in service,
// which returns the absolute path; controller streams it with sendFile.
const serveSongFile = catchAsync(async (req, res) => {
  const songId = req.params.id;
  const { absolutePath, mimeType } = await songService.resolvePlayableFile({
    actor: req.user, // may be undefined for public reads
    songId,
  });

  res.type(mimeType);
  return res.sendFile(absolutePath);
});

// DELETE /api/songs/:id  — hard delete. Owner only (enforced in service).
// Removes the row, its genre links, and the audio file from disk.
const deleteSong = catchAsync(async (req, res) => {
  const result = await songService.deleteSong({
    actor: req.user,
    songId: req.params.id,
    password: req.body.password,   // DELETE with a body; axios sends it, Express parses it
  });
  return success(res, 200, 'Song deleted', result);
});

// POST /api/songs/:id/play — record a play.
// Fire-and-forget from the client's point of view: the player doesn't block on
// this, it just reports that a play happened.
const recordPlay = catchAsync(async (req, res) => {
  const { msPlayed, source } = req.body;
  const result = await playService.recordPlay({
    actor: req.user,
    songId: req.params.id,
    msPlayed,
    source,
  });
  return success(res, 201, 'Play recorded', result);
});

module.exports = {
  uploadSong,
  updateSong,
  updateStatus,
  setGenres,
  deleteSong,
  serveSongFile,
  recordPlay,
};
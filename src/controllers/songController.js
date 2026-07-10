'use strict';
const songService = require('../services/songService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

// POST /api/songs  — multipart upload: audio file (multer) + metadata.
// multer has already written the file to disk and populated req.file by now.
const uploadSong = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'audio file is required');

  const { title, albumId, trackNumber, durationSeconds, genreIds } = req.body || {};
  if (!title) throw new ApiError(400, 'title is required');
  if (!albumId) throw new ApiError(400, 'albumId is required');

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
  const { title, trackNumber, durationSeconds } = req.body || {};
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
  const { status } = req.body || {};
  if (!status) throw new ApiError(400, 'status is required');

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
  const { genreIds } = req.body || {};
  if (!Array.isArray(genreIds)) throw new ApiError(400, 'genreIds must be an array');

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

module.exports = {
  uploadSong,
  updateSong,
  updateStatus,
  setGenres,
  serveSongFile,
};
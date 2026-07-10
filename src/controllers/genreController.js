'use strict';
const genreService = require('../services/genreService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

// GET /api/genres  — public list of all genres (browse/filter UI).
const listGenres = catchAsync(async (req, res) => {
  const result = await genreService.listGenres();
  return success(res, 200, 'Genres retrieved', result);
});

// POST /api/genres  — create a genre (guarded by manage_catalog at the route).
const createGenre = catchAsync(async (req, res) => {
  const { name } = req.body || {};
  if (!name) throw new ApiError(400, 'name is required');

  const result = await genreService.createGenre({ name });
  return success(res, 201, 'Genre created', result);
});

module.exports = {
  listGenres,
  createGenre,
};
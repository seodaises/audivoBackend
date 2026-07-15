'use strict';
const catalogService = require('../services/catalogService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// GET /api/catalog/songs?page=&limit=&genre=  — published songs only.
const browseSongs = catchAsync(async (req, res) => {
  const { page, limit, genre } = req.query;
  const result = await catalogService.browseSongs({ page, limit, genre });
  return success(res, 200, 'Songs retrieved', result);
});

// GET /api/catalog/albums?page=&limit=  — published albums only.
const browseAlbums = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await catalogService.browseAlbums({ page, limit });
  return success(res, 200, 'Albums retrieved', result);
});

// GET /api/catalog/artists?page=&limit=  — artists with published content.
const browseArtists = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await catalogService.browseArtists({ page, limit });
  return success(res, 200, 'Artists retrieved', result);
});

// GET /api/catalog/search?q=  — cross-entity search over published content.
const search = catchAsync(async (req, res) => {
  const { q, page, limit } = req.query;
  const result = await catalogService.search({ q, page, limit });
  return success(res, 200, 'Search results retrieved', result);
});

module.exports = {
  browseSongs,
  browseAlbums,
  browseArtists,
  search,
};
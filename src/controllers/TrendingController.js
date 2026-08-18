'use strict';
const trendingService = require('../services/trendingService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// GET /api/catalog/trending/songs?limit=
const trendingSongs = catchAsync(async (req, res) => {
  const result = await trendingService.trendingSongs({ limit: req.query.limit });
  return success(res, 200, 'Trending songs retrieved', result);
});

// GET /api/catalog/trending/albums?limit=
const trendingAlbums = catchAsync(async (req, res) => {
  const result = await trendingService.trendingAlbums({ limit: req.query.limit });
  return success(res, 200, 'Trending albums retrieved', result);
});

// GET /api/catalog/trending/artists?limit=
const trendingArtists = catchAsync(async (req, res) => {
  const result = await trendingService.trendingArtists({ limit: req.query.limit });
  return success(res, 200, 'Trending artists retrieved', result);
});

module.exports = {
  trendingSongs,
  trendingAlbums,
  trendingArtists,
};
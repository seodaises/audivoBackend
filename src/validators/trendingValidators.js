'use strict';
const { limitOnly } = require('./commonValidators');

// Trending endpoints take a single optional `limit`. Same shape for all three.
const byLimit = { query: limitOnly };

module.exports = {
  trendingSongs: byLimit,
  trendingAlbums: byLimit,
  trendingArtists: byLimit,
};

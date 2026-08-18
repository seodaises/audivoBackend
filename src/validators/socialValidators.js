'use strict';
const { idParam, pagination, limitOnly } = require('./commonValidators');

// Social is almost pure params + pagination — the ideal home for the shared
// fragments. Every like/save/follow acts on an :id; every list is paginated.
// No bodies here: likes/saves/follows carry their target in the URL, not a body.

// List endpoints (page + limit).
const listPaged = { query: pagination };

// Entity actions & status reads — just a positive :id.
const byId = { params: idParam };

// History reads page by limit alone.
const listByLimit = { query: limitOnly };

module.exports = {
  // likes
  listLikedSongs: listPaged,
  likeSong: byId,
  unlikeSong: byId,
  // saves
  listSavedSongs: listPaged,
  saveSong: byId,
  unsaveSong: byId,
  listSavedAlbums: listPaged,
  saveAlbum: byId,
  unsaveAlbum: byId,
  // follows
  listFollowedArtists: listPaged,
  followArtist: byId,
  unfollowArtist: byId,
  listMyFollowers: listPaged,
  // status
  getSongStatus: byId,
  getAlbumStatus: byId,
  getArtistStatus: byId,
  // history + my comments
  listRecentlyPlayed: listByLimit,
  listMostPlayed: listByLimit,
  listMyComments: listPaged,
};

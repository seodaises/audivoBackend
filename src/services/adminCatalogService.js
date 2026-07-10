'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

const VALID_STATUSES = ['draft', 'published', 'archived'];

const paginate = ({ page, limit }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
};
const pageMeta = (count, safePage, safeLimit) => ({
  page: safePage, limit: safeLimit, total: count, totalPages: Math.ceil(count / safeLimit),
});

// Admin oversight: ALL songs regardless of status/owner. Optional status filter.
const listAllSongs = async ({ page, limit, status } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const where = {};
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  const { count, rows } = await db.Song.findAndCountAll({
    where,
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });
  return {
    songs: rows.map((s) => ({
      id: s.id, title: s.title, albumId: s.album_id, status: s.status,
      artist: s.artistProfile ? { id: s.artistProfile.id, stageName: s.artistProfile.stage_name } : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const listAllAlbums = async ({ page, limit, status } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const where = {};
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  const { count, rows } = await db.Album.findAndCountAll({
    where,
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });
  return {
    albums: rows.map((a) => ({
      id: a.id, title: a.title, status: a.status, isSingle: a.is_single,
      artist: a.artistProfile ? { id: a.artistProfile.id, stageName: a.artistProfile.stage_name } : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// Admin force-set status on ANY song — ownership bypassed; manage_catalog is the
// gate (checked at the route). The "administrators oversee the catalog" power.
const setSongStatus = async ({ actor, songId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const song = await db.Song.findByPk(songId);
  if (!song) throw new ApiError(404, 'Song not found');
  song.status = status;
  await song.save();
  return { id: song.id, status: song.status };
};

const setAlbumStatus = async ({ actor, albumId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const album = await db.Album.findByPk(albumId);
  if (!album) throw new ApiError(404, 'Album not found');
  album.status = status;
  await album.save();
  return { id: album.id, status: album.status };
};

module.exports = { listAllSongs, listAllAlbums, setSongStatus, setAlbumStatus };
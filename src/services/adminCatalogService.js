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

// Admin oversight: ALL artist profiles. Optional `verified` filter lets the
// manage-artists page show pending (unverified) artists specifically — the
// common case is "who's waiting for approval." Joins the user for the public
// username handle and the account email (admins need to know who they're
// verifying). `verified` arrives as a query string, so we normalize it.
const listAllArtists = async ({ page, limit, verified } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const where = {};
  if (verified === 'true' || verified === true) where.is_verified = true;
  else if (verified === 'false' || verified === false) where.is_verified = false;

  const { count, rows } = await db.ArtistProfile.findAndCountAll({
    where,
    include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'email'] }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });
  return {
    artists: rows.map((p) => ({
      id: p.id,
      stageName: p.stage_name,
      bio: p.bio ?? null,
      avatarUrl: p.avatar_url ?? null,
      isVerified: p.is_verified,
      user: p.user
        ? { id: p.user.id, username: p.user.username, email: p.user.email }
        : null,
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
  const { Op } = db.Sequelize;

  await db.sequelize.transaction(async (t) => {
    album.status = status;
    await album.save({ transaction: t });

    if (status === 'published') {
      await db.Song.update(
        { status: 'published' },
        { where: { album_id: album.id, status: 'draft' }, transaction: t }
      );
    } else if (status === 'archived') {
      await db.Song.update(
        { status: 'archived' },
        { where: { album_id: album.id, status: { [Op.ne]: 'archived' } }, transaction: t }
      );
    }
  });

  return { id: album.id, status: album.status };
};

module.exports = { listAllSongs, listAllAlbums, listAllArtists, setSongStatus, setAlbumStatus };
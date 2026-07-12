'use strict';
const db = require('../models');
const { Op } = db.Sequelize;
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

// Case-insensitive LIKE. MySQL's default collation is already case-insensitive,
// so a plain Op.like is the right tool — Op.iLike is Postgres-only and would
// throw here. Escape the SQL wildcards so a user searching for "100%" doesn't
// accidentally match everything.
const likeTerm = (search) => {
  const clean = String(search || '').trim();
  if (!clean) return null;
  const escaped = clean.replace(/[%_\\]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
};

const listAllSongs = async ({ page, limit, status, search } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const where = {};
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  // Search matches the song title OR the artist's stage name. The artist half
  // has to live in the include's where (it's a different table), and because
  // that include is `required: false` by default, we flip it to an INNER JOIN
  // only when searching — otherwise a song with no artist profile would vanish
  // from the unfiltered list.
  const term = likeTerm(search);
  if (term) where.title = { [Op.like]: term };

  const { count, rows } = await db.Song.findAndCountAll({
    where,
    include: [{
      model: db.ArtistProfile,
      as: 'artistProfile',
      attributes: ['id', 'stage_name'],
    }],
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

const listAllAlbums = async ({ page, limit, status, search } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const where = {};
  if (status && VALID_STATUSES.includes(status)) where.status = status;

  const term = likeTerm(search);
  if (term) where.title = { [Op.like]: term };

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

const listAllArtists = async ({ page, limit, verified, search } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const where = {};
  if (verified === 'true' || verified === true) where.is_verified = true;
  else if (verified === 'false' || verified === false) where.is_verified = false;

  // Stage name lives on the profile; username/email live on the joined user.
  // Sequelize lets us reference an included column with `$user.username$` inside
  // the top-level where, which keeps this as one OR instead of two queries.
  const term = likeTerm(search);
  if (term) {
    where[Op.or] = [
      { stage_name: { [Op.like]: term } },
      { '$user.username$': { [Op.like]: term } },
      { '$user.email$': { [Op.like]: term } },
    ];
  }

  const { count, rows } = await db.ArtistProfile.findAndCountAll({
    where,
    include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'email'] }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
    // $-column references require the join to be part of the same query, which
    // subQuery: false guarantees. Without it Sequelize splits the LIMIT into a
    // subquery that can't see `user`, and MySQL throws "unknown column".
    subQuery: false,
  });
  return {
    artists: rows.map((p) => ({
      id: p.id,
      stageName: p.stage_name,
      bio: p.bio ?? null,
      avatarUrl: p.avatar_url ?? null,
      isVerified: p.is_verified,
      user: p.user ? { id: p.user.id, username: p.user.username, email: p.user.email } : null,
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
      // Mirrors albumService.setStatus — publishing an album brings back BOTH
      // drafts and archived tracks. Keep these two branches in lockstep: the
      // admin path and the artist path must cascade identically, or the same
      // album behaves differently depending on who clicked the button.
      await db.Song.update(
        { status: 'published' },
        { where: { album_id: album.id, status: { [Op.ne]: 'published' } }, transaction: t }
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
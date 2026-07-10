'use strict';
const db = require('../models');
const { Op } = db.Sequelize;

const paginate = ({ page, limit }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
};
const pageMeta = (count, safePage, safeLimit) => ({
  page: safePage, limit: safeLimit, total: count, totalPages: Math.ceil(count / safeLimit),
});

// Public song browse — PUBLISHED only. Optional genre filter by genre id.
const browseSongs = async ({ page, limit, genre } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const include = [
    { model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] },
  ];
  if (genre) {
    include.push({
      model: db.Genre, as: 'genres', attributes: ['id', 'name'],
      where: { id: Number(genre) }, through: { attributes: [] }, required: true,
    });
  } else {
    include.push({
      model: db.Genre, as: 'genres', attributes: ['id', 'name'],
      through: { attributes: [] }, required: false,
    });
  }

  const { count, rows } = await db.Song.findAndCountAll({
    where: { status: 'published' },
    include,
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    songs: rows.map((s) => ({
      id: s.id,
      title: s.title,
      albumId: s.album_id,
      artist: s.artistProfile ? { id: s.artistProfile.id, stageName: s.artistProfile.stage_name } : null,
      durationSeconds: s.duration_seconds ?? null,
      genres: (s.genres || []).map((g) => ({ id: g.id, name: g.name })),
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const browseAlbums = async ({ page, limit } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const { count, rows } = await db.Album.findAndCountAll({
    where: { status: 'published' },
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    order: [['release_date', 'DESC'], ['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });
  return {
    albums: rows.map((a) => ({
      id: a.id, title: a.title, coverUrl: a.cover_url ?? null,
      isSingle: a.is_single, releaseDate: a.release_date ?? null,
      artist: a.artistProfile ? { id: a.artistProfile.id, stageName: a.artistProfile.stage_name } : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// Artists with at least one published song (inner join on published songs).
const browseArtists = async ({ page, limit } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const { count, rows } = await db.ArtistProfile.findAndCountAll({
    include: [
      { model: db.Song, as: 'songs', attributes: [], where: { status: 'published' }, required: true },
      { model: db.User, as: 'user', attributes: ['username'] },
    ],
    order: [['id', 'ASC']],
    limit: safeLimit,
    offset,
    distinct: true,
    subQuery: true,
  });
  return {
    artists: rows.map((p) => ({
      id: p.id,
      stageName: p.stage_name,
      username: p.user ? p.user.username : null,
      avatarUrl: p.avatar_url ?? null,
      isVerified: p.is_verified,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// Cross-entity search over PUBLISHED content: songs, albums, artists.
const search = async ({ q, page, limit } = {}) => {
  const term = String(q || '').trim();
  if (!term) return { query: '', songs: [], albums: [], artists: [] };

  const like = { [Op.like]: `%${term}%` };
  const { safeLimit } = paginate({ page, limit });

  const songs = await db.Song.findAll({
    where: { status: 'published', title: like },
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    limit: safeLimit,
    order: [['id', 'DESC']],
  });
  const albums = await db.Album.findAll({
    where: { status: 'published', title: like },
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    limit: safeLimit,
    order: [['id', 'DESC']],
  });
  const artists = await db.ArtistProfile.findAll({
    where: { stage_name: like },
    limit: safeLimit,
    order: [['id', 'ASC']],
  });

  return {
    query: term,
    songs: songs.map((s) => ({
      id: s.id, title: s.title,
      artist: s.artistProfile ? { id: s.artistProfile.id, stageName: s.artistProfile.stage_name } : null,
    })),
    albums: albums.map((a) => ({
      id: a.id, title: a.title,
      artist: a.artistProfile ? { id: a.artistProfile.id, stageName: a.artistProfile.stage_name } : null,
    })),
    artists: artists.map((p) => ({ id: p.id, stageName: p.stage_name })),
  };
};

module.exports = { browseSongs, browseAlbums, browseArtists, search };
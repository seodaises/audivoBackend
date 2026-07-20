'use strict';
const db = require('../models');
const { Op, literal } = db.Sequelize;
const ApiError = require('../utils/ApiError');
const { deleteAudioFile } = require('../config/storage');

const VALID_STATUSES = ['draft', 'published', 'archived'];

const paginate = ({ page, limit }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
};
const pageMeta = (count, safePage, safeLimit) => ({
  page: safePage, limit: safeLimit, total: count, totalPages: Math.ceil(count / safeLimit),
});
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

  const term = likeTerm(search);
  if (term) where.title = { [Op.like]: term };

  const { count, rows } = await db.Song.findAndCountAll({
    where,
    include: [
      { model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] },
      { model: db.Album, as: 'album', attributes: ['id', 'title'] },
      { model: db.Genre, as: 'genres', attributes: ['id', 'name'], through: { attributes: [] } },
    ],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
    subQuery: false,
  });

  return {
    songs: rows.map((s) => ({
      id: s.id,
      title: s.title,
      albumId: s.album_id,
      status: s.status,
      archivedBy: s.archived_by ?? null,
      isLocked: s.status === 'archived' && s.archived_by === 'admin',
      durationSeconds: s.duration_seconds ?? null,
      trackNumber: s.track_number ?? null,
      playCount: s.play_count ?? 0,
      createdAt: s.createdAt ?? null, // attribute, not column — see adminUserRow
      artist: s.artistProfile
        ? { id: s.artistProfile.id, stageName: s.artistProfile.stage_name }
        : null,
      album: s.album ? { id: s.album.id, title: s.album.title } : null,
      genres: (s.genres || []).map((g) => ({ id: g.id, name: g.name })),
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
    attributes: {
      include: [
        // Same correlated-subquery reasoning as listAllArtists: joining songs to
        // count them would multiply the album rows and break LIMIT.
        [literal('(SELECT COUNT(*) FROM songs WHERE songs.album_id = `Album`.`id`)'), 'track_count'],
      ],
    },
    include: [{ model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
    subQuery: false,
  });

  return {
    albums: rows.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      isSingle: a.is_single,
      // Existed on the table, never sent.
      releaseDate: a.release_date ?? null,
      coverUrl: a.cover_url ?? null,
      trackCount: Number(a.get('track_count') || 0),
      createdAt: a.createdAt ?? null,
      artist: a.artistProfile
        ? { id: a.artistProfile.id, stageName: a.artistProfile.stage_name }
        : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const listAllArtists = async ({ page, limit, verified, search } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const where = {};
  if (verified === 'true' || verified === true) where.is_verified = true;
  else if (verified === 'false' || verified === false) where.is_verified = false;

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
    attributes: {
      include: [
        [literal('(SELECT COUNT(*) FROM songs WHERE songs.artist_profile_id = `ArtistProfile`.`id`)'), 'song_count'],
        [literal('(SELECT COUNT(*) FROM albums WHERE albums.artist_profile_id = `ArtistProfile`.`id`)'), 'album_count'],
        // COALESCE because SUM over zero rows is NULL, not 0.
        [literal('(SELECT COALESCE(SUM(play_count), 0) FROM songs WHERE songs.artist_profile_id = `ArtistProfile`.`id`)'), 'total_plays'],
      ],
    },
    include: [{ model: db.User, as: 'user', attributes: ['id', 'username', 'email'], where: { deleted_at: null },
      required: true, }],
    order: [['id', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
    subQuery: false,
  });

  return {
    artists: rows.map((p) => ({
      id: p.id,
      stageName: p.stage_name,
      bio: p.bio ?? null,
      avatarUrl: p.avatar_url ?? null,
      isVerified: p.is_verified,
      createdAt: p.createdAt ?? null,
      songCount: Number(p.get('song_count') || 0),
      albumCount: Number(p.get('album_count') || 0),
      totalPlays: Number(p.get('total_plays') || 0),
      user: p.user
        ? { id: p.user.id, username: p.user.username, email: p.user.email }
        : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const setSongStatus = async ({ actor, songId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const song = await db.Song.findByPk(songId);
  if (!song) throw new ApiError(404, 'Song not found');

  song.status = status;
  song.archived_by = status === 'archived' ? 'admin' : null;
  await song.save();
  return { id: song.id, status: song.status };
};

const setAlbumStatus = async ({ actor, albumId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const album = await db.Album.findByPk(albumId);
  if (!album) throw new ApiError(404, 'Album not found');

  await db.sequelize.transaction(async (t) => {
    album.status = status;
    album.archived_by = status === 'archived' ? 'admin' : null;
    await album.save({ transaction: t });

    if (status === 'published') {
      await db.Song.update(
        { status: 'published', archived_by: null },
        { where: { album_id: album.id, status: { [Op.ne]: 'published' } }, transaction: t }
      );
    } else if (status === 'archived') {
      await db.Song.update(
        { status: 'archived', archived_by: 'album' },
        { where: { album_id: album.id, status: { [Op.ne]: 'archived' } }, transaction: t }
      );
    }
  });

  return { id: album.id, status: album.status };
};
const adminDeleteSong = async ({ songId }) => {
  const song = await db.Song.findByPk(songId, { attributes: ['id', 'storage_key'] });
  if (!song) throw new ApiError(404, 'Song not found');

  const storageKey = song.storage_key;

  await db.sequelize.transaction(async (t) => {
    await db.SongGenre.destroy({ where: { song_id: song.id }, transaction: t });
    await song.destroy({ transaction: t });
  });

  // Outside the transaction, deliberately. A DB rollback can't un-delete a file, so the file goes last — after the rows are safely gone. Worst case we leak anorphaned file (recoverable, and already on the backlog); the alternative is deleting audio for a row that then fails to commit (not recoverable).
  deleteAudioFile(storageKey);

  return { id: Number(songId), deleted: true };
};

const adminDeleteAlbum = async ({ albumId }) => {
  const album = await db.Album.findByPk(albumId);
  if (!album) throw new ApiError(404, 'Album not found');

  const songs = await db.Song.findAll({
    where: { album_id: album.id },
    attributes: ['id', 'storage_key'],
  });
  const songIds = songs.map((s) => s.id);
  const storageKeys = songs.map((s) => s.storage_key);

  await db.sequelize.transaction(async (t) => {
    if (songIds.length) {
      await db.SongGenre.destroy({ where: { song_id: songIds }, transaction: t });
      await db.Song.destroy({ where: { id: songIds }, transaction: t });
    }
    await album.destroy({ transaction: t });
  });

  storageKeys.forEach(deleteAudioFile);

  return { id: Number(albumId), deleted: true, songsDeleted: songIds.length };
};

module.exports = { listAllSongs, listAllAlbums, listAllArtists, setSongStatus, setAlbumStatus, adminDeleteSong, adminDeleteAlbum };
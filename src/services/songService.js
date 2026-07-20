'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { requireOwnProfile } = require('./artistProfileService');
const { resolveAudioPath, deleteAudioFile, mimeForKey } = require('../config/storage');
const { comparePassword } = require('../utils/password');
const VALID_STATUSES = ['draft', 'published', 'archived'];

const songRow = (s) => ({
  id: s.id,
  albumId: s.album_id,
  artistProfileId: s.artist_profile_id,
  title: s.title,
  storageKey: s.storage_key, // internal handle; clients address the song by ID
  durationSeconds: s.duration_seconds ?? null,
  trackNumber: s.track_number ?? null,
  status: s.status,
  archivedBy: s.archived_by ?? null, // 'artist' | 'admin' | 'album' | null
  isLocked: s.status === 'archived' && s.archived_by === 'admin',
  playCount: s.play_count,
  createdAt: s.created_at,
});

const normalizeGenreIds = (genreIds) => {
  if (genreIds == null) return [];
  if (Array.isArray(genreIds)) return genreIds.map(Number).filter(Number.isInteger);
  const raw = String(genreIds).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isInteger);
  } catch (_) { /* not JSON, fall through to CSV */ }
  return raw.split(',').map((x) => Number(x.trim())).filter(Number.isInteger);
};

const loadOwnedSong = async (actor, songId) => {
  const profile = await requireOwnProfile(actor);
  const song = await db.Song.findByPk(songId);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.artist_profile_id !== profile.id) {
    throw new ApiError(403, 'You do not own this song');
  }
  return { profile, song };
};

const createSong = async ({ actor, title, albumId, trackNumber, durationSeconds, genreIds, file }) => {
  const storageKey = file.filename;

  try {
    const profile = await requireOwnProfile(actor, { mustBeVerified: true });

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new ApiError(400, 'title is required');

    const album = await db.Album.findByPk(albumId);
    if (!album) throw new ApiError(404, 'Album not found');

    if (album.artist_profile_id !== profile.id) {
      throw new ApiError(403, 'You do not own the target album');
    }

    const wantedGenreIds = normalizeGenreIds(genreIds);
    let validGenres = [];
    if (wantedGenreIds.length) {
      validGenres = await db.Genre.findAll({ where: { id: wantedGenreIds } });
      if (validGenres.length !== wantedGenreIds.length) {
        throw new ApiError(400, 'One or more genreIds are invalid');
      }
    }

    const result = await db.sequelize.transaction(async (t) => {
      const song = await db.Song.create(
        {
          album_id: album.id,
          artist_profile_id: album.artist_profile_id, // denorm owner, from album
          title: cleanTitle,
          storage_key: storageKey,
          duration_seconds: durationSeconds != null ? Number(durationSeconds) : null,
          track_number: trackNumber != null ? Number(trackNumber) : null,
          // status defaults to 'draft'; archived_by stays NULL
        },
        { transaction: t }
      );

      if (validGenres.length) {
        await db.SongGenre.bulkCreate(
          validGenres.map((g) => ({ song_id: song.id, genre_id: g.id })),
          { transaction: t }
        );
      }
      return song;
    });

    return songRow(result);
  } catch (err) {
    // DB work failed -> the file multer wrote is now an orphan. Remove it.
    deleteAudioFile(storageKey);
    throw err;
  }
};

const updateSong = async ({ actor, songId, title, trackNumber, durationSeconds }) => {
  const { song } = await loadOwnedSong(actor, songId);

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) throw new ApiError(400, 'title cannot be empty');
    song.title = t;
  }
  if (trackNumber !== undefined) song.track_number = trackNumber != null ? Number(trackNumber) : null;
  if (durationSeconds !== undefined) song.duration_seconds = durationSeconds != null ? Number(durationSeconds) : null;

  await song.save();
  return songRow(song);
};

const setStatus = async ({ actor, songId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const { song } = await loadOwnedSong(actor, songId);

  if (song.status === 'archived' && song.archived_by === 'admin') {
    throw new ApiError(
      403,
      'This track was removed by a moderator and cannot be changed. Contact an admin to appeal.'
    );
  }

  if (status === 'published') {
    const album = await db.Album.findByPk(song.album_id, {
      attributes: ['id', 'status'],
    });
    if (!album || album.status !== 'published') {
      throw new ApiError(
        409,
        'This song can only be published once its album is published. Publish the album first.'
      );
    }
  }

  song.status = status;
  song.archived_by = status === 'archived' ? 'artist' : null;
  await song.save();
  return songRow(song);
};

const deleteSong = async ({ actor, songId, password }) => {
  const { song } = await loadOwnedSong(actor, songId);

  const user = await db.User.findByPk(actor.id, { attributes: ['id', 'password_hash'] });
  if (!user) throw new ApiError(404, 'User not found');

  if (!password) throw new ApiError(400, 'Password is required to delete');
  const ok = await comparePassword(password, user.password_hash);
  // 401, not 403. The session is valid; it's the re-authentication that failed.
  if (!ok) throw new ApiError(401, 'Password is incorrect');

  const storageKey = song.storage_key;

  await db.sequelize.transaction(async (t) => {
    await db.SongGenre.destroy({ where: { song_id: song.id }, transaction: t });
    await song.destroy({ transaction: t });
  });

  deleteAudioFile(storageKey); // best-effort; already swallows ENOENT
  return { id: Number(songId), deleted: true };
};
// Replace the song's genre set (M2M). Transactional: clear then set, atomic.
const setGenres = async ({ actor, songId, genreIds }) => {
  const { song } = await loadOwnedSong(actor, songId);
  const wanted = normalizeGenreIds(genreIds);

  let validGenres = [];
  if (wanted.length) {
    validGenres = await db.Genre.findAll({ where: { id: wanted } });
    if (validGenres.length !== wanted.length) {
      throw new ApiError(400, 'One or more genreIds are invalid');
    }
  }

  await db.sequelize.transaction(async (t) => {
    await db.SongGenre.destroy({ where: { song_id: song.id }, transaction: t });
    if (validGenres.length) {
      await db.SongGenre.bulkCreate(
        validGenres.map((g) => ({ song_id: song.id, genre_id: g.id })),
        { transaction: t }
      );
    }
  });

  const genres = await song.getGenres();
  return {
    songId: song.id,
    genres: genres.map((g) => ({ id: g.id, name: g.name })),
  };
};

// Resolve the on-disk file for the serve endpoint, enforcing visibility.
// Published -> anyone. Draft/archived -> owner only. actor may be undefined.
const resolvePlayableFile = async ({ actor, songId }) => {
  const song = await db.Song.findByPk(songId);
  if (!song) throw new ApiError(404, 'Song not found');

  let isOwner = false;
  if (actor && actor.id) {
    const profile = await db.ArtistProfile.findOne({ where: { user_id: actor.id } });
    isOwner = profile && profile.id === song.artist_profile_id;
  }

  if (song.status !== 'published' && !isOwner) {
    throw new ApiError(404, 'Song not found');
  }

  return {
    absolutePath: resolveAudioPath(song.storage_key),
    mimeType: mimeForKey(song.storage_key),
  };
};

module.exports = {
  createSong,
  updateSong,
  setStatus,
  deleteSong,
  setGenres,
  resolvePlayableFile,
  songRow,
};
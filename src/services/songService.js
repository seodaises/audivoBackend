'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { requireOwnProfile } = require('./artistProfileService');
const { resolveAudioPath, deleteAudioFile, mimeForKey } = require('../config/storage');

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
  playCount: s.play_count,
  createdAt: s.created_at,
});

// Normalize genreIds that may arrive as an array, JSON string, or CSV string
// (multipart form fields are stringly-typed).
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

// Create a song. Multipart: multer has already written the file to disk and
// populated req.file, so file.filename IS the storage_key. This is the one
// multi-write op (songs row + song_genres rows) — wrapped in a transaction so a
// half-linked song can't exist. If the DB work fails, we also delete the file
// multer already wrote, so a rolled-back song leaves no orphan on disk.
const createSong = async ({ actor, title, albumId, trackNumber, durationSeconds, genreIds, file }) => {
  const storageKey = file.filename;

  try {
    const profile = await requireOwnProfile(actor, { mustBeVerified: true });

    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) throw new ApiError(400, 'title is required');

    const album = await db.Album.findByPk(albumId);
    if (!album) throw new ApiError(404, 'Album not found');
    // Owning the album authorizes adding songs to it. This also keeps the
    // denormalized song.artist_profile_id honest: it's copied FROM the album's
    // owner, never supplied by the client.
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
          // status defaults to 'draft'
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
  song.status = status;
  await song.save();
  return songRow(song);
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
  setGenres,
  resolvePlayableFile,
  songRow,
};
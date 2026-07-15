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
  // Derived, not stored. The frontend must not re-derive this rule — if the
  // lock condition ever changes, it changes HERE and every client follows.
  isLocked: s.status === 'archived' && s.archived_by === 'admin',
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

// ARTIST status change. Two rules that didn't exist before:
//
// 1. THE LOCK. If a song is archived with archived_by='admin', it was taken down
//    BY A MODERATOR. The artist cannot move it — not to published, not to draft,
//    not anywhere. Without this check the entire admin takedown feature is
//    theatre: the artist just clicks Publish and it's back. Only the admin path
//    (adminCatalogService.setSongStatus) can lift it.
//
// 2. STAMPING. When an artist archives their own song we record archived_by =
//    'artist'. That's what tells a later album-republish "leave this one alone —
//    the artist pulled it on purpose, it isn't collateral." Any move OUT of
//    archived clears the stamp back to NULL, because the field only ever
//    describes a song that is currently archived.
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

  song.status = status;
  song.archived_by = status === 'archived' ? 'artist' : null;
  await song.save();
  return songRow(song);
};

// Hard delete an owned song: the DB row, its genre links, and the audio file.
//
// WHY HARD, not soft: `archived` is ALREADY the reversible "take it down but
// keep it" state. Adding deleted_at on top would give us two overlapping ways to
// hide a song, and every catalog read would have to reason about both. Delete
// here means delete — and because it means delete, it also cleans up the disk,
// which is the orphaned-audio problem solved as a side effect.
//
// Order matters: DB first inside a transaction, file LAST. If the DB rolls back,
// the file is still there and nothing is lost. If we unlinked first and the DB
// then failed, we'd have a row pointing at a file that no longer exists — a song
// that appears in the catalog and 500s on play. Losing a file is worse than
// leaving one behind, so the irreversible step goes last.
const deleteSong = async ({ actor, songId, password }) => {
  const { song } = await loadOwnedSong(actor, songId);

  // The actor object comes from `protect` and may be a lean projection, so
  // re-read the user to be certain we have password_hash to compare against.
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
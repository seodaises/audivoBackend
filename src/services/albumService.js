'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { requireOwnProfile } = require('./artistProfileService');
const { deleteAudioFile } = require('../config/storage');
const { comparePassword } = require('../utils/password');

const VALID_STATUSES = ['draft', 'published', 'archived'];

const albumRow = (a) => ({
  id: a.id,
  artistProfileId: a.artist_profile_id,
  title: a.title,
  coverUrl: a.cover_url ?? null,
  description: a.description ?? null,
  status: a.status,
  releaseDate: a.release_date ?? null,
  isSingle: a.is_single,
  createdAt: a.created_at,
});

// Load an album and assert the caller owns it (via their artist profile).
const loadOwnedAlbum = async (actor, albumId) => {
  const profile = await requireOwnProfile(actor);
  const album = await db.Album.findByPk(albumId);
  if (!album) throw new ApiError(404, 'Album not found');
  if (album.artist_profile_id !== profile.id) {
    throw new ApiError(403, 'You do not own this album');
  }
  return { profile, album };
};

const createAlbum = async ({ actor, title, coverUrl, description, releaseDate, isSingle }) => {
  const profile = await requireOwnProfile(actor, { mustBeVerified: true });
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new ApiError(400, 'title is required');

  const created = await db.Album.create({
    artist_profile_id: profile.id,
    title: cleanTitle,
    cover_url: coverUrl ?? null,
    description: description ?? null,
    release_date: releaseDate ?? null,
    is_single: Boolean(isSingle),
  });
  return albumRow(created);
};

const updateAlbum = async ({ actor, albumId, title, coverUrl, description, releaseDate }) => {
  const { album } = await loadOwnedAlbum(actor, albumId);

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) throw new ApiError(400, 'title cannot be empty');
    album.title = t;
  }
  if (coverUrl !== undefined) album.cover_url = coverUrl;
  if (description !== undefined) album.description = description;
  if (releaseDate !== undefined) album.release_date = releaseDate;

  await album.save();
  return albumRow(album);
};

// ---------------------------------------------------------------------------
// The album status cascade — this is the interesting one, so read the rules.
//
// ARCHIVING an album takes its songs down with it. But it only touches songs
// that are NOT already archived, and it stamps the ones it does touch with
// archived_by='album'. That stamp is the memory: "this song went down BECAUSE
// the album did." A song the artist had already pulled themselves keeps its
// existing archived_by='artist' stamp — the album archive doesn't overwrite it,
// because the album didn't take that one down; it was already gone.
//
// PUBLISHING an album only brings back songs it is entitled to bring back:
//   - drafts                       -> yes. Publishing the album releases them.
//   - archived_by = 'album'        -> yes. The album took them down; the album
//                                    puts them back. Symmetric round-trip.
//   - archived_by = 'artist'       -> NO. The artist deliberately pulled this
//                                    B-side. Republishing the album must not
//                                    resurrect it. This was the old bug.
//   - archived_by = 'admin'        -> NO. Moderator takedown. An artist must not
//                                    be able to launder a takedown by archiving
//                                    and republishing the whole album.
//
// Setting an album back to draft doesn't touch songs at all.
//
// One transaction: the album row and its songs move together, or not at all.
// ---------------------------------------------------------------------------
const setStatus = async ({ actor, albumId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const { album } = await loadOwnedAlbum(actor, albumId);
  const { Op } = db.Sequelize;

  await db.sequelize.transaction(async (t) => {
    album.status = status;
    await album.save({ transaction: t });

    if (status === 'published') {
      await db.Song.update(
        { status: 'published', archived_by: null },
        {
          where: {
            album_id: album.id,
            [Op.or]: [
              { status: 'draft' },
              { status: 'archived', archived_by: 'album' },
            ],
          },
          transaction: t,
        }
      );
    } else if (status === 'archived') {
      await db.Song.update(
        { status: 'archived', archived_by: 'album' },
        {
          // Op.ne 'archived' — only songs that are still up. An already-archived
          // song keeps whatever stamp it has ('artist' or 'admin'), which is the
          // whole point: we must not overwrite the reason it went down.
          where: { album_id: album.id, status: { [Op.ne]: 'archived' } },
          transaction: t,
        }
      );
    }
  });

  return albumRow(album);
};

// Hard delete an owned album and EVERYTHING under it: songs, their genre links,
// and their audio files. This is the cascade.
//
// Sequelize's `onDelete: CASCADE` at the DB level would delete the song ROWS for
// free — but the DB knows nothing about the files on disk. So the cascade is
// done explicitly in the service: read the songs, delete the DB rows in a
// transaction, and only once that COMMITS, unlink the files. Same ordering
// argument as deleteSong: an orphaned file is recoverable, a row pointing at a
// missing file is a 500 on the play button.
const deleteAlbum = async ({ actor, albumId, password }) => {
  const { album } = await loadOwnedAlbum(actor, albumId);

  const user = await db.User.findByPk(actor.id, { attributes: ['id', 'password_hash'] });
  if (!user) throw new ApiError(404, 'User not found');

  if (!password) throw new ApiError(400, 'Password is required to delete');
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Password is incorrect');

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

// Visibility-gated read. Non-owners see the album only if published; the owner
// sees it in any status. actor may be undefined (public read).
const getAlbumById = async ({ actor, albumId }) => {
  const album = await db.Album.findByPk(albumId, {
    include: [
      { model: db.Song, as: 'songs' },
      {
        model: db.ArtistProfile,
        as: 'artistProfile',
        attributes: ['id', 'stage_name'],
        include: [{ model: db.User, as: 'user', attributes: ['username'] }],
      },
    ],
  });
  if (!album) throw new ApiError(404, 'Album not found');

  let isOwner = false;
  if (actor && actor.id) {
    const profile = await db.ArtistProfile.findOne({ where: { user_id: actor.id } });
    isOwner = profile && profile.id === album.artist_profile_id;
  }

  if (album.status !== 'published' && !isOwner) {
    throw new ApiError(404, 'Album not found');
  }

  const songs = (album.songs || []).filter((s) => isOwner || s.status === 'published');

  const ap = album.artistProfile;
  const artist = ap
    ? {
        id: ap.id,
        stageName: ap.stage_name,
        username: ap.user ? ap.user.username : null,
      }
    : null;

  return {
    ...albumRow(album),
    isOwner,
    artist,
    songs: songs
      .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
      .map((s) => ({
        id: s.id, title: s.title, trackNumber: s.track_number ?? null,
        durationSeconds: s.duration_seconds ?? null, status: s.status,
        archivedBy: s.archived_by ?? null,
        isLocked: s.status === 'archived' && s.archived_by === 'admin',
      })),
  };
};

module.exports = {
  createAlbum, updateAlbum, setStatus, deleteAlbum, getAlbumById, albumRow, loadOwnedAlbum,
};
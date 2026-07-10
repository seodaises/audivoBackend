'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { requireOwnProfile } = require('./artistProfileService');

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

const createAlbum = async ({ actor, title, coverUrl, description, releaseDate, isSingle}) => {
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

// Set an album's status, cascading to its songs per these rules:
//   - Publishing an album promotes its DRAFT songs to published. Songs that are
//     already published stay published; ARCHIVED songs are left alone (archiving
//     is a deliberate act — a later album publish shouldn't resurrect them).
//   - Archiving an album archives ALL its songs (the whole release goes away).
//   - Setting an album back to draft does NOT touch song statuses.
// Wrapped in a transaction so the album row and its songs move together — if any
// write fails, none of them commit.
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

  return albumRow(album);
};

// Visibility-gated read. Non-owners see the album only if published; the owner
// sees it in any status. actor may be undefined (public read).
//
// The album eager-loads its artistProfile (+ that profile's user, for the public
// username handle) so the page can render the artist name and link through to
// the public artist page. We also return isOwner so the frontend knows whether
// to show the artist CRUD controls (add/edit/archive).
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
      })),
  };
};

module.exports = { createAlbum, updateAlbum, setStatus, getAlbumById, albumRow, loadOwnedAlbum };
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
//   - Publishing an album publishes ALL its non-published songs — both drafts
//     and archived ones. Archive/republish is therefore a symmetric round-trip:
//     what the archive took down, the republish brings back.
//   - Archiving an album archives ALL its songs (the whole release goes away).
//   - Setting an album back to draft does NOT touch song statuses.
//
// KNOWN LIMITATION: a song the artist archived DELIBERATELY (a pulled B-side)
// is indistinguishable from one archived as collateral by an album archive —
// both are just status='archived'. So republishing resurrects the B-side too.
// The fix is an `archived_by_album` flag on songs, so the publish cascade can
// restore only what the album took down. Deferred; see the backlog.
//
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
        {
          // Op.ne 'published' — not just 'draft'. Catches archived songs too, so
          // republishing an archived album actually brings its tracks back.
          where: { album_id: album.id, status: { [Op.ne]: 'published' } },
          transaction: t,
        }
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
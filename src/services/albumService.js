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
    // Brief: artists cannot modify content owned by other artists.
    throw new ApiError(403, 'You do not own this album');
  }
  return { profile, album };
};

const createAlbum = async ({ actor, title, coverUrl, releaseDate, isSingle }) => {
  const profile = await requireOwnProfile(actor, { mustBeVerified: true });
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new ApiError(400, 'title is required');

  const created = await db.Album.create({
    artist_profile_id: profile.id,
    title: cleanTitle,
    cover_url: coverUrl ?? null,
    release_date: releaseDate ?? null,
    is_single: Boolean(isSingle),
    // status defaults to 'draft'
  });
  return albumRow(created);
};

const updateAlbum = async ({ actor, albumId, title, coverUrl, releaseDate }) => {
  const { album } = await loadOwnedAlbum(actor, albumId);

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) throw new ApiError(400, 'title cannot be empty');
    album.title = t;
  }
  if (coverUrl !== undefined) album.cover_url = coverUrl;
  if (releaseDate !== undefined) album.release_date = releaseDate;

  await album.save();
  return albumRow(album);
};

const setStatus = async ({ actor, albumId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const { album } = await loadOwnedAlbum(actor, albumId);
  album.status = status;
  await album.save();
  return albumRow(album);
};

// Visibility-gated read. Non-owners see the album only if published; the owner
// sees it in any status. actor may be undefined (public read).
const getAlbumById = async ({ actor, albumId }) => {
  const album = await db.Album.findByPk(albumId, {
    include: [{ model: db.Song, as: 'songs' }],
  });
  if (!album) throw new ApiError(404, 'Album not found');

  let isOwner = false;
  if (actor && actor.id) {
    const profile = await db.ArtistProfile.findOne({ where: { user_id: actor.id } });
    isOwner = profile && profile.id === album.artist_profile_id;
  }

  if (album.status !== 'published' && !isOwner) {
    // Don't reveal existence of unpublished content to non-owners.
    throw new ApiError(404, 'Album not found');
  }

  const songs = (album.songs || []).filter((s) => isOwner || s.status === 'published');

  return {
    ...albumRow(album),
    songs: songs
      .sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
      .map((s) => ({
        id: s.id, title: s.title, trackNumber: s.track_number ?? null,
        durationSeconds: s.duration_seconds ?? null, status: s.status,
      })),
  };
};

module.exports = { createAlbum, updateAlbum, setStatus, getAlbumById, albumRow, loadOwnedAlbum };
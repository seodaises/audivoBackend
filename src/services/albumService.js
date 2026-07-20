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
  archivedBy: a.archived_by ?? null, // 'artist' | 'admin' | null
  // A moderator takedown: the owner cannot republish/change it (mirrors songs).
  isLocked: a.status === 'archived' && a.archived_by === 'admin',
  releaseDate: a.release_date ?? null,
  releaseAt: a.release_at ?? null,
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

const setStatus = async ({ actor, albumId, status }) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const { album } = await loadOwnedAlbum(actor, albumId);
  const { Op } = db.Sequelize;
  if (album.status === 'archived' && album.archived_by === 'admin') {
    throw new ApiError(
      403,
      'This album was removed by a moderator and cannot be changed. Contact an admin to appeal.'
    );
  }

  await db.sequelize.transaction(async (t) => {
    album.status = status;
    album.archived_by = status === 'archived' ? 'artist' : null;
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
          where: { album_id: album.id, status: { [Op.ne]: 'archived' } },
          transaction: t,
        }
      );
    }
  });

  return albumRow(album);
};

const scheduleRelease = async ({ actor, albumId, releaseAt }) => {
  const { album } = await loadOwnedAlbum(actor, albumId);

  if (!releaseAt) throw new ApiError(400, 'releaseAt is required');

  const when = new Date(releaseAt);
  if (Number.isNaN(when.getTime())) {
    throw new ApiError(400, 'releaseAt is not a valid date/time');
  }

  if (when.getTime() <= Date.now() + 1000) {
    throw new ApiError(400, 'releaseAt must be in the future');
  }

  if (album.status === 'published') {
    throw new ApiError(400, 'This album is already published');
  }
  if (album.status === 'archived') {
    throw new ApiError(400, 'Unarchive this album before scheduling it');
  }

  album.status = 'scheduled';
  album.release_at = when;
  await album.save();

  return albumRow(album);
};

const cancelSchedule = async ({ actor, albumId }) => {
  const { album } = await loadOwnedAlbum(actor, albumId);

  if (album.status !== 'scheduled') {
    throw new ApiError(400, 'This album is not scheduled');
  }

  album.status = 'draft';
  album.release_at = null;
  await album.save();

  return albumRow(album);
};

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
        playCount: s.play_count ?? 0, // public stream count (self-plays excluded)
      })),
  };
};

module.exports = {createAlbum, updateAlbum, setStatus, scheduleRelease, cancelSchedule, deleteAlbum, getAlbumById, albumRow, loadOwnedAlbum,};
'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

const profileRow = (p) => ({
  id: p.id,
  userId: p.user_id,
  stageName: p.stage_name,
  bio: p.bio ?? null,
  avatarUrl: p.avatar_url ?? null,
  isVerified: p.is_verified,
  createdAt: p.created_at,
});

const findProfileByUserId = async (userId) =>
  db.ArtistProfile.findOne({ where: { user_id: userId } });

// Shared helper other catalog services import: resolve caller -> profile, or 403.
// Also enforces the verified-artist gate for publish/write actions.
const requireOwnProfile = async (actor, { mustBeVerified = false } = {}) => {
  const profile = await findProfileByUserId(actor.id);
  if (!profile) {
    throw new ApiError(403, 'You must create an artist profile before publishing');
  }
  if (mustBeVerified && !profile.is_verified) {
    throw new ApiError(403, 'Your artist profile must be verified to perform this action');
  }
  return profile;
};

const createProfile = async ({ actor, stageName, bio, avatarUrl }) => {
  const name = String(stageName || '').trim();
  if (!name) throw new ApiError(400, 'stageName is required');

  const existing = await findProfileByUserId(actor.id);
  if (existing) throw new ApiError(409, 'You already have an artist profile');

  const created = await db.ArtistProfile.create({
    user_id: actor.id,
    stage_name: name,
    bio: bio ?? null,
    avatar_url: avatarUrl ?? null,
    // is_verified defaults false — an admin verifies artists (not self-serve).
  });
  return profileRow(created);
};

const updateProfile = async ({ actor, stageName, bio, avatarUrl }) => {
  const profile = await requireOwnProfile(actor);

  if (stageName !== undefined) {
    const name = String(stageName).trim();
    if (!name) throw new ApiError(400, 'stageName cannot be empty');
    profile.stage_name = name;
  }
  if (bio !== undefined) profile.bio = bio;
  if (avatarUrl !== undefined) profile.avatar_url = avatarUrl;

  await profile.save();
  return profileRow(profile);
};

const getOwnProfile = async ({ actor }) => {
  const profile = await findProfileByUserId(actor.id);
  if (!profile) throw new ApiError(404, 'You do not have an artist profile yet');
  return profileRow(profile);
};

// Public artist page: profile + PUBLISHED albums/songs only. Looked up by the
// user's username (stable public handle), then joined to the profile.
const getPublicProfile = async ({ username }) => {
  const handle = String(username || '').trim().toLowerCase();
  if (!handle) throw new ApiError(400, 'username is required');

  const user = await db.User.findOne({
    where: { username: handle, deleted_at: null },
  });
  if (!user) throw new ApiError(404, 'Artist not found');

  const profile = await db.ArtistProfile.findOne({ where: { user_id: user.id } });
  if (!profile) throw new ApiError(404, 'This user is not an artist');

  const albums = await db.Album.findAll({
    where: { artist_profile_id: profile.id, status: 'published' },
    order: [['release_date', 'DESC'], ['id', 'DESC']],
  });
  const songs = await db.Song.findAll({
    where: { artist_profile_id: profile.id, status: 'published' },
    order: [['id', 'DESC']],
  });

  return {
    profile: profileRow(profile),
    username: user.username,
    albums: albums.map((a) => ({
      id: a.id, title: a.title, coverUrl: a.cover_url ?? null,
      releaseDate: a.release_date ?? null, isSingle: a.is_single,
    })),
    songs: songs.map((s) => ({
      id: s.id, title: s.title, albumId: s.album_id,
      trackNumber: s.track_number ?? null, durationSeconds: s.duration_seconds ?? null,
    })),
  };
};

module.exports = {
  createProfile,
  updateProfile,
  getOwnProfile,
  getPublicProfile,
  findProfileByUserId,
  requireOwnProfile,
  profileRow,
};
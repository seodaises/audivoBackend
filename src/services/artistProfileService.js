'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

const profileRow = (p) => ({
  id: p.id,
  userId: p.user_id,
  // attemp at patching bug myself: roleId: p.role_id,
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

const getMyCatalog = async ({ actor }) => {
  const profile = await findProfileByUserId(actor.id);
  if (!profile) {
    return { isArtist: false, profile: null, albums: [], songs: [] };
  }

  const albums = await db.Album.findAll({
    where: { artist_profile_id: profile.id },
    order: [['id', 'DESC']],
  });

  const songs = await db.Song.findAll({
    where: { artist_profile_id: profile.id },
    include: [
      { model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'] },
      { model: db.Genre, as: 'genres', attributes: ['id', 'name'], through: { attributes: [] } },
    ],
    order: [['id', 'DESC']],
  });

  const songIds = songs.map((s) => s.id);
  const likeCounts = new Map();
  if (songIds.length > 0) {
    const grouped = await db.Like.findAll({
      where: { song_id: songIds },
      attributes: [
        'song_id',
        [db.Sequelize.fn('COUNT', db.Sequelize.col('song_id')), 'count'],
      ],
      group: ['song_id'],
      raw: true,
    });
    for (const row of grouped) {
      likeCounts.set(Number(row.song_id), Number(row.count));
    }
  }

  return {
    isArtist: true,
    profile: profileRow(profile),
    albums: albums.map((a) => ({
      id: a.id, title: a.title, coverUrl: a.cover_url ?? null,
      status: a.status, isSingle: a.is_single, releaseDate: a.release_date ?? null,
      releaseAt: a.release_at ?? null,
    })),
    songs: songs.map((s) => ({
      id: s.id, title: s.title, albumId: s.album_id, status: s.status,
      archivedBy: s.archived_by ?? null, isLocked: s.status === 'archived' && s.archived_by === 'admin',
      playCount: s.play_count ?? 0,
      likeCount: likeCounts.get(s.id) ?? 0,
      trackNumber: s.track_number ?? null, durationSeconds: s.duration_seconds ?? null,
      album: s.album ? { id: s.album.id, title: s.album.title } : null,
      coverUrl: s.album ? (s.album.cover_url ?? null) : null,
      artist: { id: profile.id, stageName: profile.stage_name },
      genres: (s.genres || []).map((g) => ({ id: g.id, name: g.name })),
    })),
  };
};

// Admin action: verify (or un-verify) an artist by artist_profile id. Gated by
// manage_catalog at the route. Verification is the publish gate — an unverified
// artist can't create albums/songs. Replaces the manual SQL is_verified flip.
const setVerified = async ({ artistProfileId, isVerified }) => {
  const profile = await db.ArtistProfile.findByPk(artistProfileId);
  if (!profile) throw new ApiError(404, 'Artist profile not found');
  profile.is_verified = Boolean(isVerified);
  await profile.save();
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

// Public discography is capped, not paginated. A normal artist has well under
  // 100 releases so this is invisible to them; the cap only bites a label-scale
  // or decade-deep catalog, where returning EVERY row on this public, high-traffic
  // page would ship a multi-MB payload on each view. 100 matches the ceiling the
  // paginate() helper enforces everywhere else, so the whole API tops out in one
  // place. Newest-first ordering means the cap drops the OLDEST rows, which is the
  // right thing to lose if anything must be lost. Full pagination of this list is
  // noted as follow-up work; until then this is the safe bound.
  const PUBLIC_DISCOGRAPHY_CAP = 100;

  const albums = await db.Album.findAll({
    where: { artist_profile_id: profile.id, status: 'published' },
    order: [['release_date', 'DESC'], ['id', 'DESC']],
    limit: PUBLIC_DISCOGRAPHY_CAP,
  });
  const songs = await db.Song.findAll({
    where: { artist_profile_id: profile.id, status: 'published' },
    order: [['id', 'DESC']],
    limit: PUBLIC_DISCOGRAPHY_CAP,
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
  getMyCatalog,
  setVerified,
  getPublicProfile,
  findProfileByUserId,
  requireOwnProfile,
  profileRow,
};
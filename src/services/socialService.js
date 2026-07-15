'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

// ── Shared helpers ───────────────────────────────────────────────────────────

const paginate = ({ page, limit }) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  return { safeLimit, safePage, offset: (safePage - 1) * safeLimit };
};
const pageMeta = (count, safePage, safeLimit) => ({
  page: safePage,
  limit: safeLimit,
  total: count,
  totalPages: Math.ceil(count / safeLimit),
});

const toId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `Invalid ${label} id`);
  return id;
};

const findPublished = async (Model, id, label) => {
  const row = await Model.findByPk(id);
  if (!row) throw new ApiError(404, `${label} not found`);
  if (row.status !== 'published') {
    throw new ApiError(403, `This ${label.toLowerCase()} is not available`);
  }
  return row;
};

const addRelation = async (Model, where) => {
  const [, created] = await Model.findOrCreate({ where, defaults: where });
  return { added: true, alreadyExisted: !created };
};

const removeRelation = async (Model, where) => {
  const destroyed = await Model.destroy({ where });
  return { removed: true, existed: destroyed > 0 };
};


const songInclude = [
  {
    model: db.ArtistProfile,
    as: 'artistProfile',
    attributes: ['id', 'stage_name'],
    include: [{ model: db.User, as: 'user', attributes: ['username'] }],
  },
  { model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'] },
];

const songRow = (s) => ({
  id: s.id,
  title: s.title,
  playCount: s.play_count ?? 0,
  durationSeconds: s.duration_seconds ?? null,
  album: s.album
    ? { id: s.album.id, title: s.album.title, coverUrl: s.album.cover_url ?? null }
    : null,
  artist: s.artistProfile
    ? {
        id: s.artistProfile.id,
        stageName: s.artistProfile.stage_name,
        username: s.artistProfile.user ? s.artistProfile.user.username : null,
      }
    : null,
});

const albumRow = (a) => ({
  id: a.id,
  title: a.title,
  coverUrl: a.cover_url ?? null,
  isSingle: a.is_single,
  releaseDate: a.release_date ?? null,
  artist: a.artistProfile
    ? {
        id: a.artistProfile.id,
        stageName: a.artistProfile.stage_name,
        username: a.artistProfile.user ? a.artistProfile.user.username : null,
      }
    : null,
});

// A join-table list is always "newest first" by the JOIN row's created_at, not
// the song's. The user wants what they saved most recently — not the most
// recently released thing they happen to have saved.
const listVia = async ({ JoinModel, Target, as, targetKey, userKey, userId, page, limit, map }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const { count, rows } = await JoinModel.findAndCountAll({
    where: { [userKey]: userId },
    include: [
      {
        model: Target,
        as,
        required: true, // inner join: drops rows whose target was hard-deleted
        where: { status: 'published' }, // an artist can archive a song you saved
        include: targetKey,
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });
  return {
    items: rows.map((r) => map(r[as])),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// ── LIKES (songs) ────────────────────────────────────────────────────────────

const likeSong = async ({ actor, songId }) => {
  const id = toId(songId, 'song');
  await findPublished(db.Song, id, 'Song');
  return addRelation(db.Like, { user_id: actor.id, song_id: id });
};

const unlikeSong = async ({ actor, songId }) => {
  const id = toId(songId, 'song');
  // No existence check on the way out. If the song is gone, or was archived,
  // the user still gets to remove it from their library — refusing to let
  // someone clean up after a song they can no longer see would be absurd.
  return removeRelation(db.Like, { user_id: actor.id, song_id: id });
};

const listLikedSongs = async ({ actor, page, limit }) =>
  listVia({
    JoinModel: db.Like,
    Target: db.Song,
    as: 'song',
    targetKey: songInclude,
    userKey: 'user_id',
    userId: actor.id,
    page,
    limit,
    map: songRow,
  });

// ── SAVES (songs + albums) ───────────────────────────────────────────────────

const saveSong = async ({ actor, songId }) => {
  const id = toId(songId, 'song');
  await findPublished(db.Song, id, 'Song');
  return addRelation(db.SavedSong, { user_id: actor.id, song_id: id });
};

const unsaveSong = async ({ actor, songId }) =>
  removeRelation(db.SavedSong, { user_id: actor.id, song_id: toId(songId, 'song') });

const listSavedSongs = async ({ actor, page, limit }) =>
  listVia({
    JoinModel: db.SavedSong,
    Target: db.Song,
    as: 'song',
    targetKey: songInclude,
    userKey: 'user_id',
    userId: actor.id,
    page,
    limit,
    map: songRow,
  });

const saveAlbum = async ({ actor, albumId }) => {
  const id = toId(albumId, 'album');
  await findPublished(db.Album, id, 'Album');
  return addRelation(db.SavedAlbum, { user_id: actor.id, album_id: id });
};

const unsaveAlbum = async ({ actor, albumId }) =>
  removeRelation(db.SavedAlbum, { user_id: actor.id, album_id: toId(albumId, 'album') });

const listSavedAlbums = async ({ actor, page, limit }) =>
  listVia({
    JoinModel: db.SavedAlbum,
    Target: db.Album,
    as: 'album',
    targetKey: [
      {
        model: db.ArtistProfile,
        as: 'artistProfile',
        attributes: ['id', 'stage_name'],
        include: [{ model: db.User, as: 'user', attributes: ['username'] }],
      },
    ],
    userKey: 'user_id',
    userId: actor.id,
    page,
    limit,
    map: albumRow,
  });

// ── FOLLOWS (artists) ────────────────────────────────────────────────────────

const followArtist = async ({ actor, artistProfileId }) => {
  const id = toId(artistProfileId, 'artist');

  const artist = await db.ArtistProfile.findByPk(id, {
    include: [{ model: db.User, as: 'user', attributes: ['id', 'deleted_at'] }],
  });
  if (!artist) throw new ApiError(404, 'Artist not found');

  // An artist profile has no status column — its owner is the thing that can
  // disappear. A soft-deleted user's profile must not be followable, or you'd
  // be accruing followers for an account that no longer exists.
  if (!artist.user || artist.user.deleted_at !== null) {
    throw new ApiError(404, 'Artist not found');
  }

  // Following yourself inflates your own follower count. It's the one number an
  // artist is most tempted to game, so we close it here rather than trusting
  // the UI to hide the button.
  if (artist.user.id === actor.id) {
    throw new ApiError(400, 'You cannot follow yourself');
  }

  return addRelation(db.Follow, { follower_user_id: actor.id, artist_profile_id: id });
};

const unfollowArtist = async ({ actor, artistProfileId }) =>
  removeRelation(db.Follow, {
    follower_user_id: actor.id,
    artist_profile_id: toId(artistProfileId, 'artist'),
  });

const listFollowedArtists = async ({ actor, page, limit }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const { count, rows } = await db.Follow.findAndCountAll({
    where: { follower_user_id: actor.id },
    include: [
      {
        model: db.ArtistProfile,
        as: 'artistProfile',
        required: true,
        include: [
          {
            model: db.User,
            as: 'user',
            required: true,
            // deleted_at MUST be in the attribute list or the check below
            // silently passes and a deleted artist renders as a real one.
            attributes: ['id', 'username', 'deleted_at'],
            where: { deleted_at: null },
          },
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map((f) => ({
      id: f.artistProfile.id,
      stageName: f.artistProfile.stage_name,
      avatarUrl: f.artistProfile.avatar_url ?? null,
      username: f.artistProfile.user ? f.artistProfile.user.username : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const listMyFollowers = async ({ actor, page, limit }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  // Resolve caller -> their own artist profile. No profile means they're not an
  // artist, so the question "who follows me" doesn't apply.
  const myProfile = await db.ArtistProfile.findOne({ where: { user_id: actor.id } });
  if (!myProfile) {
    throw new ApiError(403, 'Only artists have followers');
  }

  const { count, rows } = await db.Follow.findAndCountAll({
    where: { artist_profile_id: myProfile.id },
    include: [
      {
        model: db.User,
        as: 'follower',
        required: true,
        // A soft-deleted user must not show up as a follower. Their row survives
        // for restore, but they're gone from every public-facing count and list.
        attributes: ['id', 'username', 'display_name', 'deleted_at'],
        where: { deleted_at: null },
      },
    ],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    items: rows.map((f) => ({
      userId: f.follower.id,
      username: f.follower.username ?? null,
      displayName: f.follower.display_name ?? null,
      followedAt: f.created_at,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// ── Status (does the current user like/save/follow this?) ────────────────────
//
// One endpoint, not three round trips. A song page needs "is it liked AND is it
// saved" to paint its buttons; asking twice doubles the latency for no reason.

const getSongStatus = async ({ actor, songId }) => {
  const id = toId(songId, 'song');
  const [liked, saved, likeCount] = await Promise.all([
    db.Like.count({ where: { user_id: actor.id, song_id: id } }),
    db.SavedSong.count({ where: { user_id: actor.id, song_id: id } }),
    db.Like.count({ where: { song_id: id } }),
  ]);
  return { songId: id, liked: liked > 0, saved: saved > 0, likeCount };
};

const getAlbumStatus = async ({ actor, albumId }) => {
  const id = toId(albumId, 'album');
  const saved = await db.SavedAlbum.count({ where: { user_id: actor.id, album_id: id } });
  return { albumId: id, saved: saved > 0 };
};

const getArtistStatus = async ({ actor, artistProfileId }) => {
  const id = toId(artistProfileId, 'artist');
  const [following, followerCount] = await Promise.all([
    db.Follow.count({ where: { follower_user_id: actor.id, artist_profile_id: id } }),
    db.Follow.count({ where: { artist_profile_id: id } }),
  ]);
  return { artistProfileId: id, following: following > 0, followerCount };
};

module.exports = {
  likeSong,
  unlikeSong,
  listLikedSongs,
  saveSong,
  unsaveSong,
  listSavedSongs,
  saveAlbum,
  unsaveAlbum,
  listSavedAlbums,
  followArtist,
  unfollowArtist,
  listFollowedArtists,
  listMyFollowers,
  getSongStatus,
  getAlbumStatus,
  getArtistStatus,
};
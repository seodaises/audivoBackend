'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const VALID_SOURCES = ['browse', 'album', 'playlist', 'queue', 'search', 'artist'];

const recordPlay = async ({ actor, songId, msPlayed, source }) => {
  const id = Number(songId);
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, 'Invalid song id');
  }

  const src = source || 'browse';
  if (!VALID_SOURCES.includes(src)) {
    throw new ApiError(400, `source must be one of: ${VALID_SOURCES.join(', ')}`);
  }
  let ms = null;
  if (msPlayed !== undefined && msPlayed !== null && msPlayed !== '') {
    ms = Number(msPlayed);
    if (!Number.isFinite(ms) || ms < 0) {
      throw new ApiError(400, 'msPlayed must be a non-negative number');
    }
    ms = Math.floor(ms);
  }

  const song = await db.Song.findByPk(id);
  if (!song) throw new ApiError(404, 'Song not found');

  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available for playback');
  }

  let isSelfPlay = false;
  if (actor?.id) {
    const profile = await db.ArtistProfile.findOne({
      where: { user_id: actor.id },
      attributes: ['id'],
    });
    isSelfPlay = Boolean(profile) && profile.id === song.artist_profile_id;
  }

  await db.sequelize.transaction(async (t) => {
    await db.PlayHistory.create(
      {
        user_id: actor?.id ?? null, // nullable by design: anonymous + deleted users
        song_id: id,
        ms_played: ms,
        source: src,
        is_self_play: isSelfPlay,
      },
      { transaction: t }
    );

    if (!isSelfPlay) {

      await db.Song.increment('play_count', {
        by: 1,
        where: { id },
        transaction: t,
      });
    }
  });

  const updated = await db.Song.findByPk(id, { attributes: ['id', 'play_count'] });

  return {
    songId: updated.id,
    playCount: updated.play_count,
  };
};

const historySongRow = (song) => ({
  id: song.id,
  albumId: song.album_id,
  artistProfileId: song.artist_profile_id,
  title: song.title,
  durationSeconds: song.duration_seconds ?? null,
  status: song.status,
  playCount: song.play_count,
  coverUrl: song.album ? (song.album.cover_url ?? null) : null,
  album: song.album ? { id: song.album.id, title: song.album.title } : null,
  artistProfile: song.artistProfile
    ? { id: song.artistProfile.id, stageName: song.artistProfile.stage_name }
    : null,
});

const includeForSong = [
  { model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'] },
  { model: db.ArtistProfile, as: 'artistProfile', attributes: ['id', 'stage_name'] },
];

const getRecentlyPlayed = async ({ actor, limit = 20 }) => {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const rows = await db.PlayHistory.findAll({
    where: { user_id: actor.id },
    attributes: [
      'song_id',
      [db.sequelize.fn('MAX', db.sequelize.col('played_at')), 'last_played'],
    ],
    group: ['song_id'],
    order: [[db.sequelize.literal('last_played'), 'DESC']],
    limit: lim,
    raw: true,
  });

  const songIds = rows.map((r) => r.song_id);
  if (songIds.length === 0) return { items: [] };

  const songs = await db.Song.findAll({
    where: { id: songIds, status: 'published' },
    include: includeForSong,
  });
  const byId = new Map(songs.map((s) => [s.id, s]));
  const items = songIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map(historySongRow);

  return { items };
};

const getMostPlayed = async ({ actor, limit = 20 }) => {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const rows = await db.PlayHistory.findAll({
    where: { user_id: actor.id },
    attributes: [
      'song_id',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'play_total'],
    ],
    group: ['song_id'],
    order: [[db.sequelize.literal('play_total'), 'DESC']],
    limit: lim,
    raw: true,
  });

  const counts = new Map(rows.map((r) => [r.song_id, Number(r.play_total)]));
  const songIds = rows.map((r) => r.song_id);
  if (songIds.length === 0) return { items: [] };

  const songs = await db.Song.findAll({
    where: { id: songIds, status: 'published' },
    include: includeForSong,
  });
  const byId = new Map(songs.map((s) => [s.id, s]));
  const items = songIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((s) => ({ ...historySongRow(s), myPlayCount: counts.get(s.id) || 0 }));

  return { items };
};

module.exports = { recordPlay, getRecentlyPlayed, getMostPlayed };
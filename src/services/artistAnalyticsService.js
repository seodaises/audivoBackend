'use strict';
const db = require('../models');
const {Op, fn, col, literal} = db.Sequelize;

const WEIGHT_PLAY = 1;
const WEIGHT_LIKE = 2;
const WEIGHT_SAVE = 3;

const WINDOW_DAYS = 30;
const resolveWindow = (range) => {
  if (range === 'all') return { days: null, since: null };
  return {
    days: WINDOW_DAYS,
    since: new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000),
  };
};
const countBySong = async ({ model, dateColumn, since, songIds, extraWhere = {} }) => {
  if (songIds.length === 0) return new Map();

  const where = { song_id: { [Op.in]: songIds }, ...extraWhere };
  if (since) where[dateColumn] = { [Op.gte]: since };

  const rows = await model.findAll({
    attributes: [[col('song_id'), 'key'], [fn('COUNT', literal('*')), 'n']],
    where,
    group: [col('song_id')],
    raw: true,
  });
  return new Map(rows.map((r) => [Number(r.key), Number(r.n)]));
};


const findOwnProfile = (userId) =>
  db.ArtistProfile.findOne({ where: { user_id: userId }, attributes: ['id', 'stage_name'] });

const myTrackPerformance = async ({ userId, range } = {}) => {
  const { days, since } = resolveWindow(range);
  const profile = await findOwnProfile(userId);

  if (!profile) {
    return { artistProfileId: null, window: { days, since, range: days ? '30d' : 'all' }, tracks: [] };
  }
  const songs = await db.Song.findAll({
    where: { artist_profile_id: profile.id,status: { [Op.ne]: 'draft' }},
    attributes: ['id', 'title', 'status', 'album_id', 'duration_seconds', 'archived_by'],
    include: [{ model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'], required: false }],
  });

  if (songs.length === 0) {
    return {
      artistProfileId: profile.id,
      window: { days, since, range: days ? '30d' : 'all' },
      tracks: [],
    };
  }

  const songIds = songs.map((s) => s.id);

  const [plays, likes, saves] = await Promise.all([
    countBySong({
      model: db.PlayHistory,
      dateColumn: 'played_at',
      since,
      songIds,
      extraWhere: { is_self_play: false },
    }),
    countBySong({ model: db.Like, dateColumn: 'created_at', since, songIds }),
    countBySong({ model: db.SavedSong, dateColumn: 'created_at', since, songIds }),
  ]);

  const scored = songs.map((s) => {
    const p = plays.get(s.id) ?? 0;
    const l = likes.get(s.id) ?? 0;
    const v = saves.get(s.id) ?? 0;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      archivedBy: s.archived_by ?? null,
      albumId: s.album_id,
      album: s.album ? { id: s.album.id, title: s.album.title } : null,
      coverUrl: s.album ? (s.album.cover_url ?? null) : null,
      durationSeconds: s.duration_seconds ?? null,
      plays: p,
      likes: l,
      saves: v,
      score: p * WEIGHT_PLAY + l * WEIGHT_LIKE + v * WEIGHT_SAVE,
      breakdown: {
        playPoints: p * WEIGHT_PLAY,
        likePoints: l * WEIGHT_LIKE,
        savePoints: v * WEIGHT_SAVE,
      },
    };
  });

  const ranked = scored
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .map((t, i) => ({ ...t, rank: i + 1 }));

  const totals = ranked.reduce(
    (acc, t) => ({
      plays: acc.plays + t.plays,
      likes: acc.likes + t.likes,
      saves: acc.saves + t.saves,
      score: acc.score + t.score,
    }),
    { plays: 0, likes: 0, saves: 0, score: 0 },
  );

  return {
    artistProfileId: profile.id,
    stageName: profile.stage_name,
    window: { days, since, range: days ? '30d' : 'all' },
    weights: { play: WEIGHT_PLAY, like: WEIGHT_LIKE, save: WEIGHT_SAVE },
    totals,
    trackCount: ranked.length,
    tracks: ranked,
  };
};

module.exports = { myTrackPerformance };
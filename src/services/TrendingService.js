'use strict';
const db = require('../models');
const { Op, fn, col, literal } = db.Sequelize;

// SCORE = plays + (2 x likes) + (3 x saves)
const WEIGHT_PLAY = 1;
const WEIGHT_LIKE = 2;
const WEIGHT_SAVE = 3;

// The rolling window. 30 days is long enough that a small catalogue still
// produces a non-empty list, short enough that the ranking actually moves.
const WINDOW_DAYS = 30;

const windowStart = () => new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

const clampLimit = (limit, fallback = 10, max = 50) =>
  Math.min(Math.max(parseInt(limit, 10) || fallback, 1), max);

// Counting helper. Every trending query is the same shape: count rows in one
// table, inside the window, grouped by a foreign key. Doing it as three small
// grouped queries and combining in JS — rather than one query with three
// correlated subqueries — keeps each query trivially readable and avoids the
// row-multiplication trap where joining plays AND likes AND saves in a single
// statement multiplies counts by each other.
//
// Returns a Map of key -> count.
const countByKey = async ({ model, keyColumn, dateColumn, since, extraWhere = {}, include = [] }) => {
  const rows = await model.findAll({
    attributes: [[col(keyColumn), 'key'], [fn('COUNT', literal('*')), 'n']],
    where: { [dateColumn]: { [Op.gte]: since }, ...extraWhere },
    include,
    group: [col(keyColumn)],
    raw: true,
  });
  return new Map(rows.map((r) => [Number(r.key), Number(r.n)]));
};

// Merge weighted signal maps into a ranked array of { id, plays, likes, saves, score }.
const scoreAndRank = ({ plays, likes, saves, limit }) => {
  const ids = new Set([...plays.keys(), ...likes.keys(), ...saves.keys()]);

  return [...ids]
    .map((id) => {
      const p = plays.get(id) ?? 0;
      const l = likes.get(id) ?? 0;
      const s = saves.get(id) ?? 0;
      return {
        id,
        plays: p,
        likes: l,
        saves: s,
        score: p * WEIGHT_PLAY + l * WEIGHT_LIKE + s * WEIGHT_SAVE,
      };
    })
    // Ties broken by id ASC so the ordering is deterministic across requests —
    // an unstable sort would make the list jitter between identical calls.
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
};

// ─────────────────────────────────────────────────────────────────────────────
// SONGS
// ─────────────────────────────────────────────────────────────────────────────
const trendingSongs = async ({ limit } = {}) => {
  const lim = clampLimit(limit);
  const since = windowStart();

  const [plays, likes, saves] = await Promise.all([
    // is_self_play is excluded here and nowhere else matters more: without it an
    // artist can trend their own track by replaying it. This is the flag's
    // entire reason for existing.
    countByKey({
      model: db.PlayHistory,
      keyColumn: 'song_id',
      dateColumn: 'played_at',
      since,
      extraWhere: { is_self_play: false },
    }),
    countByKey({ model: db.Like, keyColumn: 'song_id', dateColumn: 'created_at', since }),
    countByKey({ model: db.SavedSong, keyColumn: 'song_id', dateColumn: 'created_at', since }),
  ]);

  // Over-fetch before the status filter: a song can score well and then turn out
  // to be archived, and dropping it after slicing to `limit` would silently
  // return a short list. Scoring a wider set and trimming after keeps it full.
  const ranked = scoreAndRank({ plays, likes, saves, limit: lim * 3 });
  if (ranked.length === 0) return { songs: [], window: { days: WINDOW_DAYS, since } };

  const songs = await db.Song.findAll({
    where: { id: { [Op.in]: ranked.map((r) => r.id) }, status: 'published' },
    include: [
      {
        model: db.ArtistProfile,
        as: 'artistProfile',
        attributes: ['id', 'stage_name'],
        required: true,
        include: [{
          model: db.User,
          as: 'user',
          attributes: ['username'],
          // Tombstoned artists must not surface on a listener page.
          where: { deleted_at: null },
          required: true,
        }],
      },
      { model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'], required: false },
    ],
  });

  const byId = new Map(songs.map((s) => [s.id, s]));

  return {
    songs: ranked
      .filter((r) => byId.has(r.id))
      .slice(0, lim)
      .map((r, i) => {
        const s = byId.get(r.id);
        return {
          // Same row shape browseSongs returns, so SongCard binds with no adapter.
          id: s.id,
          title: s.title,
          albumId: s.album_id,
          album: s.album ? { id: s.album.id, title: s.album.title } : null,
          coverUrl: s.album ? (s.album.cover_url ?? null) : null,
          artist: s.artistProfile
            ? {
                id: s.artistProfile.id,
                stageName: s.artistProfile.stage_name,
                username: s.artistProfile.user ? s.artistProfile.user.username : null,
              }
            : null,
          durationSeconds: s.duration_seconds ?? null,
          // Trending-specific extras. Exposed rather than hidden so the ranking
          // is legible in the UI instead of being an unexplained black box.
          rank: i + 1,
          score: r.score,
          plays: r.plays,
          likes: r.likes,
          saves: r.saves,
        };
      }),
    window: { days: WINDOW_DAYS, since },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ALBUMS
//
// An album has no plays of its own — it inherits them from its songs. Album
// likes don't exist as a concept, so the signals are: plays of its tracks, and
// saves of the album itself. Summed, not averaged: a 12-track album genuinely
// generating more listening IS trending harder than a 3-track one. Averaging
// would be defensible too, but sum is the simpler claim to defend.
// ─────────────────────────────────────────────────────────────────────────────
const trendingAlbums = async ({ limit } = {}) => {
  const lim = clampLimit(limit);
  const since = windowStart();

  const [plays, saves] = await Promise.all([
    countByKey({
      model: db.PlayHistory,
      keyColumn: 'song.album_id',
      dateColumn: 'played_at',
      since,
      extraWhere: { is_self_play: false },
      // The joined song must be PUBLISHED. Without this the aggregate counts
      // plays of archived or draft tracks toward their album's score — an
      // artist could archive a song and it would still push the album up the
      // chart. `required: true` makes it an INNER JOIN so non-matching rows
      // drop out of the count entirely.
      include: [{
        model: db.Song, as: 'song', attributes: [],
        where: { status: 'published' }, required: true,
      }],
    }),
    countByKey({ model: db.SavedAlbum, keyColumn: 'album_id', dateColumn: 'created_at', since }),
  ]);

  const ranked = scoreAndRank({ plays, likes: new Map(), saves, limit: lim * 3 });
  if (ranked.length === 0) return { albums: [], window: { days: WINDOW_DAYS, since } };

  const albums = await db.Album.findAll({
    where: { id: { [Op.in]: ranked.map((r) => r.id) }, status: 'published' },
    include: [{
      model: db.ArtistProfile,
      as: 'artistProfile',
      attributes: ['id', 'stage_name'],
      required: true,
      include: [{
        model: db.User, as: 'user', attributes: ['username'],
        where: { deleted_at: null }, required: true,
      }],
    }],
  });

  const byId = new Map(albums.map((a) => [a.id, a]));

  return {
    albums: ranked
      .filter((r) => byId.has(r.id))
      .slice(0, lim)
      .map((r, i) => {
        const a = byId.get(r.id);
        return {
          id: a.id,
          title: a.title,
          coverUrl: a.cover_url ?? null,
          releaseDate: a.release_date ?? null,
          isSingle: a.is_single ?? false,
          artist: a.artistProfile
            ? {
                id: a.artistProfile.id,
                stageName: a.artistProfile.stage_name,
                username: a.artistProfile.user ? a.artistProfile.user.username : null,
              }
            : null,
          rank: i + 1,
          score: r.score,
          plays: r.plays,
          saves: r.saves,
        };
      }),
    window: { days: WINDOW_DAYS, since },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ARTISTS
//
// Signals: plays of their songs, plus new follows in the window. Follows are
// weighted as saves — following an artist is the same kind of commitment as
// saving a track, arguably stronger.
// ─────────────────────────────────────────────────────────────────────────────
const trendingArtists = async ({ limit } = {}) => {
  const lim = clampLimit(limit);
  const since = windowStart();

  const [plays, follows] = await Promise.all([
    countByKey({
      model: db.PlayHistory,
      keyColumn: 'song.artist_profile_id',
      dateColumn: 'played_at',
      since,
      extraWhere: { is_self_play: false },
      // Same reasoning as albums: only published tracks count toward an
      // artist's trending score.
      include: [{
        model: db.Song, as: 'song', attributes: [],
        where: { status: 'published' }, required: true,
      }],
    }),
    countByKey({
      model: db.Follow,
      keyColumn: 'artist_profile_id',
      dateColumn: 'created_at',
      since,
    }),
  ]);

  const ranked = scoreAndRank({ plays, likes: new Map(), saves: follows, limit: lim * 3 });
  if (ranked.length === 0) return { artists: [], window: { days: WINDOW_DAYS, since } };

  const artists = await db.ArtistProfile.findAll({
    where: { id: { [Op.in]: ranked.map((r) => r.id) } },
    include: [
      {
        model: db.User, as: 'user', attributes: ['username'],
        where: { deleted_at: null }, required: true,
      },
      // An artist with no published song is not a public entity yet.
      { model: db.Song, as: 'songs', attributes: [], where: { status: 'published' }, required: true },
    ],
    subQuery: true,
  });

  const byId = new Map(artists.map((a) => [a.id, a]));

  return {
    artists: ranked
      .filter((r) => byId.has(r.id))
      .slice(0, lim)
      .map((r, i) => {
        const a = byId.get(r.id);
        return {
          id: a.id,
          stageName: a.stage_name,
          username: a.user ? a.user.username : null,
          avatarUrl: a.avatar_url ?? null,
          rank: i + 1,
          score: r.score,
          plays: r.plays,
          follows: r.saves,
        };
      }),
    window: { days: WINDOW_DAYS, since },
  };
};

module.exports = { trendingSongs, trendingAlbums, trendingArtists };
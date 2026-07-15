'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { Op } = db.Sequelize;

const STEP = 1000; // gap between appended tracks — room to insert without rebalancing
const REBALANCE_THRESHOLD = 0.0000001; // gap below this = precision danger

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

const cleanTitle = (title) => {
  const t = String(title || '').trim();
  if (!t) throw new ApiError(400, 'Title is required');
  if (t.length > 255) throw new ApiError(400, 'Title must be 255 characters or fewer');
  return t;
};

// ── Access rules ─────────────────────────────────────────────────────────────
//
// Two different questions, two different helpers. Conflating them is how you
// end up letting a stranger rename someone else's playlist.
//
//   canRead  — mine, OR public. (A public playlist is readable by anyone.)
//   canWrite — mine. Full stop. Public does not mean editable.

const findPlaylistOr404 = async (id) => {
  const playlist = await db.Playlist.findOne({ where: { id, deleted_at: null } });
  if (!playlist) throw new ApiError(404, 'Playlist not found');
  return playlist;
};

const findReadable = async ({ actor, playlistId }) => {
  const playlist = await findPlaylistOr404(toId(playlistId, 'playlist'));
  const mine = playlist.user_id === actor.id;
  if (!mine && !playlist.is_public) {
    // 404, not 403. A 403 confirms the playlist exists — which leaks the
    // existence of private playlists to anyone willing to probe ids.
    throw new ApiError(404, 'Playlist not found');
  }
  return playlist;
};

const findWritable = async ({ actor, playlistId }) => {
  const playlist = await findPlaylistOr404(toId(playlistId, 'playlist'));
  if (playlist.user_id !== actor.id) {
    throw new ApiError(403, 'You can only modify your own playlists');
  }
  return playlist;
};

// ── Row shapes ───────────────────────────────────────────────────────────────

const playlistRow = (p, trackCount = undefined) => ({
  id: p.id,
  title: p.title,
  description: p.description ?? null,
  coverUrl: p.cover_url ?? null,
  isPublic: p.is_public,
  createdAt: p.created_at,
  ...(trackCount !== undefined ? { trackCount } : {}),
});

const trackRow = (ps) => ({
  playlistSongId: ps.id, // the JOIN row's id — NOT the song id
  position: ps.position,
  addedAt: ps.added_at,
  song: ps.song
    ? {
        id: ps.song.id,
        title: ps.song.title,
        durationSeconds: ps.song.duration_seconds ?? null,
        playCount: ps.song.play_count ?? 0,
        album: ps.song.album
          ? {
              id: ps.song.album.id,
              title: ps.song.album.title,
              coverUrl: ps.song.album.cover_url ?? null,
            }
          : null,
        artist: ps.song.artistProfile
          ? {
              id: ps.song.artistProfile.id,
              stageName: ps.song.artistProfile.stage_name,
              username: ps.song.artistProfile.user
                ? ps.song.artistProfile.user.username
                : null,
            }
          : null,
      }
    : null,
});

const songInclude = {
  model: db.Song,
  as: 'song',
  required: true, // inner join — drops tracks whose song was hard-deleted
  where: { status: 'published' }, // an artist can archive a song in your playlist
  include: [
    {
      model: db.ArtistProfile,
      as: 'artistProfile',
      attributes: ['id', 'stage_name'],
      include: [{ model: db.User, as: 'user', attributes: ['username'] }],
    },
    { model: db.Album, as: 'album', attributes: ['id', 'title', 'cover_url'] },
  ],
};

// ── Playlist CRUD ────────────────────────────────────────────────────────────

const createPlaylist = async ({ actor, title, description, isPublic }) => {
  const playlist = await db.Playlist.create({
    user_id: actor.id,
    title: cleanTitle(title),
    description: description ? String(description).trim() : null,
    is_public: isPublic === true || isPublic === 'true',
  });
  return playlistRow(playlist, 0);
};

const listMyPlaylists = async ({ actor, page, limit }) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });
  const { count, rows } = await db.Playlist.findAndCountAll({
    where: { user_id: actor.id, deleted_at: null },
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
  });

  // Track counts in ONE grouped query, not one per playlist. The naive version
  // is an N+1: 50 playlists = 51 round trips to the database.
  const ids = rows.map((p) => p.id);
  const counts = ids.length
    ? await db.PlaylistSong.findAll({
        attributes: [
          'playlist_id',
          [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count'],
        ],
        where: { playlist_id: { [Op.in]: ids } },
        group: ['playlist_id'],
        raw: true,
      })
    : [];
  const countMap = counts.reduce((acc, c) => {
    acc[c.playlist_id] = Number(c.count);
    return acc;
  }, {});

  return {
    items: rows.map((p) => playlistRow(p, countMap[p.id] || 0)),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

// Discovery: every PUBLIC playlist, from anyone, searchable by title.
//
// Distinct from listMyPlaylists in two ways that matter:
//   - filters on is_public, not on user_id — this is how a playlist someone
//     else made becomes findable at all (the whole point the "Public" toggle
//     was promising and nothing delivered).
//   - joins the owner so the list can say WHOSE playlist it is; a discovery
//     surface with no author is anonymous and useless.
//
// Ownership is NOT required here — a public playlist stays discoverable even if
// its owner is soft-deleted; publicProfile-style handling would hide the name,
// but that's a later refinement, not a blocker.
const listPublicPlaylists = async ({ actor, page, limit, search } = {}) => {
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const where = { is_public: true, deleted_at: null };

  // Title search. Manual wildcard escaping so a literal % or _ in the query is
  // matched as itself, not as a wildcard — same pattern as the admin searches.
  const term = String(search || '').trim();
  if (term) {
    const escaped = term.replace(/[%_\\]/g, (c) => `\\${c}`);
    where.title = { [Op.like]: `%${escaped}%` };
  }

  const { count, rows } = await db.Playlist.findAndCountAll({
    where,
    include: [{ model: db.User, as: 'owner', attributes: ['id', 'username', 'display_name'] }],
    order: [['created_at', 'DESC']],
    limit: safeLimit,
    offset,
    distinct: true,
  });

  // Same grouped-count query as listMyPlaylists — one round trip, not one per row.
  const ids = rows.map((p) => p.id);
  const counts = ids.length
    ? await db.PlaylistSong.findAll({
        attributes: [
          'playlist_id',
          [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count'],
        ],
        where: { playlist_id: { [Op.in]: ids } },
        group: ['playlist_id'],
        raw: true,
      })
    : [];
  const countMap = counts.reduce((acc, c) => {
    acc[c.playlist_id] = Number(c.count);
    return acc;
  }, {});

  return {
    items: rows.map((p) => ({
      ...playlistRow(p, countMap[p.id] || 0),
      isMine: p.user_id === actor.id, // let the UI tag "your" playlists in the discover list
      owner: p.owner
        ? { id: p.owner.id, username: p.owner.username, displayName: p.owner.display_name }
        : null,
    })),
    pagination: pageMeta(count, safePage, safeLimit),
  };
};

const getPlaylist = async ({ actor, playlistId, page, limit }) => {
  const playlist = await findReadable({ actor, playlistId });
  const { safeLimit, safePage, offset } = paginate({ page, limit });

  const { count, rows } = await db.PlaylistSong.findAndCountAll({
    where: { playlist_id: playlist.id },
    include: [songInclude],
    order: [['position', 'ASC']], // position IS the order — never id, never added_at
    limit: safeLimit,
    offset,
    distinct: true,
  });

  return {
    playlist: playlistRow(playlist, count),
    tracks: rows.map(trackRow),
    pagination: pageMeta(count, safePage, safeLimit),
    isOwner: playlist.user_id === actor.id,
  };
};

const updatePlaylist = async ({ actor, playlistId, title, description, isPublic }) => {
  const playlist = await findWritable({ actor, playlistId });

  if (title !== undefined) playlist.title = cleanTitle(title);
  if (description !== undefined) {
    playlist.description = description ? String(description).trim() : null;
  }
  if (isPublic !== undefined) {
    playlist.is_public = isPublic === true || isPublic === 'true';
  }

  await playlist.save();
  return playlistRow(playlist);
};

const deletePlaylist = async ({ actor, playlistId }) => {
  const playlist = await findWritable({ actor, playlistId });

  // Soft delete, matching users. The playlist_songs rows are left alone — they
  // are meaningless without their parent, and keeping them means an undelete is
  // a single UPDATE rather than a reconstruction.
  playlist.deleted_at = new Date();
  await playlist.save();

  return { id: playlist.id, deleted: true };
};

// ── Track management ─────────────────────────────────────────────────────────

// Renumber a playlist to clean integers × STEP. The expensive operation —
// called only when fractional gaps get too small to subdivide safely.
const rebalance = async (playlistId, transaction) => {
  const tracks = await db.PlaylistSong.findAll({
    where: { playlist_id: playlistId },
    order: [['position', 'ASC']],
    transaction,
  });
  for (let i = 0; i < tracks.length; i += 1) {
    await db.PlaylistSong.update(
      { position: (i + 1) * STEP },
      { where: { id: tracks[i].id }, transaction }
    );
  }
};

const addTrack = async ({ actor, playlistId, songId, afterPlaylistSongId }) => {
  const playlist = await findWritable({ actor, playlistId });
  const sid = toId(songId, 'song');

  const song = await db.Song.findByPk(sid);
  if (!song) throw new ApiError(404, 'Song not found');
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available');
  }

  // NOTE: duplicates are ALLOWED. There is no unique index on
  // (playlist_id, song_id) and that is deliberate — a playlist may legitimately
  // contain the same song twice (a reprise, a DJ set, a joke). This is the
  // opposite of likes/saves, where a duplicate is meaningless.

  let position;
  let needsRebalance = false;

  if (afterPlaylistSongId === undefined || afterPlaylistSongId === null || afterPlaylistSongId === '') {
    // APPEND — the common case. One query for the current max.
    const max = await db.PlaylistSong.max('position', {
      where: { playlist_id: playlist.id },
    });
    position = (max === null || max === undefined ? 0 : Number(max)) + STEP;
  } else {
    // INSERT AFTER a specific track.
    const anchorId = toId(afterPlaylistSongId, 'playlist track');
    const anchor = await db.PlaylistSong.findOne({
      where: { id: anchorId, playlist_id: playlist.id }, // scoped: can't anchor to another playlist's row
    });
    if (!anchor) throw new ApiError(404, 'Anchor track not found in this playlist');

    // The next track after the anchor, if any.
    const next = await db.PlaylistSong.findOne({
      where: { playlist_id: playlist.id, position: { [Op.gt]: anchor.position } },
      order: [['position', 'ASC']],
    });

    if (!next) {
      position = Number(anchor.position) + STEP; // anchor was last → plain append
    } else {
      const gap = Number(next.position) - Number(anchor.position);
      if (gap < REBALANCE_THRESHOLD) {
        needsRebalance = true; // gap too small to subdivide — renumber first
      } else {
        position = (Number(anchor.position) + Number(next.position)) / 2; // midpoint
      }
    }

    if (needsRebalance) {
      // Rebalance, then recompute the midpoint against the fresh positions.
      await db.sequelize.transaction(async (t) => {
        await rebalance(playlist.id, t);
        const a = await db.PlaylistSong.findByPk(anchorId, { transaction: t });
        const n = await db.PlaylistSong.findOne({
          where: { playlist_id: playlist.id, position: { [Op.gt]: a.position } },
          order: [['position', 'ASC']],
          transaction: t,
        });
        position = n
          ? (Number(a.position) + Number(n.position)) / 2
          : Number(a.position) + STEP;
        await db.PlaylistSong.create(
          { playlist_id: playlist.id, song_id: sid, position },
          { transaction: t }
        );
      });
      const created = await db.PlaylistSong.findOne({
        where: { playlist_id: playlist.id, song_id: sid, position },
      });
      return { playlistSongId: created.id, position: created.position, rebalanced: true };
    }
  }

  const row = await db.PlaylistSong.create({
    playlist_id: playlist.id,
    song_id: sid,
    position,
  });

  return { playlistSongId: row.id, position: row.position, rebalanced: false };
};

const removeTrack = async ({ actor, playlistId, playlistSongId }) => {
  const playlist = await findWritable({ actor, playlistId });
  const id = toId(playlistSongId, 'playlist track');

  // Scoped to THIS playlist. Without the playlist_id in the where clause, you
  // could delete a row out of someone else's playlist by guessing its id.
  const destroyed = await db.PlaylistSong.destroy({
    where: { id, playlist_id: playlist.id },
  });

  if (!destroyed) throw new ApiError(404, 'Track not found in this playlist');

  // Removing never leaves a hole that matters — position is an ordering, not an
  // index. Gaps are fine. No renumbering needed.
  return { removed: true };
};

// Move a track between two others. THE payoff of fractional positioning:
// exactly one row is written, no matter how long the playlist is.
const moveTrack = async ({ actor, playlistId, playlistSongId, afterPlaylistSongId }) => {
  const playlist = await findWritable({ actor, playlistId });
  const id = toId(playlistSongId, 'playlist track');

  const track = await db.PlaylistSong.findOne({
    where: { id, playlist_id: playlist.id },
  });
  if (!track) throw new ApiError(404, 'Track not found in this playlist');

  let position;

  if (afterPlaylistSongId === undefined || afterPlaylistSongId === null || afterPlaylistSongId === '') {
    // Move to the very front: half of the current first position.
    const first = await db.PlaylistSong.findOne({
      where: { playlist_id: playlist.id, id: { [Op.ne]: id } },
      order: [['position', 'ASC']],
    });
    position = first ? Number(first.position) / 2 : STEP;
  } else {
    const anchorId = toId(afterPlaylistSongId, 'playlist track');
    if (anchorId === id) throw new ApiError(400, 'A track cannot be moved after itself');

    const anchor = await db.PlaylistSong.findOne({
      where: { id: anchorId, playlist_id: playlist.id },
    });
    if (!anchor) throw new ApiError(404, 'Anchor track not found in this playlist');

    const next = await db.PlaylistSong.findOne({
      where: {
        playlist_id: playlist.id,
        position: { [Op.gt]: anchor.position },
        id: { [Op.ne]: id }, // ignore the row we're moving — it may sit in this gap
      },
      order: [['position', 'ASC']],
    });

    if (!next) {
      position = Number(anchor.position) + STEP;
    } else {
      const gap = Number(next.position) - Number(anchor.position);
      if (gap < REBALANCE_THRESHOLD) {
        // Renumber, then recompute against fresh positions.
        await db.sequelize.transaction(async (t) => {
          await rebalance(playlist.id, t);
          const a = await db.PlaylistSong.findByPk(anchorId, { transaction: t });
          const n = await db.PlaylistSong.findOne({
            where: {
              playlist_id: playlist.id,
              position: { [Op.gt]: a.position },
              id: { [Op.ne]: id },
            },
            order: [['position', 'ASC']],
            transaction: t,
          });
          const pos = n
            ? (Number(a.position) + Number(n.position)) / 2
            : Number(a.position) + STEP;
          await db.PlaylistSong.update(
            { position: pos },
            { where: { id }, transaction: t }
          );
        });
        const moved = await db.PlaylistSong.findByPk(id);
        return { moved: true, position: moved.position, rebalanced: true };
      }
      position = (Number(anchor.position) + Number(next.position)) / 2;
    }
  }

  // ONE row updated. Not the 198 rows an integer scheme would have rewritten.
  track.position = position;
  await track.save();

  return { moved: true, position: track.position, rebalanced: false };
};

module.exports = {
  createPlaylist,
  listMyPlaylists,
  listPublicPlaylists,
  getPlaylist,
  updatePlaylist,
  deletePlaylist,
  addTrack,
  removeTrack,
  moveTrack,
};
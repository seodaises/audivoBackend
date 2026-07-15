'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

// The ENUM on play_history.source. MySQL will reject anything outside this list
// with a 500, so we validate here and hand back a clean 400 instead of letting
// a bad client payload look like a server bug.
const VALID_SOURCES = ['browse', 'album', 'playlist', 'queue', 'search', 'artist'];

// Spotify counts a play at ~30s. We don't have a real threshold yet, so every
// call to this endpoint is a play — but ms_played is recorded so the rule can be
// applied retroactively later, from play_history, without losing data.
// This is exactly why play_history exists: play_count can't answer "was that a
// real listen?", and it never will be able to.

const recordPlay = async ({ actor, songId, msPlayed, source }) => {
  const id = Number(songId);
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, 'Invalid song id');
  }

  const src = source || 'browse';
  if (!VALID_SOURCES.includes(src)) {
    throw new ApiError(400, `source must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  // ms_played is optional (the client may fire on play-start, before it knows).
  // But if it's sent, it must be a sane non-negative integer — a negative
  // duration in the analytics table is a number nobody can explain later.
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

  // Same gate catalogService uses. A draft or archived song isn't publicly
  // reachable, so a play on one can only come from a hand-crafted request —
  // and counting it would let an artist inflate their own numbers by replaying
  // a track they never released.
  if (song.status !== 'published') {
    throw new ApiError(403, 'This song is not available for playback');
  }

  // BOTH writes, or NEITHER. This is the whole point of the transaction.
  //
  // play_count is a denormalized read cache of play_history. If the history row
  // lands and the counter doesn't, the cache is silently wrong and there is no
  // error anywhere to tell you. Analytics quietly drift from the source of
  // truth, and you find out months later when the numbers stop adding up.
  await db.sequelize.transaction(async (t) => {
    await db.PlayHistory.create(
      {
        user_id: actor?.id ?? null, // nullable by design: anonymous + deleted users
        song_id: id,
        ms_played: ms,
        source: src,
      },
      { transaction: t }
    );

    // increment(), not `song.play_count += 1; song.save()`.
    //
    // The read-modify-write version loses plays under concurrency: two requests
    // both read 10, both write 11, and one play vanishes. increment() emits
    // `UPDATE songs SET play_count = play_count + 1` — the database does the
    // arithmetic atomically, so the row is never read into JS at all.
    await db.Song.increment('play_count', {
      by: 1,
      where: { id },
      transaction: t,
    });
  });

  // Re-read so the client gets the true post-increment value rather than the
  // stale one we loaded before the transaction.
  const updated = await db.Song.findByPk(id, { attributes: ['id', 'play_count'] });

  return {
    songId: updated.id,
    playCount: updated.play_count,
  };
};

module.exports = { recordPlay };
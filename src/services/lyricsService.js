'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { loadOwnedSong } = require('./songService');
const { enqueueLyricsJob } = require('../queues/lyricsQueue');
const { transcribeSong } = require('./transcriptionService');
const notificationService = require('./notificationService');

// ── word -> karaoke-line grouping ──
//
// Deliberately lives here, not in the Python service (see transcription
// -service/transcription.py): this is a presentation/business heuristic,
// tunable without touching the ML pipeline or reloading Whisper. A line
// breaks whenever either the word count cap is hit, or there's a pause
// long enough to suggest a new phrase (a singer taking a breath, a bar
// ending, etc).
const MAX_WORDS_PER_LINE = 8;
const LINE_BREAK_GAP_SECONDS = 1.2;

const groupWordsIntoLines = (words) => {
  if (!Array.isArray(words) || words.length === 0) return [];

  const lines = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    lines.push({
      time: current[0].start,
      text: current.map((w) => w.word).join(' ').trim(),
    });
    current = [];
  };

  words.forEach((w, i) => {
    current.push(w);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : Infinity;
    if (current.length >= MAX_WORDS_PER_LINE || gap >= LINE_BREAK_GAP_SECONDS) {
      flush();
    }
  });
  flush();

  return lines;
};

// ── write side: controller-facing ──

/**
 * Called from the controller (step 6, not yet built). Ownership is
 * enforced by loadOwnedSong — the same check used everywhere else for
 * song mutations, so "artist can only generate lyrics for their own
 * songs" isn't logic duplicated here. Permission-key gating (does this
 * actor's role even have generate_lyrics) happens earlier, at the RBAC
 * middleware layer, same as every other permission-gated route.
 */
const requestGeneration = async ({ actor, songId }) => {
  const { song } = await loadOwnedSong(actor, songId);

  const [lyrics] = await db.SongLyrics.findOrCreate({
    where: { song_id: song.id },
    defaults: { song_id: song.id, status: 'pending' },
  });

  if (lyrics.status === 'processing') {
    throw new ApiError(409, 'Lyrics generation is already in progress for this song');
  }

  // Regenerating: reset to pending and clear any prior failure, whether
  // this is a first-ever request or a retry after 'failed'/'completed'.
  lyrics.status = 'pending';
  lyrics.error_message = null;
  await lyrics.save();

  await enqueueLyricsJob(song.id);

  return { songId: song.id, status: lyrics.status };
};

// ── write side: worker-facing ──

/**
 * Called by lyricsWorker.js — never by the controller directly. Runs the
 * actual transcription and writes the result.
 *
 * Errors are caught here and written to the row as status='failed' rather
 * than re-thrown: the queue already has attempts:1 (no auto-retry, see
 * lyricsQueue.js), and this is the second half of that same decision — a
 * failed transcription should be a clear, inspectable row the artist can
 * see and choose to retry, not a silently swallowed worker crash.
 */
const processLyricsJob = async (songId) => {
  const song = await db.Song.findByPk(songId, { attributes: ['id', 'storage_key'] });
  if (!song) {
    console.error(`[lyricsService] song ${songId} no longer exists, skipping job`);
    return;
  }

  const lyrics = await db.SongLyrics.findOne({ where: { song_id: songId } });
  if (!lyrics) {
    console.error(`[lyricsService] no song_lyrics row for song ${songId}, skipping job`);
    return;
  }

  lyrics.status = 'processing';
  await lyrics.save();

  // The only signal that a job was actually picked up by the worker, as
  // opposed to still sitting in 'pending' waiting on something upstream
  // (Redis, a stale duplicate jobId, whatever). Demucs+Whisper on CPU can
  // legitimately run for a couple of minutes with no output of their own
  // in between — without this line, that silence was indistinguishable
  // from the job never having started at all.
  console.log(`[lyricsService] song ${songId} — transcription started`);

  try {
    const result = await transcribeSong(song.storage_key);
    const syncedLyrics = groupWordsIntoLines(result.words);

    lyrics.status = 'completed';
    lyrics.raw_text = result.raw_text;
    lyrics.synced_lyrics = syncedLyrics;
    lyrics.source = 'ai_generated';
    lyrics.error_message = null;
    await lyrics.save();

    // Notify only on success — a 'failed' status is surfaced via the
    // GET /:id/lyrics status check instead, not a notification. Firing a
    // notification for a failure the artist hasn't asked to be pinged
    // about would be noise, not signal.
    await notificationService.emitLyricsReady({ songId: song.id });
  } catch (err) {
    console.error(`[lyricsService] transcription failed for song ${songId}:`, err.message);
    lyrics.status = 'failed';
    lyrics.error_message = String(err.message || 'Unknown error').slice(0, 1000);
    await lyrics.save();
  }
};

// ── write side: artist edit ──
//
// A correction, not a new generation — the AI transcript is a draft, per
// the migration's own comment on `source`. Deliberately narrow: only line
// TEXT is editable, never `time`. Whisper's word-level alignment is
// usually still roughly right even when the words themselves are wrong,
// and letting timestamps drift out of artist-edited hands avoids a much
// bigger UI (a full mini timeline editor) for a problem this feature
// isn't trying to solve. The client only ever echoes back the same `time`
// values it was shown; this just trusts and stores them as given.
//
// `raw_text` is derived from the edited lines rather than accepted as a
// separate field, specifically so the plain-text and synced versions can
// never say two different things.
const updateLyrics = async ({ actor, songId, lines }) => {
  const { song } = await loadOwnedSong(actor, songId);

  const lyrics = await db.SongLyrics.findOne({ where: { song_id: song.id } });
  if (!lyrics || lyrics.status !== 'completed') {
    throw new ApiError(409, 'Lyrics must finish generating before they can be edited');
  }

  lyrics.synced_lyrics = lines;
  lyrics.raw_text = lines.map((l) => l.text).join(' ');
  lyrics.source = 'artist_edited';
  await lyrics.save();

  return {
    songId: song.id,
    status: lyrics.status,
    source: lyrics.source,
    syncedLyrics: lyrics.synced_lyrics,
  };
};

// ── read side: controller-facing, owner-only ──
//
// Deliberately owner-scoped for now, same as requestGeneration. A separate
// PUBLIC read path (any listener viewing completed lyrics while playing a
// published song) is a different permission shape — open question, not an
// oversight — flagged for when the frontend polling UI gets built.
const getOwnedLyrics = async ({ actor, songId }) => {
  const { song } = await loadOwnedSong(actor, songId);
  const lyrics = await db.SongLyrics.findOne({ where: { song_id: song.id } });

  if (!lyrics) {
    return { songId: song.id, status: null, rawText: null, syncedLyrics: null, source: null, errorMessage: null };
  }

  return {
    songId: song.id,
    status: lyrics.status,
    rawText: lyrics.raw_text,
    syncedLyrics: lyrics.synced_lyrics,
    source: lyrics.source,
    errorMessage: lyrics.error_message,
  };
};

const getPublicLyrics = async ({ songId }) => {
  const song = await db.Song.findByPk(songId, { attributes: ['id', 'status'] });
  if (!song || song.status !== 'published') {
    throw new ApiError(404, 'Song not found');
  }

  const lyrics = await db.SongLyrics.findOne({ where: { song_id: song.id } });

  if (!lyrics || lyrics.status !== 'completed') {
    return { songId: song.id, available: false, syncedLyrics: null, source: null };
  }

  return {
    songId: song.id,
    available: true,
    syncedLyrics: lyrics.synced_lyrics,
    source: lyrics.source,
  };
};

module.exports = { requestGeneration, updateLyrics, getOwnedLyrics, getPublicLyrics, processLyricsJob, groupWordsIntoLines };
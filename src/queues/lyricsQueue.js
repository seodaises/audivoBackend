'use strict';
const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const LYRICS_QUEUE_NAME = 'lyrics-generation';

const lyricsQueue = new Queue(LYRICS_QUEUE_NAME, { connection: redisConnection });

/**
 * Enqueue a lyrics-generation job for a song.
 *
 * jobId includes Date.now() — NOT just `song-${songId}` — deliberately.
 * A static per-song jobId seemed like a natural way to guarantee "only one
 * job in flight per song", mirroring the DB's one-row-per-song constraint
 * on song_lyrics. But BullMQ keeps finished jobs around for a while
 * (removeOnComplete/removeOnFail below, kept for debugging), and it treats
 * .add() with a jobId that already exists — even a long-finished one — as
 * a silent no-op: it emits a 'duplicated' event and returns, but never
 * actually re-queues the job for a worker to pick up. No error, nothing in
 * any log — the request just vanishes. That's exactly what broke Regenerate:
 * the first "Generate" created job "song-42", it completed and stuck
 * around, and every later attempt with that same jobId silently did
 * nothing while the DB row sat reset to 'pending' forever.
 *
 * The actual "one job in flight per song" guarantee is already enforced
 * correctly one layer up, in lyricsService.requestGeneration (checks
 * lyrics.status === 'processing' before allowing a new request) — so the
 * jobId here no longer needs to double as that guard, and can be unique
 * per attempt instead.
 */
const enqueueLyricsJob = async (songId) => {
  return lyricsQueue.add(
    'transcribe',
    { songId },
    {
      jobId: `song-${songId}-${Date.now()}`,
      removeOnComplete: { age: 24 * 60 * 60 }, // keep 24h for debugging, then GC
      removeOnFail: { age: 7 * 24 * 60 * 60 }, // keep failed jobs a week, worth inspecting
      attempts: 1, // a failed transcription needs a human decision, not a silent auto-retry
    }
  );
};

module.exports = { lyricsQueue, enqueueLyricsJob, LYRICS_QUEUE_NAME };
'use strict';
const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');
const { LYRICS_QUEUE_NAME } = require('../queues/lyricsQueue');
const lyricsService = require('../services/lyricsService');

/**
 * Thin by design, same convention as jobs/releaseScheduler.js: this file
 * owns queue wiring and logging only. The actual Demucs/Whisper call and
 * DB write live in lyricsService.processLyricsJob — kept there so the
 * business logic is testable and reusable independent of BullMQ.
 */
const processor = async (job) => {
  const { songId } = job.data;
  return lyricsService.processLyricsJob(songId);
};

let worker = null;

const startLyricsWorker = () => {
  worker = new Worker(LYRICS_QUEUE_NAME, processor, {
    connection: redisConnection,
    concurrency: 1, // CPU-bound Demucs+Whisper, single dev machine — never run two at once
  });

  worker.on('completed', (job) => {
    console.log(`[lyricsWorker] song ${job.data.songId} — lyrics ready`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[lyricsWorker] song ${job?.data?.songId} failed:`, err.message);
  });

  console.log('[lyricsWorker] started (concurrency: 1)');
  return worker;
};

module.exports = { startLyricsWorker };
'use strict';
const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const LYRICS_QUEUE_NAME = 'lyrics-generation';

const lyricsQueue = new Queue(LYRICS_QUEUE_NAME, { connection: redisConnection });

const enqueueLyricsJob = async (songId) => {
  return lyricsQueue.add(
    'transcribe',
    { songId },
    {
      jobId: `song-${songId}-${Date.now()}`,
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 }, 
      attempts: 1, 
    }
  );
};

module.exports = { lyricsQueue, enqueueLyricsJob, LYRICS_QUEUE_NAME };
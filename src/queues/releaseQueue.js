'use strict';
const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const RELEASE_QUEUE_NAME = 'album-release';

const releaseQueue = new Queue(RELEASE_QUEUE_NAME, { connection: redisConnection });

const jobOptions = (jobId, delayMs) => ({
  jobId,
  delay: Math.max(delayMs, 0), 
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
  attempts: 1,
});

const enqueuePublish = async (albumId, delayMs) => {
  const job = await releaseQueue.add(
    'publish-album',
    { albumId },
    jobOptions(`publish-${albumId}-${Date.now()}`, delayMs)
  );
  return job.id;
};

const enqueuePrereleaseNotify = async (albumId, delayMs) => {
  const job = await releaseQueue.add(
    'prerelease-notify',
    { albumId },
    jobOptions(`prerelease-${albumId}-${Date.now()}`, delayMs)
  );
  return job.id;
};

const removeJobIfExists = async (jobId) => {
  if (!jobId) return;
  const job = await releaseQueue.getJob(jobId);
  if (!job) return;

  const state = await job.getState();
  if (state === 'delayed' || state === 'waiting') {
    await job.remove();
  }
};

module.exports = {
  releaseQueue,
  RELEASE_QUEUE_NAME,
  enqueuePublish,
  enqueuePrereleaseNotify,
  removeJobIfExists,
};
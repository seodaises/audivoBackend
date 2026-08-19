'use strict';
const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');
const { RELEASE_QUEUE_NAME } = require('../queues/releaseQueue');
const schedulerService = require('../services/schedulerService');

const processor = async (job) => {
  const { albumId } = job.data;

  if (job.name === 'publish-album') {
    return schedulerService.publishScheduledAlbum(albumId);
  }
  if (job.name === 'prerelease-notify') {
    return schedulerService.sendPrereleaseNotification(albumId);
  }
  throw new Error(`releaseWorker: unrecognized job name "${job.name}"`);
};

let worker = null;

const startReleaseWorker = () => {
  worker = new Worker(RELEASE_QUEUE_NAME, processor, {
    connection: redisConnection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[releaseWorker] ${job.name} — album ${job.data.albumId} done`);
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[releaseWorker] ${job?.name} for album ${job?.data?.albumId} failed:`,
      err.message
    );
  });

  console.log('[releaseWorker] started (concurrency: 5)');
  return worker;
};

module.exports = { startReleaseWorker };
'use strict';

const cron = require('node-cron');
const { runDueReleases } = require('../services/schedulerService');
let running = false;

const startReleaseScheduler = () => {
  cron.schedule('*/30 * * * *', async () => {
    if (running) return; // previous tick still working — skip this one
    running = true;
    try {
      await runDueReleases();
    } catch (err) {
      console.error('[scheduler] tick failed:', err.message);
    } finally {
      running = false;
    }
  });

  console.log('[scheduler] release scheduler started (checking every thirty minutes)');
};

module.exports = { startReleaseScheduler };
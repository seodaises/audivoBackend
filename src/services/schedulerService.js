'use strict';

const db = require('../models');
const notificationService = require('./notificationService');
const releaseQueue = require('../queues/releaseQueue');

const PRERELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isWithinPrereleaseWindow = (when, from = new Date()) => {
  if (!when) return false;
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return false;
  const base = from.getTime();
  return t > base && t <= base + PRERELEASE_WINDOW_MS;
};

const publishScheduledAlbum = async (albumId) => {
  const { Op } = db.Sequelize;
  const album = await db.Album.findByPk(albumId);
  if (!album) return { published: false, reason: 'not_found' };
  if (album.status !== 'scheduled') return { published: false, reason: 'not_scheduled' };

  await db.sequelize.transaction(async (t) => {
    album.status = 'published';
    album.release_at = null; 
    album.release_job_id = null;
    album.prerelease_job_id = null; 
    await album.save({ transaction: t });

    await db.Song.update(
      { status: 'published', archived_by: null },
      {
        where: {
          album_id: album.id,
          [Op.or]: [
            { status: 'draft', held_back: false },
            { status: 'archived', archived_by: 'album' },
          ],
        },
        transaction: t,
      }
    );
  });
  await releaseQueue.removeJobIfExists(album.prerelease_job_id).catch(() => {});

  await notificationService.emitRelease({
    artistProfileId: album.artist_profile_id,
    albumId: album.id,
  });

  return { published: true };
};

const sendPrereleaseNotification = async (albumId) => {
  const album = await db.Album.findByPk(albumId);
  if (!album) return { notified: false, reason: 'not_found' };
  if (album.status !== 'scheduled') return { notified: false, reason: 'not_scheduled' };
  if (album.prerelease_notified_at) return { notified: false, reason: 'already_notified' };

  album.prerelease_notified_at = new Date();
  album.prerelease_job_id = null;
  await album.save();

  await notificationService.emitUpcomingRelease({
    artistProfileId: album.artist_profile_id,
    albumId: album.id,
  });

  return { notified: true };
};


const runDueReleases = async () => {
  const { Op } = db.Sequelize;
  const now = new Date();

  const due = await db.Album.findAll({
    where: {
      status: 'scheduled',
      release_at: { [Op.ne]: null, [Op.lte]: now },
    },
  });

  let published = 0;

  for (const album of due) {
    try {
      const result = await publishScheduledAlbum(album.id);
      if (result.published) published += 1;
    } catch (err) {
      console.error(
        `[scheduler] failed to publish scheduled album ${album.id}:`,
        err.message
      );
    }
  }

  if (published > 0) {
    console.log(`[scheduler] published ${published} scheduled album(s) (safety-net sweep)`);
  }

  return { checked: due.length, published };
};

const runDuePrereleases = async () => {
  const { Op } = db.Sequelize;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + PRERELEASE_WINDOW_MS);

  const due = await db.Album.findAll({
    where: {
      status: 'scheduled',
      prerelease_notified_at: { [Op.is]: null },
      release_at: { [Op.ne]: null, [Op.gt]: now, [Op.lte]: windowEnd },
    },
  });

  let notified = 0;

  for (const album of due) {
    try {
      const result = await sendPrereleaseNotification(album.id);
      if (result.notified) notified += 1;
    } catch (err) {
      console.error(
        `[scheduler] pre-release heads-up failed for album ${album.id}:`,
        err.message
      );
    }
  }

  if (notified > 0) {
    console.log(`[scheduler] sent pre-release heads-up for ${notified} album(s) (safety-net sweep)`);
  }

  return { checked: due.length, notified };
};

module.exports = {
  publishScheduledAlbum,
  sendPrereleaseNotification,
  runDueReleases,
  runDuePrereleases,
  isWithinPrereleaseWindow,
  PRERELEASE_WINDOW_MS,
};
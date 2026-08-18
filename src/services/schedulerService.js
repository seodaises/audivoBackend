'use strict';

const db = require('../models');
const notificationService = require('./notificationService');

const PRERELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isWithinPrereleaseWindow = (when, from = new Date()) => {
  if (!when) return false;
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return false;
  const base = from.getTime();
  return t > base && t <= base + PRERELEASE_WINDOW_MS;
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
      await db.sequelize.transaction(async (t) => {
        album.status = 'published';
        album.release_at = null; // trigger consumed; don't let it re-fire
        await album.save({ transaction: t });

        await db.Song.update(
          { status: 'published', archived_by: null },
          {
            where: {
              album_id: album.id,
              [Op.or]: [
                { status: 'draft' },
                { status: 'archived', archived_by: 'album' },
              ],
            },
            transaction: t,
          }
        );
      });
      published += 1;
      await notificationService.emitRelease({
        artistProfileId: album.artist_profile_id,
        albumId: album.id,
      });
    } catch (err) {

      console.error(
        `[scheduler] failed to publish scheduled album ${album.id}:`,
        err.message
      );
    }
  }

  if (published > 0) {

    console.log(`[scheduler] published ${published} scheduled album(s)`);
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
      album.prerelease_notified_at = new Date();
      await album.save();

      await notificationService.emitUpcomingRelease({
        artistProfileId: album.artist_profile_id,
        albumId: album.id,
      });
      notified += 1;
    } catch (err) {
      console.error(
        `[scheduler] pre-release heads-up failed for album ${album.id}:`,
        err.message
      );
    }
  }

  if (notified > 0) {
    console.log(`[scheduler] sent pre-release heads-up for ${notified} album(s)`);
  }

  return { checked: due.length, notified };
};

module.exports = {
  runDueReleases,
  runDuePrereleases,
  isWithinPrereleaseWindow,
  PRERELEASE_WINDOW_MS,
};
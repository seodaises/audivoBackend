'use strict';

const db = require('../models');

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

module.exports = { runDueReleases };
'use strict';

/**
 * Adds `release_at` to albums — the exact moment a scheduled album should go
 * live — plus a composite index on (status, release_at).
 *
 * release_at vs the existing release_date:
 *   - release_date (DATEONLY) is a human-facing label: "this album came out on
 *     July 16." No time, no timezone, purely for display. Unchanged.
 *   - release_at (DATE / DATETIME) is the machine trigger: the precise instant
 *     the cron job compares against NOW() to decide whether to publish. Stored
 *     in UTC (Sequelize default), so it is timezone-safe regardless of where the
 *     server or the artist is. NULL for every album that is not scheduled.
 *
 * WHY the index: the cron job runs a query once a minute —
 *     WHERE status = 'scheduled' AND release_at <= NOW()
 * Without an index that scan reads the whole albums table every minute. The
 * table is small today, but a composite index on (status, release_at) makes the
 * check cheap no matter how large the catalog grows: MySQL jumps straight to the
 * 'scheduled' rows and range-scans by time. This is what turns "negligible now"
 * into "negligible permanently" — the defensible answer to "does this scale?".
 *
 * Additive migration — never edited after it is applied.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('albums', 'release_at', {
      type: Sequelize.DATE, // maps to MySQL DATETIME; stored UTC
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addIndex('albums', ['status', 'release_at'], {
      name: 'albums_status_release_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('albums', 'albums_status_release_at_idx');
    await queryInterface.removeColumn('albums', 'release_at');
  },
};
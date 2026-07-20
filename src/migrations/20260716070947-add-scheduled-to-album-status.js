'use strict';

/**
 * Adds 'scheduled' to the albums.status ENUM.
 *
 * WHY a new status value rather than reusing 'draft' + a timestamp:
 * A scheduled album is a distinct state — it is finished and locked to go live
 * at a set time, which is NOT the same as a work-in-progress draft. Making it
 * its own status means the cron job's query is a single unambiguous line
 * (WHERE status = 'scheduled'), and anyone reading the code or the DB row knows
 * exactly what is happening without having to also inspect a timestamp to tell
 * a real draft apart from a loaded-and-waiting release.
 *
 * Listeners never see it: every public read in catalogService already filters
 * on status = 'published' explicitly, so 'scheduled' is invisible for free.
 *
 * MySQL ENUM change: we redefine the column with the full new value list. The
 * order keeps the three original values first so no existing stored value is
 * disturbed. Additive migration — never edited after it is applied.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('albums', 'status', {
      type: Sequelize.ENUM('draft', 'published', 'archived', 'scheduled'),
      allowNull: false,
      defaultValue: 'draft',
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert to the original three-value ENUM. Any rows sitting on 'scheduled'
    // would violate the reverted type, so move them back to 'draft' first —
    // 'draft' is the safe landing state (private, editable, fires nothing).
    await queryInterface.sequelize.query(
      "UPDATE albums SET status = 'draft' WHERE status = 'scheduled'"
    );
    await queryInterface.changeColumn('albums', 'status', {
      type: Sequelize.ENUM('draft', 'published', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    });
  },
};
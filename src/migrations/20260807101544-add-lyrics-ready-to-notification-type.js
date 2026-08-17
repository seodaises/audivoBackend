'use strict';

/**
 * Adds 'lyrics_ready' to the notifications.type ENUM.
 *
 * WHY: an artist needs to know when AI transcription finishes on their
 * song, same as they're notified for a release or a comment. This reuses
 * the existing notification system rather than inventing a parallel
 * mechanism — matches Audivo's convention of one event-driven feed, not
 * a special case per feature.
 *
 * MySQL ENUM change: redefine the column with the full new value list.
 * Original three values kept first so no existing stored row is disturbed.
 * Additive migration — never edited after it is applied.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM('release', 'comment', 'comment_reply', 'lyrics_ready'),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    // No rows should exist on 'lyrics_ready' if this is reverted cleanly
    // (feature being rolled back before use), but guard anyway: delete
    // rather than reassign, since there's no sensible existing type for
    // "your lyrics are ready" to fall back to.
    await queryInterface.sequelize.query(
      "DELETE FROM notifications WHERE type = 'lyrics_ready'"
    );
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM('release', 'comment', 'comment_reply'),
      allowNull: false,
    });
  },
};
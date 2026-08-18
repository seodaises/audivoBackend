'use strict';

/**
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Additive ENUM widen. MySQL keeps the ENUM inline on the column, so this is
    // an in-place MODIFY — existing 'release'/'comment'/'comment_reply' rows are
    // untouched.
    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM(
        'release',
        'comment',
        'comment_reply',
        'upcoming_release'
      ),
      allowNull: false,
    });

    await queryInterface.addColumn('albums', 'prerelease_notified_at', {
      type: Sequelize.DATE, // MySQL DATETIME, UTC; NULL until the heads-up fires
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('albums', 'prerelease_notified_at');

    await queryInterface.changeColumn('notifications', 'type', {
      type: Sequelize.ENUM('release', 'comment', 'comment_reply'),
      allowNull: false,
    });
  },
};
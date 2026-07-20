'use strict';

/**
 * Adds `is_self_play` to play_history.
 *
 * WHY: an artist playing their OWN published song should not inflate that song's
 * public stream count — but the play still genuinely happened, so it should
 * remain in the artist's personal listening history ("Recently played" / "Most
 * played" in Library). This boolean separates "this happened" from "this counts
 * publicly": the row is written either way, but a self-play does NOT increment
 * song.play_count and is excluded from any public stream total.
 *
 * play_count stays an honest cache of PUBLIC plays (self_play = false), while
 * play_history stays a complete record of every listen. Defaults false so every
 * existing row is treated as a normal public play with no backfill.
 *
 * Additive migration — never edited after it is applied.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('play_history', 'is_self_play', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('play_history', 'is_self_play');
  },
};
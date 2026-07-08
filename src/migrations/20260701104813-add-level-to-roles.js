'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // JOB 1: add the column.
    // allowNull: false needs a default, because the 5 existing rows
    // need SOME value the instant the column is born. We give 1 (lowest
    // rank) as a safe placeholder, then overwrite per-role in job 2.
    await queryInterface.addColumn('roles', 'level', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });

    // JOB 2: backfill each existing role with its real rank.
    // We match by NAME (not id) — same discipline as the seeder:
    // never assume the numeric ids, target the thing we actually know.
    const ranks = {
      'Listener': 1,
      'Artist': 2,
      'Moderator': 3,
      'Admin': 4,
      'Super Admin': 5,
    };

    for (const [name, level] of Object.entries(ranks)) {
      await queryInterface.bulkUpdate(
        'roles',
        { level },              // SET level = ?
        { name }                // WHERE name = ?
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // Reversing this migration = removing the column entirely.
    // (The data in it goes with it — that's correct; the column
    // didn't exist before this migration, so undoing = gone.)
    await queryInterface.removeColumn('roles', 'level');
  },
};

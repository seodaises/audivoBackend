'use strict';

/**
 * Starter genre list so browse/filter + M2M linking have data on day one.
 * genres is a NEW underscored table, so this writes created_at/updated_at.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const names = [
      'Pop', 'Rock', 'Hip-Hop', 'R&B', 'Electronic',
      'Jazz', 'Classical', 'Country', 'Metal', 'Indie',
    ];
    await queryInterface.bulkInsert(
      'genres',
      names.map((name) => ({ name, created_at: now, updated_at: now })),
      {}
    );
  },
  async down(queryInterface) {
    await queryInterface.bulkDelete('genres', null, {});
  },
};
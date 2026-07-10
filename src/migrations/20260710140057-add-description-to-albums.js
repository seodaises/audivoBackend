'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Additive column. TEXT for long, multi-paragraph album descriptions.
    // Nullable so every existing album row stays valid without a backfill.
    await queryInterface.addColumn('albums', 'description', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('albums', 'description');
  },
};
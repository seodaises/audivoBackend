'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('albums', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      artist_profile_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'artist_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // an artist's albums leave with their profile
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      cover_url: { type: Sequelize.STRING(2048), allowNull: true },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      release_date: { type: Sequelize.DATEONLY, allowNull: true },
      is_single: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('albums');
  },
};
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('songs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      album_id: {
        type: Sequelize.INTEGER,
        allowNull: false, // every song belongs to an album
        references: { model: 'albums', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // deleting an album removes its songs
      },
      artist_profile_id: {
        type: Sequelize.INTEGER,
        allowNull: false, // denormalized owner (copied from the album at insert)
        references: { model: 'artist_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      storage_key: { type: Sequelize.STRING(512), allowNull: false },
      duration_seconds: { type: Sequelize.INTEGER, allowNull: true },
      track_number: { type: Sequelize.INTEGER, allowNull: true },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      play_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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
    await queryInterface.dropTable('songs');
  },
};
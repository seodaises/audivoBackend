'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('artist_profiles', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // one profile per user (1:1)
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // a user's artist identity leaves with them
      },
      stage_name: { type: Sequelize.STRING(100), allowNull: false },
      bio: { type: Sequelize.TEXT, allowNull: true },
      avatar_url: { type: Sequelize.STRING(2048), allowNull: true },
      is_verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
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
    await queryInterface.dropTable('artist_profiles');
  },
};
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_albums', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      album_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'albums', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('saved_albums', ['user_id', 'album_id'], {
      unique: true,
      name: 'saved_albums_user_album_unique',
    });

    await queryInterface.addIndex('saved_albums', ['user_id', 'created_at'], {
      name: 'saved_albums_user_recent_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_albums');
  },
};
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('playlists', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        // NOTE: this CASCADE is deliberately NOT the full policy for playlists.
        //
        // A PRIVATE playlist is like a save — nobody else ever saw it, it dies with
        // its owner. A PUBLIC playlist is like a comment — other people may have it
        // open right now, and destroying it would be deleting something they were
        // using in order to erase someone who left.
        //
        // The DB can't express "cascade only if is_public = false", so adminService
        // does it by hand: destroy private playlists, keep the public ones, and let
        // the serializer render their author as [deleted user]. This clause remains
        // as the hard-delete safety net.
        onDelete: 'CASCADE',
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      cover_url: { type: Sequelize.STRING(512), allowNull: true },
      is_public: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // Private by DEFAULT. A playlist that becomes public because the user didn't
      // notice a toggle is a privacy leak; one that stays private because they didn't
      // notice is an inconvenience. Default to the failure that can't hurt anyone.

      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // Soft delete, matching the catalog. A public playlist someone else has open
      // shouldn't vanish mid-listen; and a user who deletes a 200-track playlist by
      // accident should be recoverable.
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    await queryInterface.addIndex('playlists', ['user_id'], { name: 'playlists_user_idx' });
    await queryInterface.addIndex('playlists', ['is_public'], { name: 'playlists_public_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('playlists');
  },
};
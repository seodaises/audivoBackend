'use strict';

/**
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Nullable first so existing rows survive the ALTER.
    await queryInterface.addColumn('albums', 'public_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });
    await queryInterface.addColumn('songs', 'public_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.sequelize.query(
      'UPDATE `albums` SET `public_id` = (UUID()) WHERE `public_id` IS NULL'
    );
    await queryInterface.sequelize.query(
      'UPDATE `songs` SET `public_id` = (UUID()) WHERE `public_id` IS NULL'
    );

    await queryInterface.changeColumn('albums', 'public_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });
    await queryInterface.changeColumn('songs', 'public_id', {
      type: Sequelize.UUID,
      allowNull: false,
    });

    await queryInterface.addIndex('albums', ['public_id'], {
      name: 'albums_public_id_uidx',
      unique: true,
    });
    await queryInterface.addIndex('songs', ['public_id'], {
      name: 'songs_public_id_uidx',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('albums', 'albums_public_id_uidx');
    await queryInterface.removeIndex('songs', 'songs_public_id_uidx');
    await queryInterface.removeColumn('albums', 'public_id');
    await queryInterface.removeColumn('songs', 'public_id');
  },
};
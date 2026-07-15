'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('likes', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        // A ghost like inflates a count that everyone reads. Nobody else ever
        // depended on THIS row, so it dies with its owner.
        //
        // Note this CASCADE is a SAFETY NET, not the mechanism: our user delete is
        // a soft delete (an UPDATE of deleted_at), and ON DELETE CASCADE only fires
        // on a real DELETE. adminService kills these rows by hand. This clause is
        // here so that if anyone ever hard-deletes a user — a seeder reset, a manual
        // DELETE in a SQL client — the database cleans up after them instead of
        // leaving orphans behind.
        onDelete: 'CASCADE',
      },
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // song's gone, so is the like on it
      },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Like and unlike are not two operations — a like IS a row, an unlike is its
    // absence. This constraint makes a double-like IMPOSSIBLE at the database level,
    // which is stronger than any check a service can write: a check can lose a race
    // with itself under concurrent requests; a unique index cannot.
    await queryInterface.addIndex('likes', ['user_id', 'song_id'], {
      unique: true,
      name: 'likes_user_song_unique',
    });

    // "Who liked this song" / "how many likes" — the count query.
    await queryInterface.addIndex('likes', ['song_id'], { name: 'likes_song_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('likes');
  },
};
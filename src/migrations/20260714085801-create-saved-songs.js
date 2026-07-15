'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // TWO TABLES, not one polymorphic `saves` table with a type discriminator.
    //
    // The polymorphic version looks tidier — one table, a `saveable_type` column —
    // and it costs you the single most valuable thing a relational database gives
    // you: the foreign key. A polymorphic `saveable_id` cannot reference anything,
    // because it points at a different table depending on a value in another column.
    // The DB can no longer verify that the row you saved exists, and it can no longer
    // clean up after you when it doesn't.
    //
    // We already have one bug caused by rows outliving the things they point at (the
    // ghost catalog). Manufacturing a second one on purpose, in exchange for saving
    // one CREATE TABLE, is a bad trade. Two tables. Real FKs. They garbage-collect
    // themselves.
    await queryInterface.createTable('saved_songs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        // A save is a bookmark in a library only you can see. When the library is
        // gone the bookmark means nothing to anyone.
        onDelete: 'CASCADE',
      },
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('saved_songs', ['user_id', 'song_id'], {
      unique: true,
      name: 'saved_songs_user_song_unique',
    });

    // THE Library query: "my saved songs, newest first". The DESC on created_at is
    // not decoration — it means the database can walk the index in order and stop
    // after 50 rows, instead of reading every save you've ever made and sorting them.
    await queryInterface.addIndex('saved_songs', ['user_id', 'created_at'], {
      name: 'saved_songs_user_recent_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_songs');
  },
};
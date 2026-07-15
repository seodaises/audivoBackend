'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('playlist_songs', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      playlist_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'playlists', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        // The song is deleted; it silently leaves every playlist it was in. This is
        // what real platforms do, and it's why a playlist you made in 2015 is shorter
        // than you remember.
        onDelete: 'CASCADE',
      },

      // A playlist is an ORDERED set, and ordering is the part everyone under-designs.
      //
      // DECIMAL, not INTEGER. With integer positions, dragging track 40 up to slot 2
      // means renumbering 38 rows — one drag, 38 UPDATEs, and a race condition if two
      // tabs do it at once.
      //
      // With a fractional position, you insert BETWEEN the neighbours: dropping
      // between 2.0 and 3.0 writes 2.5. ONE row changes. Drop between 2.0 and 2.5 and
      // you write 2.25. The precision below gives you ~20 halvings between any two
      // adjacent tracks before you'd ever need to renumber — which for a human
      // dragging songs around is effectively never.
      position: { type: Sequelize.DECIMAL(20, 10), allowNull: false },

      added_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // NOT unique on (playlist_id, song_id) — DELIBERATELY.
    //
    // The same song twice in one playlist is legal, and people do it on purpose: a DJ
    // set that returns to a theme, a workout mix with the same sprint track at each
    // interval. A UNIQUE here would be us deciding, on the user's behalf, that they
    // made a mistake. This is exactly the OPPOSITE call from `likes`, where a
    // duplicate is meaningless and the constraint is correct — the difference is that
    // a second like says nothing new, while a second entry in a tracklist does.
    await queryInterface.addIndex('playlist_songs', ['playlist_id', 'position'], {
      name: 'playlist_songs_order_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('playlist_songs');
  },
};
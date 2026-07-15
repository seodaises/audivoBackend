'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('follows', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      follower_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // ghost followers are inflated vanity metrics
      },
      // A listener follows an ARTIST PROFILE, not a user. This distinction is worth
      // being pedantic about: you follow "Radiohead", not "the human being who holds
      // the login for the Radiohead account". If we pointed this at users.id, then
      // the day an artist hands their profile to a manager, every follower follows
      // the wrong thing — and that's a data migration on a live table.
      artist_profile_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'artist_profiles', key: 'id' },
        onUpdate: 'CASCADE',
        // The other direction. Delete the artist, and follows POINTING AT them die
        // too — otherwise listeners are following a ghost, and it shows up in their
        // "following" list forever.
        onDelete: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('follows', ['follower_user_id', 'artist_profile_id'], {
      unique: true,
      name: 'follows_user_artist_unique',
    });

    // "How many followers does this artist have" — the number on the artist page.
    await queryInterface.addIndex('follows', ['artist_profile_id'], {
      name: 'follows_artist_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('follows');
  },
};
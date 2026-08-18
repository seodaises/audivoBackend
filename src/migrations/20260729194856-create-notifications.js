'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      // WHO receives this. The feed is always read as "my notifications", so this
      // is the lead column of the hot index. RESTRICT: a user row should never be
      // hard-deleted out from under their feed — the app soft-deletes users
      // (deleted_at), so a real DELETE hitting this FK is a bug we want to fail loud.
      recipient_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      // WHO caused it (commenter, replier). NULL for system/release events where the
      // "actor" is really an artist profile, not a user — we carry that via album_id
      // instead. SET NULL: if the actor's account is ever hard-removed, the
      // notification still stands ("someone replied"), it just loses the name.
      actor_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // The KIND drives rendering and the deep-link target on the frontend.
      //   release        — an artist you follow published an album
      //   comment         — someone commented on your song
      //   comment_reply   — someone replied to your comment
      type: {
        type: Sequelize.ENUM('release', 'comment', 'comment_reply'),
        allowNull: false,
      },

      // ── Typed, nullable subject FKs ────────────────────────────────────────────
      // Only the columns relevant to `type` are populated. This is the deliberate
      // divergence from the typed-table-per-kind pattern (saved_songs/saved_albums):
      // notifications are a heterogeneous READ CACHE, not a place we FK-join from.
      // Real FKs are kept where they apply; there is no polymorphic entity_type/
      // entity_id string pair. CASCADE on all three: if the subject is hard-deleted,
      // the notification pointing at it has nothing left to say, so it goes too.
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      album_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'albums', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      comment_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'comments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },

      // Read state as a nullable timestamp, NOT a boolean: it answers both
      // "is it read?" (IS NULL) and "when did they read it?" for free, and mirrors
      // the deleted_at convention already used across the codebase.
      read_at: { type: Sequelize.DATE, allowNull: true },

      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // THE feed query: "my notifications, newest first." Also serves the unread
    // count (same prefix + read_at filter). This is the one index that matters.
    await queryInterface.addIndex('notifications', ['recipient_user_id', 'created_at'], {
      name: 'notifications_recipient_recent_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    // MySQL keeps the ENUM type inline on the column, so dropTable is enough here.
  },
};
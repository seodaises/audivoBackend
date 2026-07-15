'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('comments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      // NO CASCADE, and this is the whole point of the table.
      //
      // A comment stops being the author's private property the moment somebody
      // REPLIES to it. It is now part of a conversation other people are in. Deleting
      // it tears a hole in a thread: the replies underneath are left answering a
      // question nobody can see. You would be destroying OTHER people's content in
      // order to erase one person's.
      //
      // So the row SURVIVES and the IDENTITY is hidden. The comment service checks
      // user.deleted_at and serializes the author as [deleted user] — the same trick
      // publicUser() already uses to keep password_hash out of responses: the row
      // holds the truth, the serializer decides what leaves the building.
      //
      // RESTRICT, not CASCADE: if anyone ever tries a real hard DELETE on a user, the
      // database REFUSES rather than silently shredding threads. That refusal is a
      // feature — it's a loud failure instead of a quiet data loss.
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },

      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        // The song is gone, so the conversation ABOUT the song goes with it. There is
        // no thread left to preserve — unlike the user case, nothing survives that the
        // replies could still belong to.
        onDelete: 'CASCADE',
      },

      body: { type: Sequelize.TEXT, allowNull: false },

      // SELF-REFERENCING FK — replies, for free.
      //
      // NULL = a top-level comment. Non-null = a reply to that comment.
      //
      // Worth adding NOW even if the UI only renders a flat list at first: retrofitting
      // threading means a migration against live comment data, while a nullable column
      // on an empty table costs nothing. This is the cheapest option you will ever buy.
      parent_comment_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'comments', key: 'id' },
        onUpdate: 'CASCADE',
        // Delete a parent and its replies go too. NOT the same as the user case: here
        // the replies genuinely have nothing left to attach to.
        onDelete: 'CASCADE',
      },

      // This is what makes MODERATE_COMMENTS — your Moderator's ONLY permission —
      // mean something. Right now that role has a permission and nothing to point it at.
      //
      // HIDDEN, not deleted. A moderator hides; an AUTHOR deletes. Keeping the
      // distinction in the schema means an appeal is possible, and it means you can
      // answer "what did the moderator actually remove?" — which you cannot do if the
      // moderation tool's only verb is DELETE.
      status: {
        type: Sequelize.ENUM('visible', 'hidden'),
        allowNull: false,
        defaultValue: 'visible',
      },

      // WHO hid it. An audit trail, and the thing your backlog is missing everywhere
      // else: right now an admin can hard-delete an artist's entire album and nothing,
      // anywhere, records who did it. Start the habit here.
      hidden_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // the moderator left; the fact of the moderation remains
      },

      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // Soft delete — so an author deleting their own comment doesn't orphan the
      // replies hanging off it. Same reasoning as the user case, one level down.
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    });

    // "Comments on this song, newest first" — the thread query.
    await queryInterface.addIndex('comments', ['song_id', 'created_at'], {
      name: 'comments_song_recent_idx',
    });

    // "Replies to this comment" — the threading query.
    await queryInterface.addIndex('comments', ['parent_comment_id'], {
      name: 'comments_parent_idx',
    });

    // The moderation queue: "show me everything hidden."
    await queryInterface.addIndex('comments', ['status'], { name: 'comments_status_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('comments');
  },
};
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // This does NOT replace songs.play_count. Both exist, and they answer different
    // questions:
    //
    //   songs.play_count  — "how many streams does this song have?" One integer, on
    //                       a row you have already fetched. Browse renders 50 songs;
    //                       50 COUNT(*) queries over an ever-growing event table is
    //                       not a thing you want to do on every page load.
    //
    //   play_history      — "what did I listen to last Tuesday?" A counter has thrown
    //                       away WHO and WHEN. You cannot rebuild Recently Played, or
    //                       "your top songs this month", from an integer.
    //
    // play_count is a DENORMALIZED READ CACHE of this table. Every play writes twice,
    // in ONE transaction: append the event, bump the counter. The transaction is what
    // stops them drifting apart. If they ever DO drift, this table is the source of
    // truth — you can rebuild the counter from the log; you can never rebuild the log
    // from the counter.
    await queryInterface.createTable('play_history', {
      id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
      // BIGINT, not INTEGER. Every other table here gets one row per user action;
      // this one gets a row every time anybody presses play. It is the only table in
      // the schema with a realistic path to 2 billion rows, and changing a primary
      // key type on a live table is genuinely painful. It costs 4 bytes a row now.

      // NULLABLE, for two reasons that happen to want the same thing:
      //   1. Anonymous plays. A logged-out visitor streaming a public song is a real
      //      play and should count.
      //   2. Deleted users. ON DELETE SET NULL below. The listener is gone; the
      //      LISTEN is not. That song WAS streamed, and play_count counted it. If we
      //      deleted these rows, the log and the counter would disagree and every
      //      analytics number on the dashboard would be retroactively wrong. We do
      //      not get to un-happen a stream because someone closed their account.
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        // The song is gone; its plays go with it. Unlike the user case, there is
        // nothing left to attribute the play TO — a play of a song that no longer
        // exists is not data, it's a dangling pointer.
        onDelete: 'CASCADE',
      },

      // How far into the track they actually got. This is what lets you decide what
      // COUNTS as a play — the industry convention is ~30 seconds. Without it, a
      // listener skipping through an album inflates every number on it, and any
      // artist who works that out can farm their own play count with a for-loop.
      // A counter alone can never defend against this, because by the time you have
      // incremented it you have thrown away the evidence.
      ms_played: { type: Sequelize.INTEGER, allowNull: true },

      // WHERE the play was started from. Costs one byte and answers "do people find
      // music through Browse or through playlists?" — which is the kind of question
      // an analytics page exists for, and which is unanswerable after the fact.
      source: {
        type: Sequelize.ENUM('browse', 'album', 'playlist', 'queue', 'search', 'artist'),
        allowNull: false,
        defaultValue: 'browse',
      },

      played_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // No updated_at. A play EVENT is immutable — it happened, at a time, and it is
      // never edited. A column that can never change is a column that shouldn't exist.
    });

    // "My recently played" — user's rows, newest first. This is the single most
    // important index in the new schema, because it is the query that the entire
    // rebuilt Library page is built on.
    await queryInterface.addIndex('play_history', ['user_id', 'played_at'], {
      name: 'play_history_user_recent_idx',
    });

    // "Plays of this song over time" — the analytics query.
    await queryInterface.addIndex('play_history', ['song_id', 'played_at'], {
      name: 'play_history_song_time_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('play_history');
  },
};
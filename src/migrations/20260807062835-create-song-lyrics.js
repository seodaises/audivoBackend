'use strict';

/**
 * Creates song_lyrics — one row per song, holding the current AI-transcribed
 * (or artist-edited) lyrics and the async job status that produced it.
 *
 * WHY one row per song, not a history table: this mirrors artist_profiles
 * (unique FK = 1:1). Nothing in the feature asks for "see every past
 * transcription attempt" — that would be a different, additive feature
 * later. Regenerating lyrics updates this row in place.
 *
 * WHY CASCADE on song_id: same reasoning as notifications' subject FKs —
 * a lyrics row has no meaning once its song is gone, so it should not
 * outlive it.
 *
 * WHY status lives directly on this row rather than a separate jobs table:
 * mirrors albums.status (scheduled/published/etc. live on the entity itself,
 * not a separate state-machine table). BullMQ/Redis owns queue mechanics;
 * MySQL just needs to know the current state of the result.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('song_lyrics', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      song_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // one lyrics record per song (1:1)
        references: { model: 'songs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // lyrics have no meaning once the song is gone
      },

      // Async job state. pending: queued, not yet picked up. processing:
      // worker is running Demucs/Whisper. completed: raw_text/synced_lyrics
      // populated. failed: error_message populated, no lyrics content.
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },

      // Plain transcript, no timestamps. Populated on completion.
      raw_text: { type: Sequelize.TEXT, allowNull: true },

      // Line-level timestamps for karaoke-style display: [{ time, text }, ...].
      // Native JSON type — no existing precedent in this codebase to diverge
      // from, and it's the correct MySQL type for structured, optionally
      // queryable data like this.
      synced_lyrics: { type: Sequelize.JSON, allowNull: true },

      // Who last produced the current content. Starts NULL (nothing generated
      // yet); flips to 'ai_generated' on first completed transcription, then
      // to 'artist_edited' the moment the artist corrects it via PATCH —
      // AI output is a draft, not final truth.
      source: {
        type: Sequelize.ENUM('ai_generated', 'artist_edited'),
        allowNull: true,
      },

      // Populated only when status = 'failed'. Surfaced to the artist so a
      // failed job isn't a silent dead end.
      error_message: { type: Sequelize.TEXT, allowNull: true },

      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('song_lyrics');
    // MySQL keeps ENUM types inline on the column, so dropTable is enough here.
  },
};
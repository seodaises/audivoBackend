'use strict';

/**
 * Adds `archived_by` to songs.
 *
 * WHY: status='archived' is currently a single flat state that collapses three
 * very different events into one value:
 *
 *   1. The ARTIST deliberately pulled a track (a B-side they don't want live).
 *   2. An ADMIN took the track down (a moderation action).
 *   3. The track went down as COLLATERAL because its whole album was archived.
 *
 * Because they look identical, we can't behave differently for them — which is
 * exactly the bug: republishing an album resurrects the artist's pulled B-side,
 * and an artist could quietly undo an admin's takedown by clicking Publish.
 *
 * `archived_by` records WHO archived it, which lets each case behave correctly:
 *   - 'artist' -> the artist pulled it; only they bring it back.
 *   - 'admin'  -> a moderation takedown; LOCKED. Only an admin can restore it.
 *   - 'album'  -> collateral from an album archive; an album republish restores it.
 *
 * NULL whenever the song is not archived. Nullable + no default, so existing
 * archived rows land as NULL — which we treat as 'artist' (the safe reading:
 * assume the artist did it, don't retroactively lock anyone's catalog).
 *
 * Additive migration. Never edited after it's been applied.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('songs', 'archived_by', {
      type: Sequelize.ENUM('artist', 'admin', 'album'),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('songs', 'archived_by');
    // MySQL keeps the ENUM type definition tied to the column, so dropping the
    // column is sufficient here — unlike Postgres, there's no leftover type.
  },
};
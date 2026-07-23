'use strict';

/**
 * Adds indexes to the two oldest catalog tables (songs, albums), which predate
 * the well-indexed social/comment/playlist tables and were never given any.
 *
 * Evidence-driven — each index maps to real query patterns found in the services:
 *
 *  - songs.status is the most-filtered column in the codebase (~44 WHERE uses,
 *    almost all `status: 'published'` in catalog browse, trending, and search).
 *    songs had ZERO indexes, so every one of those was a full table scan.
 *
 *  - (artist_profile_id, status) is a composite because the artist-catalog and
 *    public-profile queries filter BOTH: "this artist's published songs". Column
 *    order matters: artist_profile_id first (equality, high selectivity) then
 *    status. This one index serves both "all of an artist's songs" (uses the
 *    leading column alone) and "an artist's published songs" (uses both).
 *
 *  - albums already has a (status, release_at) composite for the release
 *    scheduler, but nothing on artist_profile_id, which the profile and
 *    admin-catalog queries filter on. Added to match.
 *
 * users.email and users.username are deliberately NOT here: email is `unique`
 * (MySQL auto-indexes unique constraints) and username was indexed in an earlier
 * migration. Adding them would be redundant.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('songs', ['status'], {
      name: 'songs_status_idx',
    });
    await queryInterface.addIndex('songs', ['artist_profile_id', 'status'], {
      name: 'songs_artist_status_idx',
    });
    await queryInterface.addIndex('albums', ['artist_profile_id'], {
      name: 'albums_artist_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('songs', 'songs_status_idx');
    await queryInterface.removeIndex('songs', 'songs_artist_status_idx');
    await queryInterface.removeIndex('albums', 'albums_artist_idx');
  },
};
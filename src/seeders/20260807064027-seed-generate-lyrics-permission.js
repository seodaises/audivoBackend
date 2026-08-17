'use strict';

/**
 * Additive seeder — creates the generate_lyrics permission and grants it.
 *
 * WHY artist-only for now: the artist owns the song and is the one who
 * benefits from AI-transcribed lyrics on their own catalog. Whether
 * admin/moderator should also be able to trigger generation (e.g. on an
 * artist's behalf) is an open question — flagged for mentor review, not
 * decided here. Additive: granting it to other roles later is just another
 * seeder, not a rework of this one.
 *
 * Ownership (not just role) still gates the actual action: this permission
 * says "an artist CAN generate lyrics", not "for any song" — the
 * song_id-belongs-to-this-artist check happens in lyricsService, same
 * pattern as delete_comments' own-songs-only scoping.
 *
 * Follows seed-delete-comments-permission: look up roles/permissions BY
 * NAME, never hardcode ids. permissions + role_permissions are the OLD
 * camelCase tables, so this writes createdAt/updatedAt.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('permissions', [
      {
        key: 'generate_lyrics',
        description: 'Trigger AI lyrics generation for own songs (artist only, for now)',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const [roles] = await queryInterface.sequelize.query('SELECT id, name FROM roles;');
    const [permissions] = await queryInterface.sequelize.query(
      'SELECT id, `key` FROM permissions;'
    );
    const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const permId = Object.fromEntries(permissions.map((p) => [p.key, p.id]));

    const grants = {
      'Artist': ['generate_lyrics'],
    };

    const rows = [];
    for (const [roleName, permKeys] of Object.entries(grants)) {
      if (!roleId[roleName]) continue; // role not present — skip rather than crash
      for (const permKey of permKeys) {
        rows.push({
          role_id: roleId[roleName],
          permission_id: permId[permKey],
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await queryInterface.bulkInsert('role_permissions', rows, {});
  },

  async down(queryInterface, Sequelize) {
    const [permissions] = await queryInterface.sequelize.query(
      "SELECT id, `key` FROM permissions WHERE `key` = 'generate_lyrics';"
    );
    const ids = permissions.map((p) => p.id);
    if (ids.length) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: ids });
      await queryInterface.bulkDelete('permissions', { key: ['generate_lyrics'] });
    }
  },
};
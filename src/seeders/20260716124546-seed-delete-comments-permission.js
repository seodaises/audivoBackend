'use strict';

/**
 * Additive seeder — creates the delete_comments permission and grants it.
 *
 * WHY a new permission rather than reusing moderate_comments:
 * moderate_comments is a GLOBAL power (hide/unhide/see-hidden anywhere). We want
 * artists to delete comments ONLY on their own songs, which that permission
 * can't express. delete_comments is the "can delete comments" capability; the
 * SCOPE (global for admins, own-songs-only for artists) is enforced in
 * commentService.deleteComment, which distinguishes the two tiers by whether the
 * holder also has manage_users (admin-tier) or not (artist-tier).
 *
 * Grants: Super Admin + Admin (global tier, via manage_users), and Artist
 * (own-songs tier). Follows seed-role-permissions: look up roles/permissions BY
 * NAME, never hardcode ids. permissions + role_permissions are the OLD camelCase
 * tables, so this writes createdAt/updatedAt.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('permissions', [
      {
        key: 'delete_comments',
        description: 'Delete comments (admins: any; artists: only on their own songs)',
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
      'Super Admin': ['delete_comments'],
      'Admin': ['delete_comments'],
      'Artist': ['delete_comments'],
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
      "SELECT id, `key` FROM permissions WHERE `key` = 'delete_comments';"
    );
    const ids = permissions.map((p) => p.id);
    if (ids.length) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: ids });
      await queryInterface.bulkDelete('permissions', { key: ['delete_comments'] });
    }
  },
};
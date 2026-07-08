'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Pull roles and permissions with their (whatever they are) ids, keyed by name.
    const [roles] = await queryInterface.sequelize.query(
      'SELECT id, name FROM roles;'
    );
    const [permissions] = await queryInterface.sequelize.query(
      'SELECT id, `key` FROM permissions;'
    );

    // 2. Build name -> id maps so we never touch a literal id.
    const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const permId = Object.fromEntries(permissions.map((p) => [p.key, p.id]));

    // 3. Declare grants by NAME. Readable, and matches the grid above exactly.
    const grants = {
      'Super Admin': [
        'upload_songs', 'delete_songs', 'manage_users',
        'view_analytics', 'feature_songs', 'moderate_comments',
        'manage_roles', // ← DAY 3: the differentiator
      ],
      'Admin': [
        'upload_songs', 'delete_songs', 'manage_users',
        'view_analytics', 'feature_songs', 'moderate_comments',
      ],
      'Moderator': ['moderate_comments'],
      // Artist and Listener intentionally absent — empty is correct.
    };

    // 4. Flatten (role, permission) name pairs into join rows using the id maps.
    const now = new Date();
    const rows = [];
    for (const [roleName, permKeys] of Object.entries(grants)) {
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

  async down(queryInterface) {
    await queryInterface.bulkDelete('role_permissions', null, {});
  },
};
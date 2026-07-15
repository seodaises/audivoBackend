'use strict';

/**
 * Additive seeder — creates the two new catalog permissions and grants them.
 * Follows seed-role-permissions: look up roles/permissions BY NAME, never
 * hardcode ids. permissions + role_permissions are the OLD camelCase tables, so
 * this writes createdAt/updatedAt (not created_at) to match their schema.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    await queryInterface.bulkInsert('permissions', [
      {
        key: 'manage_catalog',
        description: 'Oversee and manage the music catalog (all artists\u2019 content)',
        createdAt: now,
        updatedAt: now,
      },
      {
        key: 'manage_admins',
        description: 'Manage Admin accounts (Super Admin only)',
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
      'Super Admin': ['manage_catalog', 'manage_admins'],
      'Admin': ['manage_catalog'],
    };

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

  async down(queryInterface, Sequelize) {
    const [permissions] = await queryInterface.sequelize.query(
      "SELECT id, `key` FROM permissions WHERE `key` IN ('manage_catalog','manage_admins');"
    );
    const ids = permissions.map((p) => p.id);
    if (ids.length) {
      await queryInterface.bulkDelete('role_permissions', { permission_id: ids });
      await queryInterface.bulkDelete('permissions', {
        key: ['manage_catalog', 'manage_admins'],
      });
    }
  },
};
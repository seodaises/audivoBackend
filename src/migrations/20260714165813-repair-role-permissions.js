'use strict';

// CORRECTIVE MIGRATION — not a seeder.
//
// The role_permissions table drifted from its intended state. Six grants that
// should exist were absent, and one grant (Super Admin -> upload_songs) exists
// but is unexercisable: a Super Admin has no artist_profiles row, so the
// ownership chain (users -> artist_profiles -> albums -> songs) can never
// resolve for them. A permission you hold but can never use is a lie in the
// table, so it goes.
//
// WHY A MIGRATION AND NOT A RE-SEED:
// Seeders are for greenfield databases. This DB already has state — and the
// evidence says a previous truncate-and-reseed is precisely what caused this:
// permissions.id starts at 19, not 1, because AUTO_INCREMENT does not reset on
// DELETE. Any seeder that resolved permission ids by position rather than by
// key would have landed some grants and silently missed others. That is exactly
// the pattern in the data: no duplicates, no wrong grants, just absent rows.
//
// This migration resolves ids by KEY, every time, so it is immune to whatever
// the id space happens to be.

// The intended grant map. This is the single source of truth and MUST stay in
// lockstep with the frontend's auth/permissions.js — a mismatch there is the
// split-brain risk: the backend enforces the DB, the frontend renders the map,
// and when they disagree the UI shows buttons that 403 on click.
const INTENDED = {
  'Super Admin': [
    'delete_songs', 'manage_users', 'view_analytics', 'feature_songs',
    'moderate_comments', 'manage_roles', 'manage_catalog', 'manage_admins',
  ],
  Admin: [
    'delete_songs', 'manage_users', 'view_analytics',
    'feature_songs', 'manage_catalog',
  ],
  Moderator: ['moderate_comments'],
  Artist: ['upload_songs', 'delete_songs', 'view_analytics', 'feature_songs'],
  Listener: [],
};

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const { QueryTypes } = sequelize.constructor;

    const roles = await sequelize.query('SELECT id, name FROM roles', {
      type: QueryTypes.SELECT,
    });
    const perms = await sequelize.query('SELECT id, `key` FROM permissions', {
      type: QueryTypes.SELECT,
    });

    const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const permId = Object.fromEntries(perms.map((p) => [p.key, p.id]));

    // Fail loudly if the vocabulary is missing a key we intend to grant.
    // Inserting a NULL permission_id would blow up on the FK anyway — but with
    // a MySQL error nobody can read. This says what is actually wrong.
    for (const [role, keys] of Object.entries(INTENDED)) {
      if (!roleId[role]) throw new Error(`Role not found in DB: ${role}`);
      for (const k of keys) {
        if (!permId[k]) throw new Error(`Permission not found in DB: ${k}`);
      }
    }

    const existing = await sequelize.query(
      'SELECT role_id, permission_id FROM role_permissions',
      { type: QueryTypes.SELECT }
    );
    const has = new Set(existing.map((r) => `${r.role_id}:${r.permission_id}`));

    const now = new Date();
    const toInsert = [];
    const toDelete = [];

    for (const [role, keys] of Object.entries(INTENDED)) {
      const rid = roleId[role];
      const wanted = new Set(keys.map((k) => permId[k]));

      // Missing grants -> insert. Guarded by the `has` set so re-running this
      // migration on an already-correct DB inserts nothing.
      for (const pid of wanted) {
        if (!has.has(`${rid}:${pid}`)) toInsert.push({ rid, pid });
      }

      // Grants this role holds but should not -> delete. This is what removes
      // Super Admin's upload_songs.
      for (const row of existing) {
        if (row.role_id === rid && !wanted.has(row.permission_id)) {
          toDelete.push({ rid, pid: row.permission_id });
        }
      }
    }

    // NOTE the timestamp columns. role_permissions is one of the OLDER tables
    // and uses camelCase createdAt/updatedAt, unlike the newer snake_case
    // tables. Getting this wrong is a silent "unknown column" at run time.
    if (toInsert.length) {
      await queryInterface.bulkInsert(
        'role_permissions',
        toInsert.map(({ rid, pid }) => ({
          role_id: rid,
          permission_id: pid,
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    for (const { rid, pid } of toDelete) {
      await queryInterface.bulkDelete('role_permissions', {
        role_id: rid,
        permission_id: pid,
      });
    }
  },

  // Deliberately a no-op.
  //
  // The "before" state was corrupt. Reconstructing corruption on demand is not
  // a useful capability, and a down() that guessed at it would be worse than
  // none — it would let someone re-break the table by accident. Rolling this
  // back means restoring a backup, and that should be a conscious act.
  async down() {
    // no-op: see comment above
  },
};
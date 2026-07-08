'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {

    // STEP 1: add nullable, no constraint yet.
    await queryInterface.addColumn('users', 'username', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users ORDER BY id ASC;'
    );

    const taken = new Set();
    for (const { id, email } of rows) {
      // local-part = everything before the @, lowercased, stripped of
      // anything that isn't a-z/0-9/underscore, capped so a suffix still fits.
      const local = String(email).split('@')[0].toLowerCase();
      let base = local.replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'user';

      let candidate = base;
      let n = 1;
      // Collision handling: khawla, khawla1, khawla2, ...
      // Keep the whole thing <= 20 chars by trimming the base as the suffix grows.
      while (taken.has(candidate)) {
        const suffix = String(n);
        candidate = base.slice(0, 20 - suffix.length) + suffix;
        n += 1;
      }
      taken.add(candidate);

      await queryInterface.sequelize.query(
        'UPDATE users SET username = :username WHERE id = :id;',
        { replacements: { username: candidate, id } }
      );
    }

    // STEP 3: now every row has a value → tighten the column.
    await queryInterface.changeColumn('users', 'username', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });
    // Unique index, named so we can drop it cleanly in down().
    await queryInterface.addIndex('users', ['username'], {
      unique: true,
      name: 'users_username_unique',
    });

    // ── PROFILE FIELDS (all nullable — filled in later via the profile popup) ──
    await queryInterface.addColumn('users', 'gender', {
      type: Sequelize.STRING(30), // string, not ENUM — add options without a migration
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'birthday', {
      type: Sequelize.DATEONLY, // date with no time component
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'phone_number', {
      type: Sequelize.STRING(30), // string: preserves +, leading zeros, spacing
      allowNull: true,
    });
  },

  async down(queryInterface) {
    // Reverse order of up().
    await queryInterface.removeColumn('users', 'phone_number');
    await queryInterface.removeColumn('users', 'birthday');
    await queryInterface.removeColumn('users', 'gender');
    await queryInterface.removeIndex('users', 'users_username_unique');
    await queryInterface.removeColumn('users', 'username');
  },
};
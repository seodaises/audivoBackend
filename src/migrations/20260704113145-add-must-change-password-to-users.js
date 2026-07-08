'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Sticky flag: true = account is on a temporary password and must change it
    // on first login. Defaults to false so all existing rows are unaffected.
    await queryInterface.addColumn('users', 'must_change_password', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'must_change_password');
  },
};
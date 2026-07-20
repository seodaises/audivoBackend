'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('albums', 'archived_by', {
      type: Sequelize.ENUM('artist', 'admin'),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('albums', 'archived_by');
    // MySQL ties the ENUM type to the column, so dropping the column removes
    // the type too — no leftover type to clean up (unlike Postgres).
  },
};
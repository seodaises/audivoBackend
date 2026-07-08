'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const ranks = {
      'Listener': 1,
      'Artist': 2,
      'Moderator': 3,
      'Admin': 4,
      'Super Admin': 5,
    };

    for (const [name, level] of Object.entries(ranks)) {
      await queryInterface.bulkUpdate('roles', { level }, { name });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkUpdate('roles', { level: 1 }, null);
  },
};
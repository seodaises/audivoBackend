'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.bulkInsert('roles', [
      { name: 'Super Admin', description: 'Full access to everything',        createdAt: now, updatedAt: now },
      { name: 'Admin',       description: 'Manages users and content',        createdAt: now, updatedAt: now },
      { name: 'Artist',      description: 'Uploads and manages own songs',    createdAt: now, updatedAt: now },
      { name: 'Moderator',   description: 'Moderates comments and content',   createdAt: now, updatedAt: now },
      { name: 'Listener',    description: 'Default role — listens to music',  createdAt: now, updatedAt: now },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    await queryInterface.bulkInsert('permissions', [
      { key: 'upload_songs', description: 'Can upload songs', createdAt: now, updatedAt: now },
      { key: 'delete_songs', description: 'Can delete songs', createdAt: now, updatedAt: now },
      { key: 'manage_users', description: 'Can manage users', createdAt: now, updatedAt: now },
      { key: 'view_analytics', description: 'Can view analytics', createdAt: now, updatedAt: now },
      { key: 'feature_songs', description: 'Can feature songs', createdAt: now, updatedAt: now },
      { key: 'moderate_comments', description: 'Can moderate comments', createdAt: now, updatedAt: now },
      {key: 'manage_roles', description: 'Create roles and assign permissions to them (Super Admin only)',createdAt: new Date(), updatedAt: new Date(),},
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('permissions', null, {});
  },
};
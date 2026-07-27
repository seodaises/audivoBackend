'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('login_history', ['user_id', 'created_at'], {
      name: 'login_history_user_created_idx',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('login_history', 'login_history_user_created_idx');
  },
};
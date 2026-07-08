'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('login_history', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE', // a user's history leaves with them
      },
      ip_address: { type: Sequelize.STRING(45), allowNull: true }, // 45 = IPv6-safe
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      // no updated_at — a login event never changes after it happens
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('login_history');
  },
};
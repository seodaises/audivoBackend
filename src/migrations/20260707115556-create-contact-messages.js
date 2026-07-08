'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contact_messages', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },

      // The form is public (pre-auth), so the sender types their own name/email.
      // These are NOT foreign keys — a visitor may not be a registered user.
      name: { type: Sequelize.STRING(120), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false },
      subject: { type: Sequelize.STRING(200), allowNull: true },
      message: { type: Sequelize.TEXT, allowNull: false },

      // Optional link: if a logged-in user ever submits, we can stamp their id.
      // Nullable + ON DELETE SET NULL so deleting a user never erases the message.
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },

      // Admin workflow: new -> read -> resolved. Defaults to 'new'.
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'new',
      },

      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('contact_messages');
  },
};
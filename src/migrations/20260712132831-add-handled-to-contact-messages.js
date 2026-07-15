'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Who closed this query, and when. Both nullable: every existing row
    // predates this column, and an unresolved message has no handler yet.
    await queryInterface.addColumn('contact_messages', 'handled_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      // Soft-deleting an admin must never orphan or destroy a message.
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('contact_messages', 'handled_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('contact_messages', 'handled_at');
    await queryInterface.removeColumn('contact_messages', 'handled_by');
  },
};
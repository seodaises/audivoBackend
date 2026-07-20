'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('comments', 'reply_to_comment_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'comments', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // "Who replied to this specific comment" — same shape as the existing
    // parent_comment_id index, one level more specific.
    await queryInterface.addIndex('comments', ['reply_to_comment_id'], {
      name: 'comments_reply_to_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('comments', 'comments_reply_to_idx');
    await queryInterface.removeColumn('comments', 'reply_to_comment_id');
  },
};
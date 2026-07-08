'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'first_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'last_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'avatar_url', {
      type: Sequelize.STRING(2048), // URL string for now (no upload infra yet)
      allowNull: true,
    });

    // Structured address — one column per part, all optional.
    await queryInterface.addColumn('users', 'address_street', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'address_city', {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'address_country', {
      type: Sequelize.STRING(120),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'address_postal_code', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    // Reverse order — drop each column added above.
    await queryInterface.removeColumn('users', 'address_postal_code');
    await queryInterface.removeColumn('users', 'address_country');
    await queryInterface.removeColumn('users', 'address_city');
    await queryInterface.removeColumn('users', 'address_street');
    await queryInterface.removeColumn('users', 'avatar_url');
    await queryInterface.removeColumn('users', 'last_name');
    await queryInterface.removeColumn('users', 'first_name');
  },
};
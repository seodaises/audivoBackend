'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactMessage extends Model {
    static associate(models) {
      // Optional link to a registered user (nullable — form is public).
      ContactMessage.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  ContactMessage.init(
    {
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
      },
      subject: { type: DataTypes.STRING(200), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'new', // new | read | resolved
      },
    },
    {
      sequelize,
      modelName: 'ContactMessage',
      tableName: 'contact_messages',
      underscored: true, // created_at / updated_at
    }
  );

  return ContactMessage;
};
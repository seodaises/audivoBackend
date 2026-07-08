'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EmailVerificationToken extends Model {
    static associate(models) {
      EmailVerificationToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  EmailVerificationToken.init(
    {
      user_id:    { type: DataTypes.INTEGER, allowNull: false },
      token:      { type: DataTypes.STRING,  allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE,    allowNull: false },
      used_at:    { type: DataTypes.DATE,    allowNull: true },
    },
    {
      sequelize,
      modelName: 'EmailVerificationToken',
      tableName: 'email_verification_tokens',
      underscored: true, // maps JS expiresAt ↔ SQL expires_at, and manages created_at/updated_at
    }
  );

  return EmailVerificationToken;
};
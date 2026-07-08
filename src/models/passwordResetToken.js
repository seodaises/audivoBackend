'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PasswordResetToken extends Model {
    static associate(models) {
      PasswordResetToken.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
      });
    }

    get isExpired() { return this.expires_at < new Date(); }
    get isUsed() { return this.used_at !== null; }
  }

  PasswordResetToken.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      token_hash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'PasswordResetToken',
      tableName: 'password_reset_tokens',
      underscored: true,
    }
  );

  return PasswordResetToken;
};
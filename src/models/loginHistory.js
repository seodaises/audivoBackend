'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LoginHistory extends Model {
    static associate(models) {
      LoginHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  LoginHistory.init(
    {
      user_id:    { type: DataTypes.INTEGER, allowNull: false },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'LoginHistory',
      tableName: 'login_history',
      underscored: true,
      updatedAt: false, // matches the table — created_at only
    }
  );

  return LoginHistory;
};
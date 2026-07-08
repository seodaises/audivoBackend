'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {

  class RolePermission extends Model {
    static associate(models) {
      // Direct belongsTo links are handy for explicit joins/queries even though
      // the belongsToMany on Role/Permission is what powers eager loading.
      RolePermission.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
      RolePermission.belongsTo(models.Permission, {
        foreignKey: 'permission_id',
        as: 'permission',
      });
    }
  }

  RolePermission.init(
    {
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'RolePermission',
      tableName: 'role_permissions',
    }
  );

  return RolePermission;
};
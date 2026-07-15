'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Like extends Model {
    static associate(models) {
      Like.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      Like.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
    }
  }

  Like.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      song_id: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: 'Like',
      tableName: 'likes',
      underscored: true,
      // created_at only — there is no updated_at on this table. A like is not a
      // thing you EDIT; it exists or it doesn't. Sequelize would otherwise expect an
      // updated_at column that the migration never created, and every insert would
      // fail on an unknown column.
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return Like;
};
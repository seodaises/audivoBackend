'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SavedSong extends Model {
    static associate(models) {
      SavedSong.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      SavedSong.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
    }
  }

  SavedSong.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      song_id: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: 'SavedSong',
      tableName: 'saved_songs',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return SavedSong;
};
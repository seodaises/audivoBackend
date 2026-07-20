'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlayHistory extends Model {
    static associate(models) {
      PlayHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      PlayHistory.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
    }
  }

  PlayHistory.init(
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      song_id: { type: DataTypes.INTEGER, allowNull: false },
      ms_played: { type: DataTypes.INTEGER, allowNull: true },
      is_self_play: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      source: {
        type: DataTypes.ENUM('browse', 'album', 'playlist', 'queue', 'search', 'artist'),
        allowNull: false,
        defaultValue: 'browse',
      },
      played_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'PlayHistory',
      tableName: 'play_history',
      underscored: true,
      timestamps: false,
    }
  );

  return PlayHistory;
};
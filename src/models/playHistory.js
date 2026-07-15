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
      // Nullable twice over: anonymous plays have no user, and a deleted user's
      // plays are SET NULL rather than destroyed. The listener leaves; the listen
      // stays, because it genuinely happened and play_count already counted it.
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      song_id: { type: DataTypes.INTEGER, allowNull: false },
      ms_played: { type: DataTypes.INTEGER, allowNull: true },
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
      // NO Sequelize-managed timestamps at all. `played_at` is not a created_at with
      // a different name — it's a domain field that happens to be a date, and it's
      // the ONLY time this row will ever have. A play event is immutable: it happened,
      // once, and is never edited. Letting Sequelize manage created_at/updated_at here
      // would add two columns the migration never created.
      timestamps: false,
    }
  );

  return PlayHistory;
};
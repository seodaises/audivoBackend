'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SongLyrics extends Model {
    static associate(models) {
      SongLyrics.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
    }

    get isReady() {
      return this.status === 'completed';
    }
  }

  SongLyrics.init(
    {
      song_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // one-to-one: mirrors the song_lyrics_song_id_unique index
      },
      status: {
        type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      raw_text: { type: DataTypes.TEXT, allowNull: true },
      synced_lyrics: { type: DataTypes.JSON, allowNull: true },
      source: {
        type: DataTypes.ENUM('ai_generated', 'artist_edited'),
        allowNull: true,
      },
      error_message: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'SongLyrics',
      tableName: 'song_lyrics',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return SongLyrics;
};
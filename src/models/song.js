'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Song extends Model {
    static associate(models) {
      Song.belongsTo(models.Album, { foreignKey: 'album_id', as: 'album' });

      // Denormalized owner link: every song reaches its owner without joining
      // through album. Ownership checks and "all my songs" are the hot paths.
      Song.belongsTo(models.ArtistProfile, {
        foreignKey: 'artist_profile_id',
        as: 'artistProfile',
      });

      Song.belongsToMany(models.Genre, {
        through: models.SongGenre,
        foreignKey: 'song_id',
        otherKey: 'genre_id',
        as: 'genres',
      });

      Song.hasMany(models.SongGenre, { foreignKey: 'song_id', as: 'songGenres' });
    }
  }

  Song.init(
    {
      album_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // every song belongs to an album
      },
      artist_profile_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // denormalized owner (kept in sync with album.artist_profile_id)
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      storage_key: {
        type: DataTypes.STRING(512),
        allowNull: false, // disk key for the audio file; served via a gated route, never public
      },
      duration_seconds: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      track_number: {
        type: DataTypes.INTEGER,
        allowNull: true, // position within the album
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      play_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0, // forward-looking hook for analytics
      },
    },
    {
      sequelize,
      modelName: 'Song',
      tableName: 'songs',
      underscored: true,
    }
  );

  return Song;
};
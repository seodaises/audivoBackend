'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Album extends Model {
    static associate(models) {
      Album.belongsTo(models.ArtistProfile, {
        foreignKey: 'artist_profile_id',
        as: 'artistProfile',
      });
      Album.hasMany(models.Song, { foreignKey: 'album_id', as: 'songs' });
      Album.hasMany(models.SavedAlbum, { foreignKey: 'album_id', as: 'saves' });
    }
  }

  Album.init(
    {
      artist_profile_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      cover_url: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        validate: {
          isUrlIfPresent(value) {
            if (value == null || value === '') return;
            if (!/^https?:\/\/.+/i.test(value)) {
              throw new Error('cover_url must be a valid http(s) URL');
            }
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'archived', 'scheduled'),
        allowNull: false,
        defaultValue: 'draft', // listeners see 'published' only
      },
      archived_by: {
        type: DataTypes.ENUM('artist', 'admin'),
        allowNull: true,
        defaultValue: null,
      },
      release_date: {
        type: DataTypes.DATEONLY,
        allowNull: true, // human-facing display date only
      },
      release_at: {
        type: DataTypes.DATE,
        allowNull: true, // UTC trigger instant for a scheduled release; NULL otherwise
      },
      is_single: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false, // a standalone single is a 1-track album with this flag set
      },
    },
    {
      sequelize,
      modelName: 'Album',
      tableName: 'albums',
      underscored: true,
    }
  );

  return Album;
};
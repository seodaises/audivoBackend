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
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'draft', // listeners see 'published' only
      },
      release_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
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
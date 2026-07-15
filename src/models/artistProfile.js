'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ArtistProfile extends Model {
    static associate(models) {
      // one profile per user — the profile IS the artist's presence
      ArtistProfile.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });

      // a profile owns its catalog
      ArtistProfile.hasMany(models.Album, { foreignKey: 'artist_profile_id', as: 'albums' });
      ArtistProfile.hasMany(models.Song, { foreignKey: 'artist_profile_id', as: 'songs' });
      ArtistProfile.hasMany(models.Follow, { foreignKey: 'artist_profile_id', as: 'followers' });
    }
  }

  ArtistProfile.init(
    {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // one-to-one: mirrors the artist_profiles_user_id_unique index
      },
      stage_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      avatar_url: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        validate: {
          // URL-based, same guard style as User.avatar_url — NULL/empty allowed.
          isUrlIfPresent(value) {
            if (value == null || value === '') return;
            if (!/^https?:\/\/.+/i.test(value)) {
              throw new Error('avatar_url must be a valid http(s) URL');
            }
          },
        },
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false, // the verified-artist gate for publishing
      },
    },
    {
      sequelize,
      modelName: 'ArtistProfile',
      tableName: 'artist_profiles',
      underscored: true,
    }
  );

  return ArtistProfile;
};
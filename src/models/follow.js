'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Follow extends Model {
    static associate(models) {
      // The FOLLOWER is a user...
      Follow.belongsTo(models.User, { foreignKey: 'follower_user_id', as: 'follower' });
      // ...but the FOLLOWED is an artist PROFILE, not a user. You follow the act,
      // not the person holding the login.
      Follow.belongsTo(models.ArtistProfile, {
        foreignKey: 'artist_profile_id',
        as: 'artistProfile',
      });
    }
  }

  Follow.init(
    {
      follower_user_id: { type: DataTypes.INTEGER, allowNull: false },
      artist_profile_id: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: 'Follow',
      tableName: 'follows',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return Follow;
};
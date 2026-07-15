'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SavedAlbum extends Model {
    static associate(models) {
      SavedAlbum.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      SavedAlbum.belongsTo(models.Album, { foreignKey: 'album_id', as: 'album' });
    }
  }

  SavedAlbum.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      album_id: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: 'SavedAlbum',
      tableName: 'saved_albums',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  return SavedAlbum;
};
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Genre extends Model {
    static associate(models) {
      Genre.belongsToMany(models.Song, {
        through: models.SongGenre,
        foreignKey: 'genre_id',
        otherKey: 'song_id',
        as: 'songs',
      });
    }
  }

  Genre.init(
    {
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true, // mirrors the genres_name_unique index
      },
    },
    {
      sequelize,
      modelName: 'Genre',
      tableName: 'genres',
      underscored: true,
    }
  );

  return Genre;
};
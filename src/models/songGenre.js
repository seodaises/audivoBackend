'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SongGenre extends Model {
    static associate(models) {
      // Direct links for explicit joins, mirroring the RolePermission pattern.
      SongGenre.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
      SongGenre.belongsTo(models.Genre, { foreignKey: 'genre_id', as: 'genre' });
    }
  }

  SongGenre.init(
    {
      song_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true, // composite PK part 1 — prevents duplicate pairings
      },
      genre_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true, // composite PK part 2
      },
    },
    {
      sequelize,
      modelName: 'SongGenre',
      tableName: 'song_genres',
      underscored: true,
    }
  );

  return SongGenre;
};
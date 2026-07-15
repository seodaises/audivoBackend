'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Playlist extends Model {
    static associate(models) {
      Playlist.belongsTo(models.User, { foreignKey: 'user_id', as: 'owner' });

      // The ordered tracklist. Note there is deliberately NO belongsToMany
      // Song-through-PlaylistSong here: a belongsToMany would hand back a Set, and
      // a playlist is a LIST. The same song can appear twice, and the order is the
      // whole point — both of which a Set silently destroys. Go through the join
      // rows explicitly so `position` survives.
      Playlist.hasMany(models.PlaylistSong, {
        foreignKey: 'playlist_id',
        as: 'tracks',
      });
    }

    get isDeleted() {
      return this.deleted_at !== null;
    }
  }

  Playlist.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      cover_url: { type: DataTypes.STRING(512), allowNull: true },
      is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Playlist',
      tableName: 'playlists',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      // paranoid is deliberately OFF, even though deleted_at exists.
      //
      // Nothing else in this codebase uses paranoid — `users` manages deleted_at by
      // hand. Turning it on here would mean two different soft-delete mechanisms
      // living side by side, one of them invisible: paranoid silently rewrites every
      // query to add `WHERE deleted_at IS NULL`, which is lovely until the day you
      // WANT the deleted rows (a restore feature, an admin audit) and can't work out
      // why they don't exist. Explicit beats magic. We filter in the service.
      paranoid: false,
    }
  );

  return Playlist;
};
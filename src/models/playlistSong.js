'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlaylistSong extends Model {
    static associate(models) {
      PlaylistSong.belongsTo(models.Playlist, { foreignKey: 'playlist_id', as: 'playlist' });
      PlaylistSong.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
    }
  }

  PlaylistSong.init(
    {
      playlist_id: { type: DataTypes.INTEGER, allowNull: false },
      song_id: { type: DataTypes.INTEGER, allowNull: false },

      // Fractional position, so reordering touches ONE row instead of renumbering
      // the whole list. Drop between 2.0 and 3.0 -> write 2.5.
      //
      // The getter matters more than it looks. MySQL hands DECIMAL back to node as a
      // STRING — always, to avoid float precision loss. Without this getter,
      // `track.position` is "2.5000000000", and the moment you sort on it you get
      // LEXICOGRAPHIC order: "10" sorts before "9", and a 12-track album shuffles
      // itself. This is the same class of bug as the SUM(play_count) string in
      // adminService, and it's caught here once rather than at every call site.
      position: {
        type: DataTypes.DECIMAL(20, 10),
        allowNull: false,
        get() {
          const raw = this.getDataValue('position');
          return raw === null ? null : Number(raw);
        },
      },
    },
    {
      sequelize,
      modelName: 'PlaylistSong',
      tableName: 'playlist_songs',
      underscored: true,
      timestamps: true,
      createdAt: 'added_at',   // the migration named it added_at, not created_at
      updatedAt: false,
    }
  );

  return PlaylistSong;
};
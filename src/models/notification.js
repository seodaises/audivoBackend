'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, {
        foreignKey: 'recipient_user_id',
        as: 'recipient',
      });

      // WHO triggered it (commenter / replier). Null for release events.
      Notification.belongsTo(models.User, {
        foreignKey: 'actor_user_id',
        as: 'actor',
      });

      // Subject links — only one set is populated per row, keyed by `type`.
      Notification.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });
      Notification.belongsTo(models.Album, { foreignKey: 'album_id', as: 'album' });
      Notification.belongsTo(models.Comment, { foreignKey: 'comment_id', as: 'comment' });
    }

    get isRead() {
      return this.read_at !== null && this.read_at !== undefined;
    }
  }

  Notification.init(
    {
      recipient_user_id: { type: DataTypes.INTEGER, allowNull: false },
      actor_user_id: { type: DataTypes.INTEGER, allowNull: true },
      type: {
        type: DataTypes.ENUM(
          'release',
          'upcoming_release',
          'comment',
          'comment_reply'
        ),
        allowNull: false,
      },
      song_id: { type: DataTypes.INTEGER, allowNull: true },
      album_id: { type: DataTypes.INTEGER, allowNull: true },
      comment_id: { type: DataTypes.INTEGER, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notifications',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Notification;
};
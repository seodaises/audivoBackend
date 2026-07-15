'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Comment extends Model {
    static associate(models) {
      Comment.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
      Comment.belongsTo(models.Song, { foreignKey: 'song_id', as: 'song' });

      // WHO hid it — the audit trail. Separate alias from `author`, because a comment
      // has two different users attached to it and they mean opposite things.
      Comment.belongsTo(models.User, {
        foreignKey: 'hidden_by_user_id',
        as: 'hiddenBy',
      });

      // SELF-REFERENCE. Both directions of the same FK:
      //   parent  — the comment this one replies to (null if top-level)
      //   replies — the comments replying to this one
      Comment.belongsTo(models.Comment, {
        foreignKey: 'parent_comment_id',
        as: 'parent',
      });
      Comment.hasMany(models.Comment, {
        foreignKey: 'parent_comment_id',
        as: 'replies',
      });
    }

    get isDeleted() {
      return this.deleted_at !== null;
    }

    get isHidden() {
      return this.status === 'hidden';
    }
  }

  Comment.init(
    {
      user_id: { type: DataTypes.INTEGER, allowNull: false },
      song_id: { type: DataTypes.INTEGER, allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: false },
      parent_comment_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.ENUM('visible', 'hidden'),
        allowNull: false,
        defaultValue: 'visible',
      },
      hidden_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'Comment',
      tableName: 'comments',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: false, // same reasoning as Playlist — we filter explicitly
    }
  );

  return Comment;
};
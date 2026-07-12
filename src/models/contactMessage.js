'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContactMessage extends Model {
    static associate(models) {
      // Optional link to a registered user (nullable — form is public).
      ContactMessage.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });

      // The admin who resolved this query. Null until someone does.
      ContactMessage.belongsTo(models.User, { foreignKey: 'handled_by', as: 'handler' });
    }
  }

  ContactMessage.init(
    {
      name: { type: DataTypes.STRING(120), allowNull: false },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { isEmail: true },
      },
      subject: { type: DataTypes.STRING(200), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: false },
      user_id: { type: DataTypes.INTEGER, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'new', // new | read | resolved
      },

      // Audit trail. Stamped only on 'resolved'; cleared if un-resolved.
      // 'read' is a passive state (auto-set on open) and deliberately does
      // NOT claim a handler — opening a message is not the same as owning it.
      handled_by: { type: DataTypes.INTEGER, allowNull: true },
      handled_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      sequelize,
      modelName: 'ContactMessage',
      tableName: 'contact_messages',
      underscored: true, // created_at / updated_at
    }
  );

  return ContactMessage;
};
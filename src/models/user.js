'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // one role per user
      User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
      User.hasMany(models.EmailVerificationToken, {
        foreignKey: 'user_id',
        as: 'verificationTokens',
      });
      User.hasMany(models.PasswordResetToken, { foreignKey: 'user_id', as: 'resetTokens' });
      User.hasMany(models.LoginHistory, { foreignKey: 'user_id', as: 'loginHistory' });
    }

    get isVerified() {
      return this.email_verified_at !== null;
    }

    get isDeleted() {
      return this.deleted_at !== null;
    }

    get fullName() {
      const parts = [this.first_name, this.last_name].filter(Boolean);
      return parts.length ? parts.join(' ') : null;
    }
  }

  User.init(
    {
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      display_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      first_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      last_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      avatar_url: {
        type: DataTypes.STRING(2048),
        allowNull: true,
        validate: {
          // Only validate when a value is present — NULL/empty stays allowed.
          isUrlIfPresent(value) {
            if (value == null || value === '') return;
            // Lightweight guard: must look like an http(s) URL.
            if (!/^https?:\/\/.+/i.test(value)) {
              throw new Error('avatar_url must be a valid http(s) URL');
            }
          },
        },
      },
      // --- identity handle (added by add-username-and-profile-fields migration) ---
      username: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true, // mirrors the DB's users_username_unique index
        validate: {
          // a-z, 0-9, underscore only — keeps handles clean and URL-safe
          is: {
            args: /^[a-z0-9_]+$/,
            msg: 'username may contain only lowercase letters, numbers, and underscores',
          },
          len: {
            args: [3, 20],
            msg: 'username must be between 3 and 20 characters',
          },
        },
      },

      gender: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      birthday: {
        type: DataTypes.DATEONLY, // 'YYYY-MM-DD', no time component
        allowNull: true,
      },
      phone_number: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },

      address_street: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      address_city: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      address_country: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      address_postal_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      // ---------------------------------------------------------------------------

      must_change_password: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
      email_verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      last_login_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      underscored: true, // maps createdAt -> created_at automatically
    }
  );

  return User;
};
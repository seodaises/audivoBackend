'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

// Your Sequelize instance is already created and exported by config/db.js.
// We import it here rather than rebuilding it — single source of truth for
// the DB connection.
const sequelize = require('../config/db');

const basename = path.basename(__filename);
const db = {};

// Load every model file in this folder (except this one), call its factory,
// and register it under its modelName.
fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// Wire associations now that all models are registered — this is what makes
// User.belongsTo(Role) and the token -> user FK actually fire.
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
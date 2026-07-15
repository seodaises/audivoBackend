'use strict';
const db = require('../models');
const ApiError = require('../utils/ApiError');

const genreRow = (g) => ({ id: g.id, name: g.name });

const listGenres = async () => {
  const genres = await db.Genre.findAll({ order: [['name', 'ASC']] });
  return genres.map(genreRow);
};

const createGenre = async ({ name }) => {
  const clean = String(name || '').trim();
  if (!clean) throw new ApiError(400, 'name is required');

  const existing = await db.Genre.findOne({ where: { name: clean } });
  if (existing) throw new ApiError(409, 'Genre already exists');

  const created = await db.Genre.create({ name: clean });
  return genreRow(created);
};

module.exports = { listGenres, createGenre, genreRow };
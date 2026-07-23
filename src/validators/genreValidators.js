'use strict';
const Joi = require('joi');

// Genre: the simplest domain. name is genres.name STRING(100) NOT NULL.
// Uniqueness (a duplicate genre name) is a 409 owned by genreService — not here.

const createGenre = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100).required().messages({
      'string.empty': 'name is required',
      'string.max': 'name must be at most 100 characters',
      'any.required': 'name is required',
    }),
  }),
};

module.exports = { createGenre };

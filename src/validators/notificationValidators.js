'use strict';
const Joi = require('joi');
const { pagination, idParam } = require('./commonValidators');

// GET /notifications?page=&limit=&unreadOnly=
const list = {
  query: pagination.keys({
    unreadOnly: Joi.boolean().optional().messages({
      'boolean.base': 'unreadOnly must be true or false',
    }),
  }),
};

// PATCH /notifications/:id/read
const markRead = { params: idParam };

module.exports = { list, markRead };
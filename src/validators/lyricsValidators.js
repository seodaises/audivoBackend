'use strict';
const Joi = require('joi');

const idParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required().messages({
      'number.base': 'id must be a number',
      'any.required': 'id is required',
    }),
  }),
};

const updateLyrics = {
  params: idParam.params,
  body: Joi.object({
   
    lines: Joi.array()
      .items(
        Joi.object({
          time: Joi.number().min(0).required(),
          text: Joi.string().trim().min(1).max(500).required(),
        })
      )
      .min(1)
      .required(),
  }),
};

module.exports = { generateLyrics: idParam, updateLyrics, getLyrics: idParam, getPublicLyrics: idParam };
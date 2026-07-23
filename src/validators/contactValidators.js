'use strict';
const Joi = require('joi');

// Public contact form. Length caps mirror contactService.LIMITS:
//   name 120 (required) · email 255 (required) · subject 200 · message 5000 (required)
const submit = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(120).required().messages({
      'string.empty': 'name is required',
      'string.max': 'name is too long',
      'any.required': 'name is required',
    }),
    email: Joi.string().trim().email().max(255).required().messages({
      'string.email': 'A valid email is required',
      'string.max': 'email is too long',
      'any.required': 'email is required',
    }),
    subject: Joi.string().trim().max(200).allow('').optional().messages({
      'string.max': 'subject is too long',
    }),
    message: Joi.string().trim().min(1).max(5000).required().messages({
      'string.empty': 'message is required',
      'string.max': 'message is too long',
      'any.required': 'message is required',
    }),
  }),
};

module.exports = { submit };

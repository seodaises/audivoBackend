'use strict';
const Joi = require('joi');
const { idParam, pagination } = require('./commonValidators');

// Comment body: comments.body TEXT NOT NULL, service caps at MAX_BODY = 2000.
// status enum: 'visible' | 'hidden' (commentService.setCommentStatus).
// parentCommentId: optional; service treats undefined/null/'' as "top-level".

const body = Joi.string().trim().min(1).max(2000).messages({
  'string.empty': 'Comment cannot be empty',
  'string.min': 'Comment cannot be empty',
  'string.max': 'Comment must be 2000 characters or fewer',
  'any.required': 'Comment cannot be empty',
});

// GET /songs/:id/comments
const listForSong = {
  params: idParam,
  query: pagination,
};

// POST /songs/:id/comments
const createComment = {
  params: idParam,
  body: Joi.object({
    body: body.required(),
    // Allow a positive int, or the "no parent" sentinels the service accepts.
    parentCommentId: Joi.number().integer().positive().allow(null, '').optional().messages({
      'number.base': 'parentCommentId must be a number',
    }),
  }),
};

// DELETE /comments/:id
const deleteComment = { params: idParam };

// PATCH /comments/:id/status
const setCommentStatus = {
  params: idParam,
  body: Joi.object({
    status: Joi.string().valid('visible', 'hidden').required().messages({
      'any.only': "status must be 'visible' or 'hidden'",
      'any.required': 'status is required',
    }),
  }),
};

// GET /comments/hidden
const listHidden = { query: pagination };

module.exports = {
  listForSong,
  createComment,
  deleteComment,
  setCommentStatus,
  listHidden,
};

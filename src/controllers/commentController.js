'use strict';
const commentService = require('../services/commentService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// GET /api/songs/:id/comments
const listForSong = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await commentService.listForSong({
    actor: req.user,
    songId: req.params.id,
    page,
    limit,
  });
  return success(res, 200, 'Comments', result);
});

// POST /api/songs/:id/comments
// body: { body, parentCommentId? }
const createComment = catchAsync(async (req, res) => {
  const { body, parentCommentId } = req.body;
  const result = await commentService.createComment({
    actor: req.user,
    songId: req.params.id,
    body,
    parentCommentId,
  });
  return success(res, 201, 'Comment posted', result);
});

// DELETE /api/comments/:id — the AUTHOR withdrawing their own comment.
const deleteComment = catchAsync(async (req, res) => {
  const result = await commentService.deleteComment({
    actor: req.user,
    commentId: req.params.id,
  });
  return success(res, 200, 'Comment deleted', result);
});

// ── Moderation (requires moderate_comments) ──────────────────────────────────

// PATCH /api/comments/:id/status  body: { status: 'visible' | 'hidden' }
const setCommentStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const result = await commentService.setCommentStatus({
    actor: req.user,
    commentId: req.params.id,
    status,
  });
  return success(res, 200, 'Comment status updated', result);
});

// GET /api/comments/hidden — the moderation queue.
const listHidden = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await commentService.listHidden({ page, limit });
  return success(res, 200, 'Hidden comments', result);
});

module.exports = {
  listForSong,
  createComment,
  deleteComment,
  setCommentStatus,
  listHidden,
};
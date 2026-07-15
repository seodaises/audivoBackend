'use strict';
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');

const MODERATOR = 3;

// ── Moderation queue ─────────────────────────────────────────────────────────
//
// MUST be declared BEFORE '/:id/...' routes. Express matches top-down, so a
// literal '/hidden' registered after a ':id' pattern would never be reached —
// '/hidden' would be swallowed as an id and blow up on Number('hidden').
router.get(
  '/hidden',
  protect,
  requireMinLevel(MODERATOR),
  requirePermission('moderate_comments'),
  commentController.listHidden
);

// The double gate matches the rest of the codebase: requireMinLevel is a coarse
// floor, requirePermission is the actual authority. Level alone is not enough —
// permissions are assignable per-role in the DB, so the permission is the
// source of truth and the level is a cheap early reject.
router.patch(
  '/:id/status',
  protect,
  requireMinLevel(MODERATOR),
  requirePermission('moderate_comments'),
  commentController.setCommentStatus
);

// Deleting your OWN comment is not a privileged act — any listener may withdraw
// what they wrote. Ownership is checked inside the service, because the rule is
// "is this row yours", which only the service can answer.
router.delete('/:id', protect, commentController.deleteComment);

module.exports = router;
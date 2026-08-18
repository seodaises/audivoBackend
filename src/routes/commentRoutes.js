'use strict';
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');
const validate = require('../middlewares/validate');
const v = require('../validators/commentValidators');

const MODERATOR = 3;

// ── Moderation queue ─────────────────────────────────────────────────────────
// MUST be declared BEFORE '/:id/...' routes (Express matches top-down, else
// '/hidden' is swallowed as an :id).
router.get(
  '/hidden',
  protect,
  requireMinLevel(MODERATOR),
  requirePermission('moderate_comments'),
  validate(v.listHidden),
  commentController.listHidden
);

router.patch(
  '/:id/status',
  protect,
  requireMinLevel(MODERATOR),
  requirePermission('moderate_comments'),
  validate(v.setCommentStatus),
  commentController.setCommentStatus
);

// Deleting your OWN comment is not privileged — ownership checked in the service.
router.delete('/:id', protect, validate(v.deleteComment), commentController.deleteComment);

module.exports = router;

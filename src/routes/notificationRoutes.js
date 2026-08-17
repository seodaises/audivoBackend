'use strict';
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { socialLimiter } = require('../middlewares/rateLimiters');
const validate = require('../middlewares/validate');
const v = require('../validators/notificationValidators');

// Every notification is the caller's own — no permission gate, just a session.
router.use(protect);

// ── Reads ────────────────────────────────────────────────────────────────────
// Static paths declared BEFORE '/:id/...' so Express doesn't swallow
// 'unread-count' / 'read-all' as an :id.
router.get('/', validate(v.list), notificationController.list);
router.get('/unread-count', notificationController.unreadCount);

// ── Writes (mark read) ───────────────────────────────────────────────────────
// socialLimiter reused: these are cheap, user-keyed idempotent writes, same tier
// as likes/follows. No dedicated notification limiter needed.
router.patch('/read-all', socialLimiter, notificationController.markAllRead);
router.patch('/:id/read', socialLimiter, validate(v.markRead), notificationController.markRead);

module.exports = router;
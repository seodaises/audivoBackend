'use strict';
const notificationService = require('../services/notificationService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');

// GET /api/notifications?page=&limit=&unreadOnly=  — the caller's feed.
const list = catchAsync(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;
  const result = await notificationService.listForUser({
    actor: req.user,
    page,
    limit,
    unreadOnly: unreadOnly === true || unreadOnly === 'true',
  });
  return success(res, 200, 'Notifications retrieved', result);
});

// GET /api/notifications/unread-count  — badge number for the header bell.
const unreadCount = catchAsync(async (req, res) => {
  const result = await notificationService.unreadCount({ actor: req.user });
  return success(res, 200, 'Unread count retrieved', result);
});

// PATCH /api/notifications/:id/read  — mark one read.
const markRead = catchAsync(async (req, res) => {
  const result = await notificationService.markRead({
    actor: req.user,
    notificationId: req.params.id,
  });
  return success(res, 200, 'Notification marked read', result);
});

// PATCH /api/notifications/read-all  — mark everything read.
const markAllRead = catchAsync(async (req, res) => {
  const result = await notificationService.markAllRead({ actor: req.user });
  return success(res, 200, 'All notifications marked read', result);
});

module.exports = { list, unreadCount, markRead, markAllRead };
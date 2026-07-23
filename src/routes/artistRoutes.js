'use strict';
const express = require('express');
const router = express.Router();
const artistProfileController = require('../controllers/artistProfileController');
const artistAnalyticsController = require('../controllers/artistAnalyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { requirePermission } = require('../middlewares/requirePermission');
const noCache = require('../middlewares/noCache');
const validate = require('../middlewares/validate');
const v = require('../validators/artistValidators');

router.use(noCache);

// Creating an artist profile is gated to the Artist role EXACTLY.
router.post('/profile', protect, requireRole('Artist'), validate(v.createMyProfile), artistProfileController.createMyProfile);

// Editing / reading your own profile stays open to any authenticated user who
// actually HAS a profile — the service throws 403/404 if they don't.
router.patch('/profile', protect, validate(v.updateMyProfile), artistProfileController.updateMyProfile);
router.get('/profile', protect, artistProfileController.getMyProfile);

// The logged-in user's OWN catalog (Library page): albums + songs, all statuses.
router.get('/catalog', protect, artistProfileController.getMyCatalog);

// An artist's own track performance. Gated on the permission only.
router.get('/analytics/tracks', protect, requirePermission('view_analytics'), validate(v.myTrackPerformance), artistAnalyticsController.myTrackPerformance);

module.exports = router;

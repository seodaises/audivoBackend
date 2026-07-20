'use strict';
const express = require('express');
const router = express.Router();
const artistProfileController = require('../controllers/artistProfileController');
const artistAnalyticsController = require('../controllers/artistAnalyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/requireRole');
const { requirePermission } = require('../middlewares/requirePermission');
const noCache = require('../middlewares/noCache');

router.use(noCache);

// Creating an artist profile is gated to the Artist role EXACTLY. A user chooses
// the Artist role at signup; only then can they establish an artist presence.
// (Verification by an admin is a SEPARATE, later gate — it's required before
// publishing, not before creating the profile. See albumService: createAlbum
// requires a verified profile.) Mods/Admins deliberately cannot create profiles
// here — artist-hood is an identity, not a rank-inherited ability.
router.post('/profile', protect, requireRole('Artist'), artistProfileController.createMyProfile);

// Editing / reading your own profile stays open to any authenticated user who
// actually HAS a profile — the service throws 403/404 if they don't. No role
// gate needed: a non-artist simply has nothing to read or edit.
router.patch('/profile', protect, artistProfileController.updateMyProfile);
router.get('/profile', protect, artistProfileController.getMyProfile);

// The logged-in user's OWN catalog (Library page): albums + songs, all statuses.
// Open to any authenticated user; the service returns an empty catalog (not an
// error) for non-artists, so a brand-new user's Library isn't a 404.
router.get('/catalog', protect, artistProfileController.getMyCatalog);

// An artist's own track performance. Gated on the permission only — NOT on
// requireMinLevel(ADMIN) like /admin/metrics, because this returns strictly the
// caller's own rows. The service scopes by req.user's artist profile, so the
// permission answers "may you see analytics at all" and the service answers
// "whose". Non-artists with the permission get an empty payload, not a 403.
router.get('/analytics/tracks', protect, requirePermission('view_analytics'), artistAnalyticsController.myTrackPerformance);

module.exports = router;
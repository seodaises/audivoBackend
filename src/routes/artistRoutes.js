'use strict';
const express = require('express');
const router = express.Router();
const artistProfileController = require('../controllers/artistProfileController');
const { protect } = require('../middlewares/authMiddleware');
const noCache = require('../middlewares/noCache');

router.use(noCache);

router.post('/profile', protect, artistProfileController.createMyProfile);
router.patch('/profile', protect, artistProfileController.updateMyProfile);
router.get('/profile', protect, artistProfileController.getMyProfile);

module.exports = router;
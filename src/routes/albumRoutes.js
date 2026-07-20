'use strict';
const express = require('express');
const router = express.Router();
const albumController = require('../controllers/albumController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/', protect, albumController.createAlbum);
router.patch('/:id', protect, albumController.updateAlbum);
router.patch('/:id/status', protect, albumController.updateStatus);
router.patch('/:id/schedule', protect, albumController.scheduleRelease);
router.delete('/:id/schedule', protect, albumController.cancelSchedule);
router.get('/:id', protect, albumController.getAlbum);
router.delete('/:id', protect, albumController.deleteAlbum);

module.exports = router;
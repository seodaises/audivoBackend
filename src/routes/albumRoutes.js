'use strict';
const express = require('express');
const router = express.Router();
const albumController = require('../controllers/albumController');
const { protect } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const v = require('../validators/albumValidators');

router.post('/', protect, validate(v.createAlbum), albumController.createAlbum);
router.patch('/:id', protect, validate(v.updateAlbum), albumController.updateAlbum);
router.patch('/:id/status', protect, validate(v.updateStatus), albumController.updateStatus);
router.patch('/:id/schedule', protect, validate(v.scheduleRelease), albumController.scheduleRelease);
router.delete('/:id/schedule', protect, validate(v.cancelSchedule), albumController.cancelSchedule);
router.get('/:id', protect, validate(v.getAlbum), albumController.getAlbum);
router.delete('/:id', protect, validate(v.deleteAlbum), albumController.deleteAlbum);

module.exports = router;

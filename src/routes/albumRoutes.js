'use strict';
const express = require('express');
const router = express.Router();
const albumController = require('../controllers/albumController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/', protect, albumController.createAlbum);
router.patch('/:id', protect, albumController.updateAlbum);
router.patch('/:id/status', protect, albumController.updateStatus);
router.get('/:id', protect, albumController.getAlbum);

module.exports = router;
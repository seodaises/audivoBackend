'use strict';
const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');
const artistProfileController = require('../controllers/artistProfileController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/songs', protect, catalogController.browseSongs);
router.get('/albums', protect, catalogController.browseAlbums);
router.get('/artists', protect, catalogController.browseArtists);
router.get('/search', protect, catalogController.search);
router.get('/artists/:username', protect, artistProfileController.getPublicProfile);

module.exports = router;
'use strict';
const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');
const trendingController = require('../controllers/TrendingController');
const artistProfileController = require('../controllers/artistProfileController');
const { protect } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const cv = require('../validators/catalogValidators');
const tv = require('../validators/trendingValidators');
const av = require('../validators/artistValidators');

router.get('/songs', protect, validate(cv.browseSongs), catalogController.browseSongs);
router.get('/albums', protect, validate(cv.browseAlbums), catalogController.browseAlbums);
router.get('/artists', protect, validate(cv.browseArtists), catalogController.browseArtists);
router.get('/search', protect, validate(cv.search), catalogController.search);
router.get('/trending/songs', protect, validate(tv.trendingSongs), trendingController.trendingSongs);
router.get('/trending/albums', protect, validate(tv.trendingAlbums), trendingController.trendingAlbums);
router.get('/trending/artists', protect, validate(tv.trendingArtists), trendingController.trendingArtists);

router.get('/artists/:username', protect, validate(av.getPublicProfile), artistProfileController.getPublicProfile);

module.exports = router;

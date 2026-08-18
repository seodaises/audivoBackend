'use strict';
const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { protect } = require('../middlewares/authMiddleware');
const { socialLimiter } = require('../middlewares/rateLimiters');
const validate = require('../middlewares/validate');
const v = require('../validators/socialValidators');

router.use(protect);

// ── Likes (songs) ────────────────────────────────────────────────────────────
router.get('/likes/songs', validate(v.listLikedSongs), socialController.listLikedSongs);
router.post('/likes/songs/:id', socialLimiter, validate(v.likeSong), socialController.likeSong);
router.delete('/likes/songs/:id', validate(v.unlikeSong), socialController.unlikeSong);

// ── Saves (songs + albums) ───────────────────────────────────────────────────
router.get('/saved/songs', validate(v.listSavedSongs), socialController.listSavedSongs);
router.post('/saved/songs/:id', socialLimiter, validate(v.saveSong), socialController.saveSong);
router.delete('/saved/songs/:id', validate(v.unsaveSong), socialController.unsaveSong);

router.get('/saved/albums', validate(v.listSavedAlbums), socialController.listSavedAlbums);
router.post('/saved/albums/:id', socialLimiter, validate(v.saveAlbum), socialController.saveAlbum);
router.delete('/saved/albums/:id', validate(v.unsaveAlbum), socialController.unsaveAlbum);

// ── Follows (artists) ────────────────────────────────────────────────────────
router.get('/following', validate(v.listFollowedArtists), socialController.listFollowedArtists);
router.post('/following/:id', socialLimiter, validate(v.followArtist), socialController.followArtist);
router.delete('/following/:id', validate(v.unfollowArtist), socialController.unfollowArtist);

// "Who follows ME" — the mirror of /following. Only meaningful for artists; the
// service returns 403 for a caller with no artist profile.
router.get('/followers', validate(v.listMyFollowers), socialController.listMyFollowers);

// ── Status ───────────────────────────────────────────────────────────────────
router.get('/status/song/:id', validate(v.getSongStatus), socialController.getSongStatus);
router.get('/status/album/:id', validate(v.getAlbumStatus), socialController.getAlbumStatus);
router.get('/status/artist/:id', validate(v.getArtistStatus), socialController.getArtistStatus);

// ── Listening history (Library reads) ────────────────────────────────────────
router.get('/history/recent', validate(v.listRecentlyPlayed), socialController.listRecentlyPlayed);
router.get('/history/most-played', validate(v.listMostPlayed), socialController.listMostPlayed);

// ── My comments (Library read) ───────────────────────────────────────────────
router.get('/comments', validate(v.listMyComments), socialController.listMyComments);

module.exports = router;

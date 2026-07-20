'use strict';
const express = require('express');
const router = express.Router();
const socialController = require('../controllers/socialController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);


// ── Likes (songs) ────────────────────────────────────────────────────────────
router.get('/likes/songs', socialController.listLikedSongs);
router.post('/likes/songs/:id', socialController.likeSong);
router.delete('/likes/songs/:id', socialController.unlikeSong);

// ── Saves (songs + albums) ───────────────────────────────────────────────────
router.get('/saved/songs', socialController.listSavedSongs);
router.post('/saved/songs/:id', socialController.saveSong);
router.delete('/saved/songs/:id', socialController.unsaveSong);

router.get('/saved/albums', socialController.listSavedAlbums);
router.post('/saved/albums/:id', socialController.saveAlbum);
router.delete('/saved/albums/:id', socialController.unsaveAlbum);

// ── Follows (artists) ────────────────────────────────────────────────────────
router.get('/following', socialController.listFollowedArtists);
router.post('/following/:id', socialController.followArtist);
router.delete('/following/:id', socialController.unfollowArtist);

// "Who follows ME" — the mirror of /following. Only meaningful for artists; the
// service returns 403 for a caller with no artist profile. Kept as a flat /me
// route (not nested under an artist id) because it's always about the caller.
router.get('/followers', socialController.listMyFollowers);

// ── Status ───────────────────────────────────────────────────────────────────
// "Is this liked/saved/followed by me?" — one call per entity, so a song page
// paints its buttons in a single round trip instead of three.
router.get('/status/song/:id', socialController.getSongStatus);
router.get('/status/album/:id', socialController.getAlbumStatus);
router.get('/status/artist/:id', socialController.getArtistStatus);

// ── Listening history (Library reads) ────────────────────────────────────────
// Personal, per-user reads from play_history. "Recently played" is distinct
// songs by latest listen; "most played" is the caller's OWN top songs by their
// personal play count (not the global play_count).
router.get('/history/recent', socialController.listRecentlyPlayed);
router.get('/history/most-played', socialController.listMostPlayed);

// ── My comments (Library read) ───────────────────────────────────────────────
// Every comment the caller has authored, across all songs, newest first.
router.get('/comments', socialController.listMyComments);

module.exports = router;
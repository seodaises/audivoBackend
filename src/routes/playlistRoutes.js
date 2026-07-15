'use strict';
const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.post('/', playlistController.createPlaylist);
router.get('/', playlistController.listMyPlaylists);

// MUST be declared before '/:id'. Express matches top-down, so if '/:id' came
// first it would swallow the literal '/public' as an id and blow up on
// toId('public'). Same lesson the comments router documents for '/hidden'.
router.get('/public', playlistController.listPublicPlaylists);

// Read is allowed if the playlist is yours OR public.
// Write is allowed only if it's yours. Public ≠ editable.
router.get('/:id', playlistController.getPlaylist);
router.patch('/:id', playlistController.updatePlaylist);
router.delete('/:id', playlistController.deletePlaylist);

// ── Tracks ───────────────────────────────────────────────────────────────────
// :trackId throughout is the playlist_songs row id, NOT the song id. A playlist
// may contain the same song more than once (a reprise, a DJ set), so the song id
// alone is ambiguous — it cannot tell you WHICH copy you meant.
router.post('/:id/tracks', playlistController.addTrack);
router.delete('/:id/tracks/:trackId', playlistController.removeTrack);
router.patch('/:id/tracks/:trackId/move', playlistController.moveTrack);

module.exports = router;
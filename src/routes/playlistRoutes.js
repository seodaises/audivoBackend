'use strict';
const express = require('express');
const router = express.Router();
const playlistController = require('../controllers/playlistController');
const { protect } = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validate');
const v = require('../validators/playlistValidators');

router.use(protect);

router.post('/', validate(v.createPlaylist), playlistController.createPlaylist);
router.get('/', validate(v.listMyPlaylists), playlistController.listMyPlaylists);

// MUST be declared before '/:id' (Express matches top-down).
router.get('/public', validate(v.listPublicPlaylists), playlistController.listPublicPlaylists);

router.get('/:id', validate(v.getPlaylist), playlistController.getPlaylist);
router.patch('/:id', validate(v.updatePlaylist), playlistController.updatePlaylist);
router.delete('/:id', validate(v.deletePlaylist), playlistController.deletePlaylist);

// ── Tracks ───────────────────────────────────────────────────────────────────
router.post('/:id/tracks', validate(v.addTrack), playlistController.addTrack);
router.delete('/:id/tracks/:trackId', validate(v.removeTrack), playlistController.removeTrack);
router.patch('/:id/tracks/:trackId/move', validate(v.moveTrack), playlistController.moveTrack);

module.exports = router;

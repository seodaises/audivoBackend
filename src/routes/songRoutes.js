'use strict';
const express = require('express');
const router = express.Router();
const songController = require('../controllers/songController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/requirePermission');
const { audioUpload } = require('../config/storage');
const commentController = require('../controllers/commentController');
const lyricsController = require('../controllers/lyricsController');
const { uploadLimiter } = require('../middlewares/rateLimiters');
const validate = require('../middlewares/validate');
const v = require('../validators/songValidators');
const cv = require('../validators/commentValidators');
const lv = require('../validators/lyricsValidators');

// POST /api/songs — multipart upload.
// Order matters: protect FIRST (reads only the cookie header — unauthenticated
// requests bounce before any bytes hit disk), THEN the rate limiter, THEN multer
// writes the file and populates req.body/req.file, and ONLY THEN can validate()
// inspect the (now-parsed) multipart body fields.
router.post(
  '/',
  protect,
  uploadLimiter,
  audioUpload.single('audio'),
  validate(v.uploadSong),
  songController.uploadSong
);

router.patch('/:id', protect, validate(v.updateSong), songController.updateSong);
router.patch('/:id/status', protect, validate(v.updateStatus), songController.updateStatus);
router.put('/:id/genres', protect, validate(v.setGenres), songController.setGenres);
router.get('/:id/file', protect, validate(v.serveFile), songController.serveSongFile);
router.delete('/:id', protect, validate(v.deleteSong), songController.deleteSong);
router.post('/:id/play', protect, validate(v.recordPlay), songController.recordPlay);
router.get('/:id/comments', protect, validate(cv.listForSong), commentController.listForSong);
router.post('/:id/comments', protect, validate(cv.createComment), commentController.createComment);
router.post('/:id/lyrics/generate', protect, requirePermission('generate_lyrics'), validate(lv.generateLyrics), lyricsController.generateLyrics);
router.patch('/:id/lyrics', protect, requirePermission('generate_lyrics'), validate(lv.updateLyrics), lyricsController.updateLyrics);
router.get('/:id/lyrics', protect, validate(lv.getLyrics), lyricsController.getLyrics);
router.get('/:id/lyrics/public', protect, validate(lv.getPublicLyrics), lyricsController.getPublicLyrics);

module.exports = router;
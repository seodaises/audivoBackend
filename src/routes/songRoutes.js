'use strict';
const express = require('express');
const router = express.Router();
const songController = require('../controllers/songController');
const { protect } = require('../middlewares/authMiddleware');
const { audioUpload } = require('../config/storage');
const commentController = require('../controllers/commentController');

// protect FIRST (reads only the cookie header — unauthenticated requests bounce before bytes hit disk), THEN multer writes the file + populates req.file.
router.post('/', protect, audioUpload.single('audio'), songController.uploadSong);

router.patch('/:id', protect, songController.updateSong);
router.patch('/:id/status', protect, songController.updateStatus);
router.put('/:id/genres', protect, songController.setGenres);
router.get('/:id/file', protect, songController.serveSongFile);
router.delete('/:id', protect, songController.deleteSong);
router.post('/:id/play', protect, songController.recordPlay);
router.get('/:id/comments', protect, commentController.listForSong);
router.post('/:id/comments', protect, commentController.createComment);
module.exports = router;
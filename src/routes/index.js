const express = require('express');
const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/contact', require('./contactRoutes'));
router.use('/artist', require('./artistRoutes'));
router.use('/albums', require('./albumRoutes'));
router.use('/songs', require('./songRoutes'));
router.use('/genres', require('./genreRoutes'));
router.use('/catalog', require('./catalogRoutes'));
router.use('/admin/catalog', require('./adminCatalogRoutes'));
router.use('/me', require('./socialRoutes'));
router.use('/playlists', require('./playlistRoutes'));
router.use('/comments', require('./commentRoutes'));

module.exports = router;
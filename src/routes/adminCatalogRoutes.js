'use strict';
const express = require('express');
const router = express.Router();
const adminCatalogController = require('../controllers/adminCatalogController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');

const ADMIN = 4;

router.get('/songs', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.listAllSongs);
router.get('/albums', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.listAllAlbums);
router.get('/artists', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.listAllArtists);
router.patch('/songs/:id/status', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.adminSetSongStatus);
router.patch('/albums/:id/status', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.adminSetAlbumStatus);
router.patch('/artists/:id/verify', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), adminCatalogController.adminVerifyArtist);

module.exports = router;
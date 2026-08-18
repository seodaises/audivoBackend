'use strict';
const express = require('express');
const router = express.Router();
const adminCatalogController = require('../controllers/adminCatalogController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');
const validate = require('../middlewares/validate');
const v = require('../validators/adminCatalogValidators');

const ADMIN = 4;
const gate = [protect, requireMinLevel(ADMIN), requirePermission('manage_catalog')];

router.get('/songs', ...gate, validate(v.listAllSongs), adminCatalogController.listAllSongs);
router.get('/albums', ...gate, validate(v.listAllAlbums), adminCatalogController.listAllAlbums);
router.get('/artists', ...gate, validate(v.listAllArtists), adminCatalogController.listAllArtists);
router.patch('/songs/:id/status', ...gate, validate(v.setSongStatus), adminCatalogController.adminSetSongStatus);
router.patch('/albums/:id/status', ...gate, validate(v.setAlbumStatus), adminCatalogController.adminSetAlbumStatus);
router.patch('/artists/:id/verify', ...gate, validate(v.verifyArtist), adminCatalogController.adminVerifyArtist);
router.delete('/songs/:id', ...gate, validate(v.deleteSong), adminCatalogController.adminDeleteSong);
router.delete('/albums/:id', ...gate, validate(v.deleteAlbum), adminCatalogController.adminDeleteAlbum);

module.exports = router;

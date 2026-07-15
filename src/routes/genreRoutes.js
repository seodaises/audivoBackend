'use strict';
const express = require('express');
const router = express.Router();
const genreController = require('../controllers/genreController');
const { protect } = require('../middlewares/authMiddleware');
const { requireMinLevel } = require('../middlewares/requireMinLevel');
const { requirePermission } = require('../middlewares/requirePermission');

const ADMIN = 4;

router.get('/', protect, genreController.listGenres);
router.post('/', protect, requireMinLevel(ADMIN), requirePermission('manage_catalog'), genreController.createGenre);

module.exports = router;
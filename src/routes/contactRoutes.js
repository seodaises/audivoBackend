'use strict';
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// POST /api/contact — public, no auth. Anti-spam (rate-limit/captcha) is a deliberate later task; basic field/length validation lives in the service.
router.post('/', contactController.submit);

module.exports = router;
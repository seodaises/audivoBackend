'use strict';
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const validate = require('../middlewares/validate');
const v = require('../validators/contactValidators');

// POST /api/contact — public, no auth. Anti-spam (rate-limit/captcha) is a
// deliberate later task; field/length validation now runs at the edge via Joi.
router.post('/', validate(v.submit), contactController.submit);

module.exports = router;

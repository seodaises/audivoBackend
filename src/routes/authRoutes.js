'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const noCache = require('../middlewares/noCache');
const { authLimiter, emailLimiter } = require('../middlewares/rateLimiters');
const { imageUploadLimiter } = require('../middlewares/rateLimiters');
const { avatarUpload } = require('../config/storage');
const validate = require('../middlewares/validate');
const v = require('../validators/authValidators');

// Auth responses are session-sensitive — never let the browser cache them
// (a stale cached /auth/me returns 304 and can log a valid user out on refresh).
router.use(noCache);

// POST /api/auth/register  — create account, sends verification email
router.post('/register', authLimiter, validate(v.register), authController.register);

// POST /api/auth/login     — exchange credentials for a JWT
router.post('/login', authLimiter, validate(v.login), authController.login);

// GET  /api/auth/verify-email?token=...  — consume token, mark email verified
router.get('/verify-email', validate(v.verifyEmail), authController.verifyEmail);

// POST /api/auth/resend-verification — re-send the verification email (always 200)
router.post('/resend-verification', emailLimiter, validate(v.resendVerification), authController.resendVerification);

// POST /api/auth/logout          — client discards token; server confirms
router.post('/logout', protect, authController.logout);

// POST /api/auth/change-password — logged-in user sets a new password
router.post('/change-password', protect, validate(v.changePassword), authController.changePassword);

// POST /api/auth/forgot-password — request a reset link
router.post('/forgot-password', emailLimiter, validate(v.forgotPassword), authController.forgotPassword);

// POST /api/auth/reset-password  — consume token, set new password
router.post('/reset-password', authLimiter, validate(v.resetPassword), authController.resetPassword);

// GET /api/auth/login-history — the current user's recent logins
router.get('/login-history', protect, authController.loginHistory);

// GET /api/auth/me  — current user's full profile (server-trusted)
router.get('/me', protect, authController.getMe);

// POST /api/auth/me/avatar 
router.post('/me/avatar', protect, imageUploadLimiter, avatarUpload.single('avatar'), authController.uploadAvatarImage);

// PUT /api/auth/me  — update current user's profile fields
router.put('/me', protect, validate(v.updateMe), authController.updateMe);

// PATCH /api/auth/me/username  — change the current user's handle (no rate limit)
router.patch('/me/username', protect, validate(v.changeUsername), authController.changeUsername);

// DELETE /api/auth/me  — current user deletes their own account (soft, no undo).
// Requires the account password in the body to confirm ownership.
router.delete('/me', protect, validate(v.deleteMe), authController.deleteMe);

module.exports = router;
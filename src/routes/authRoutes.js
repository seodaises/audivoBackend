'use strict';
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// POST /api/auth/register  — create account, sends verification email
router.post('/register', authController.register);

// POST /api/auth/login     — exchange credentials for a JWT
router.post('/login', authController.login);

// GET  /api/auth/verify-email?token=...  — consume token, mark email verified
router.get('/verify-email', authController.verifyEmail);

// POST /api/auth/resend-verification — re-send the verification email (always 200)
router.post('/resend-verification', authController.resendVerification);

// POST /api/auth/logout          — client discards token; server confirms
router.post('/logout', protect, authController.logout);

// POST /api/auth/change-password — logged-in user sets a new password
router.post('/change-password', protect, authController.changePassword);

// POST /api/auth/forgot-password — request a reset link
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password  — consume token, set new password
router.post('/reset-password', authController.resetPassword);

// GET /api/auth/login-history — the current user's recent logins
router.get('/login-history', protect, authController.loginHistory);

// GET /api/auth/me  — current user's full profile (server-trusted)
router.get('/me', protect, authController.getMe);

// PUT /api/auth/me  — update current user's profile fields
router.put('/me', protect, authController.updateMe);

// PATCH /api/auth/me/username  — change the current user's handle (no rate limit)
router.patch('/me/username', protect, authController.changeUsername);

// DELETE /api/auth/me  — current user deletes their own account (soft, no undo).
// Requires the account password in the body to confirm ownership.
router.delete('/me', protect, authController.deleteMe);

module.exports = router;
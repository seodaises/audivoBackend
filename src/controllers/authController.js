'use strict';
const authService = require('../services/authService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookie');
const ApiError = require('../utils/ApiError');

const register = catchAsync(async (req, res) => {
  const { email, password, displayName, username, role } = req.body;

  const result = await authService.register({ email, password, displayName, username, role });
  return success(res, 201, 'Registration successful. Check your email to verify your account.', result);
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const result = await authService.login({
    email,
    password,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  setAuthCookie(res, result.token);
  return success(res, 200, 'Login successful', { user: result.user });
});

const loginHistory = catchAsync(async (req, res) => {
  const result = await authService.getLoginHistory({ userId: req.user.id });
  return success(res, 200, 'Login history retrieved', result);
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.query;

  const result = await authService.verifyEmail(token);
  return success(res, 200, 'Email verified successfully', result);
});

const resendVerification = catchAsync(async (req, res) => {
  const { email } = req.body;

  await authService.resendVerification({ email });
  return success(res, 200, 'If that email needs verification, a new link has been sent', null);
});

const logout = catchAsync(async (req, res) => {
  clearAuthCookie(res);
  return success(res, 200, 'Logged out successfully', null);
});

const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const result = await authService.changePassword({
    userId: req.user.id,
    oldPassword,
    newPassword,
  });
  return success(res, 200, 'Password changed successfully', result);
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  const result = await authService.forgotPassword({ email });
  // Vague + always 200: never reveal whether the email exists.
  return success(res, 200, 'If that email is registered, a reset link has been sent', {
    devResetUrl: result.url, // null in production
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token, newPassword } = req.body;

  const result = await authService.resetPassword({ token, newPassword });
  return success(res, 200, 'Password reset successfully', result);
});

// --- profile (Phase 2) ---
const getMe = catchAsync(async (req, res) => {
  const result = await authService.getMe({ userId: req.user.id });
  return success(res, 200, 'Profile retrieved', result);
});

const updateMe = catchAsync(async (req, res) => {
  const result = await authService.updateMe({ userId: req.user.id, patch: req.body });
  return success(res, 200, 'Profile updated', result);
});

// POST /api/auth/me/avatar  — multipart image upload (field name "avatar").
const uploadAvatarImage = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'avatar image file is required');
  const result = authService.buildAvatarImageUrl(req.file);
  return success(res, 201, 'Avatar image uploaded', result);
});

// PATCH /api/auth/me/username — the logged-in user changes their handle.
const changeUsername = catchAsync(async (req, res) => {
  const { username } = req.body;

  const result = await authService.changeUsername({
    userId: req.user.id,
    newUsername: username,
  });
  return success(res, 200, 'Username updated', result);
});

const deleteMe = catchAsync(async (req, res) => {
  const { password } = req.body;
  const result = await authService.deleteMe({ userId: req.user.id, password });
  clearAuthCookie(res);
  return success(res, 200, 'Account deleted', result);
});

module.exports = {
  register,
  login,
  loginHistory,
  verifyEmail,
  resendVerification,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  uploadAvatarImage,
  changeUsername,
  deleteMe,
};
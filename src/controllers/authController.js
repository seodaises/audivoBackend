'use strict';
const authService = require('../services/authService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

const register = catchAsync(async (req, res) => {
  const { email, password, displayName, username, role } = req.body || {};
  if (!email || !password || !displayName || !username) {
    throw new ApiError(400, 'email, password, displayName, and username are required');
  }

  const result = await authService.register({ email, password, displayName, username, role });
  return success(res, 201, 'Registration successful. Check your email to verify your account.', result);
});

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'email and password are required');

  const result = await authService.login({
    email,
    password,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  return success(res, 200, 'Login successful', result);
});

const loginHistory = catchAsync(async (req, res) => {
  const result = await authService.getLoginHistory({ userId: req.user.id });
  return success(res, 200, 'Login history retrieved', result);
});

const verifyEmail = catchAsync(async (req, res) => {
  const { token } = req.query;
  if (!token) {
    throw new ApiError(400, 'token is required');
  }

  const result = await authService.verifyEmail(token);
  return success(res, 200, 'Email verified successfully', result);
});

const resendVerification = catchAsync(async (req, res) => {
  const { email } = req.body || {};
  if (!email) throw new ApiError(400, 'email is required');

  await authService.resendVerification({ email });
  // Vague + always 200: never reveal whether the email exists or is verified.
  return success(res, 200, 'If that email needs verification, a new link has been sent', null);
});

const logout = catchAsync(async (req, res) => {
  return success(res, 200, 'Logged out successfully', null);
});

const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    throw new ApiError(400, 'oldPassword and newPassword are required');
  }

  const result = await authService.changePassword({
    userId: req.user.id,
    oldPassword,
    newPassword,
  });
  return success(res, 200, 'Password changed successfully', result);
});

const forgotPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, 'email is required');

  const result = await authService.forgotPassword({ email });
  // Vague + always 200: never reveal whether the email exists.
  return success(res, 200, 'If that email is registered, a reset link has been sent', {
    devResetUrl: result.url, // null in production
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) throw new ApiError(400, 'token and newPassword are required');

  const result = await authService.resetPassword({ token, newPassword });
  return success(res, 200, 'Password reset successfully', result);
});

// --- profile (Phase 2) ---
const getMe = catchAsync(async (req, res) => {
  const result = await authService.getMe({ userId: req.user.id });
  return success(res, 200, 'Profile retrieved', result);
});

const updateMe = catchAsync(async (req, res) => {
  const result = await authService.updateMe({ userId: req.user.id, patch: req.body || {} });
  return success(res, 200, 'Profile updated', result);
});

// PATCH /api/auth/me/username — the logged-in user changes their handle.
const changeUsername = catchAsync(async (req, res) => {
  const { username } = req.body || {};
  if (!username) throw new ApiError(400, 'username is required');

  const result = await authService.changeUsername({
    userId: req.user.id,
    newUsername: username,
  });
  return success(res, 200, 'Username updated', result);
});

const deleteMe = catchAsync(async (req, res) => {
  const { password } = req.body || {};
  const result = await authService.deleteMe({ userId: req.user.id, password });
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
  changeUsername,
  deleteMe,
};
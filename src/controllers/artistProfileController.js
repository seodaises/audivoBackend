'use strict';
const artistProfileService = require('../services/artistProfileService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

// POST /api/artist/profile  — the logged-in user establishes their artist presence.
// Verified-artist gate + "one profile per user" rule live in the service.
const createMyProfile = catchAsync(async (req, res) => {
  const { stageName, bio, avatarUrl } = req.body || {};
  if (!stageName) throw new ApiError(400, 'stageName is required');

  const result = await artistProfileService.createProfile({
    actor: req.user,
    stageName,
    bio,
    avatarUrl,
  });
  return success(res, 201, 'Artist profile created', result);
});

// PATCH /api/artist/profile  — edit own profile fields.
const updateMyProfile = catchAsync(async (req, res) => {
  const { stageName, bio, avatarUrl } = req.body || {};
  const result = await artistProfileService.updateProfile({
    actor: req.user,
    stageName,
    bio,
    avatarUrl,
  });
  return success(res, 200, 'Artist profile updated', result);
});

// GET /api/artist/profile  — fetch own profile (includes drafts count etc.).
const getMyProfile = catchAsync(async (req, res) => {
  const result = await artistProfileService.getOwnProfile({ actor: req.user });
  return success(res, 200, 'Artist profile retrieved', result);
});

// GET /api/artists/:username  — public artist page: profile + PUBLISHED catalog only.
const getPublicProfile = catchAsync(async (req, res) => {
  const { username } = req.params;
  const result = await artistProfileService.getPublicProfile({ username });
  return success(res, 200, 'Artist profile retrieved', result);
});

module.exports = {
  createMyProfile,
  updateMyProfile,
  getMyProfile,
  getPublicProfile,
};
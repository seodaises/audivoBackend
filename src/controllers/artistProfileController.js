'use strict';
const artistProfileService = require('../services/artistProfileService');
const catchAsync = require('../utils/catchAsync');
const { success } = require('../utils/response');
const ApiError = require('../utils/ApiError');

// POST /api/artist/profile  — the logged-in user establishes their artist presence. Verified-artist gate + "one profile per user" rule live in the service.
const createMyProfile = catchAsync(async (req, res) => {
  const { stageName, bio, avatarUrl } = req.body;

  const result = await artistProfileService.createProfile({
    actor: req.user,
    stageName,
    bio,
    avatarUrl,
  });
  return success(res, 201, 'Artist profile created', result);
});

// POST /api/artist/profile/avatar  — multipart image upload (field name "avatar").
const uploadAvatarImage = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'avatar image file is required');
  const result = artistProfileService.buildAvatarImageUrl(req.file);
  return success(res, 201, 'Avatar image uploaded', result);
});

// PATCH /api/artist/profile  — edit own profile fields.
const updateMyProfile = catchAsync(async (req, res) => {
  const { stageName, bio, avatarUrl } = req.body;
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

// GET /api/artist/catalog  — the logged-in artist's OWN songs + albums, ALL statuses (the Library page). Returns an empty catalog (not an error) if the user isn't an artist yet.
const getMyCatalog = catchAsync(async (req, res) => {
  const result = await artistProfileService.getMyCatalog({ actor: req.user });
  return success(res, 200, 'Catalog retrieved', result);
});

// GET /api/artists/:username  — public artist page: profile + PUBLISHED catalog only.
const getPublicProfile = catchAsync(async (req, res) => {
  const { username } = req.params;
  const result = await artistProfileService.getPublicProfile({ username });
  return success(res, 200, 'Artist profile retrieved', result);
});

module.exports = {
  createMyProfile,
  uploadAvatarImage,
  updateMyProfile,
  getMyProfile,
  getMyCatalog,
  getPublicProfile,
};
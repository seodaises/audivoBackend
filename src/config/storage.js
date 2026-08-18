'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

const STORAGE_ROOT = path.join(__dirname, '..', '..', 'storage');
const AUDIO_DIR = path.join(STORAGE_ROOT, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const ALLOWED_AUDIO_MIME = new Set([
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4',
  'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-flac',
]);
const EXT_BY_MIME = {
  'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/ogg': '.ogg',
  'audio/flac': '.flac', 'audio/x-flac': '.flac',
};

const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, AUDIO_DIR); },
  filename(req, file, cb) {
    const ext = EXT_BY_MIME[file.mimetype] || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_AUDIO_MIME.has(file.mimetype)) {
    return cb(new ApiError(400, `Unsupported audio type: ${file.mimetype}`), false);
  }
  cb(null, true);
};
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB beta ceiling
const audioUpload = multer({ storage, fileFilter, limits: { fileSize: MAX_AUDIO_BYTES } });

const resolveAudioPath = (storageKey) => {
  const key = String(storageKey || '');
  if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) {
    throw new ApiError(400, 'Invalid storage key');
  }
  return path.join(AUDIO_DIR, key);
};
const deleteAudioFile = (storageKey) => {
  try { fs.unlinkSync(resolveAudioPath(storageKey)); }
  catch (err) {
    if (err.code !== 'ENOENT') console.error('Failed to delete orphaned audio file:', storageKey, err.message);
  }
};
const mimeForKey = (storageKey) => {
  const ext = path.extname(String(storageKey || '')).toLowerCase();
  const found = Object.entries(EXT_BY_MIME).find(([, e]) => e === ext);
  return found ? found[0] : 'application/octet-stream';
};

const IMAGES_ROOT = path.join(STORAGE_ROOT, 'images');
const COVER_DIR = path.join(IMAGES_ROOT, 'covers');
const AVATAR_DIR = path.join(IMAGES_ROOT, 'avatars');
fs.mkdirSync(COVER_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const makeImageStorage = (dir) =>
  multer.diskStorage({
    destination(req, file, cb) { cb(null, dir); },
    filename(req, file, cb) {
      const ext = IMAGE_EXT_BY_MIME[file.mimetype] || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

const imageFileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    return cb(new ApiError(400, `Unsupported image type: ${file.mimetype}. Use JPEG, PNG, or WebP.`), false);
  }
  cb(null, true);
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB 

const coverUpload = multer({ storage: makeImageStorage(COVER_DIR), fileFilter: imageFileFilter, limits: { fileSize: MAX_IMAGE_BYTES } });
const avatarUpload = multer({ storage: makeImageStorage(AVATAR_DIR), fileFilter: imageFileFilter, limits: { fileSize: MAX_IMAGE_BYTES } });

const IMAGE_STATIC_PREFIX = { covers: '/static/covers', avatars: '/static/avatars' };
const IMAGE_DIR_BY_KIND = { covers: COVER_DIR, avatars: AVATAR_DIR };

const apiBaseUrl = () =>
  process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

const publicImageUrl = (kind, filename) =>
  `${apiBaseUrl()}${IMAGE_STATIC_PREFIX[kind]}/${filename}`;

const resolveLocalImagePath = (url) => {
  const value = String(url || '');
  for (const kind of Object.keys(IMAGE_STATIC_PREFIX)) {
    const prefix = `${apiBaseUrl()}${IMAGE_STATIC_PREFIX[kind]}/`;
    if (value.startsWith(prefix)) {
      const filename = value.slice(prefix.length);
      if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
        return null;
      }
      return path.join(IMAGE_DIR_BY_KIND[kind], filename);
    }
  }
  return null;
};

const deleteImageFile = (url) => {
  const localPath = resolveLocalImagePath(url);
  if (!localPath) return; // nothing to clean up — wasn't ours to begin with
  try { fs.unlinkSync(localPath); }
  catch (err) {
    if (err.code !== 'ENOENT') console.error('Failed to delete orphaned image file:', url, err.message);
  }
};

module.exports = {
  audioUpload, resolveAudioPath, deleteAudioFile, mimeForKey, AUDIO_DIR, STORAGE_ROOT,
  coverUpload, avatarUpload, publicImageUrl, deleteImageFile, COVER_DIR, AVATAR_DIR,
};
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Kept at PROJECT ROOT (not src/) because uploaded files are DATA, not code. This is the single dir that swaps out for S3/GCS later — nothing in src/ changes on migration. Gitignored.
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

// storage_key = UUID + extension: collision-proof, injection-proof (no original
// filename touches disk), and the ext lets the serve endpoint set Content-Type.
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

// Map a stored key back to its absolute path. Guards path traversal.
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

module.exports = { audioUpload, resolveAudioPath, deleteAudioFile, mimeForKey, AUDIO_DIR, STORAGE_ROOT };
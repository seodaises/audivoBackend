const multer = require('multer');
const { error } = require('../utils/response');
const errorHandler = (err, req, res, next) => {

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message;
    return error(res, 400, message);
  }

  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    console.error('[500]', req.method, req.originalUrl, err);
  } else if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const message =
    statusCode >= 500
      ? 'Internal server error'
      : err.message || 'Request failed';

  const details = statusCode >= 500 ? null : err.details || null;

  return error(res, statusCode, message, details);
};

module.exports = errorHandler;
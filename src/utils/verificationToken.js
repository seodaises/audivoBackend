const crypto = require('crypto');

const generateVerificationToken = () => crypto.randomBytes(32).toString('hex');

const expiryFromNow = (hours = 24) =>
  new Date(Date.now() + hours * 60 * 60 * 1000);
const hashToken = (rawToken) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

module.exports = { generateVerificationToken, expiryFromNow, hashToken };
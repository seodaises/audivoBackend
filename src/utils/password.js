const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 10;

const hashPassword = async (plainPassword) => {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
};

const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};


const TEMP_PW_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';


const generateTempPassword = (length = 14) => {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PW_ALPHABET[crypto.randomInt(TEMP_PW_ALPHABET.length)];
  }
  return out;
};

module.exports = { hashPassword, comparePassword, generateTempPassword };
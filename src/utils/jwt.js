const jwt = require('jsonwebtoken');

// HS256 (symmetric — one secret both signs and verifies).
//
// Be ready to defend this against "why not RS256?", because it's a fair question
// with a real answer: RS256 is ASYMMETRIC, and asymmetric signing exists so a THIRD
// PARTY can verify a token without being able to mint one. That's the right tool
// when an auth server issues tokens for other services to consume. We have one
// server that both issues and verifies. There is no third party. RS256 would buy us
// nothing and cost us a keypair to manage — so HS256 is not a shortcut here, it's
// the correct fit for the topology.
const ALGORITHM = 'HS256';

const generateToken = (payload) => {
  if (!process.env.JWT_SECRET) {
    // Fail LOUDLY at the first sign of a missing secret. jwt.sign with an undefined
    // secret throws anyway, but with an obscure message; and a config mistake that
    // silently degrades authentication is the worst possible kind.
    throw new Error('JWT_SECRET is not set');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

// The `algorithms` ALLOWLIST is the point of this change.
//
// Without it, we hand the library a secret and let the TOKEN declare which algorithm
// to check it with — and the token is written by whoever is calling us. That's the
// wrong way round: the header of an unverified token is attacker-controlled input,
// and we were letting it choose the verification rule. This is the family of attacks
// that includes `alg: none` (verify nothing) and RS256→HS256 confusion (verify the
// signature using the PUBLIC key as the HMAC secret).
//
// Current jsonwebtoken versions defend against the worst of these on their own. The
// allowlist means we don't have to depend on that: WE decide the algorithm, the
// token doesn't get a vote.
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: [ALGORITHM],
  });
};

module.exports = { generateToken, verifyToken };
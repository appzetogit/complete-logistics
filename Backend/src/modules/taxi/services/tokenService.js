import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';

export const signAccessToken = ({ sub, role }) =>
  jwt.sign({ role }, env.jwtSecret, {
    subject: sub,
    expiresIn: env.jwtExpiresIn,
  });

// jsonwebtoken spends ~370us per verify -- over 100x the HMAC it actually
// computes -- and this runs on every authenticated request. A token's signature
// cannot change, so verifying the same string twice is wasted work.
//
// Only the signature check is cached. Expiry is re-checked on every hit, and
// authMiddleware still reads account status from the database per request, so
// deactivating an account takes effect immediately. Failures are never cached,
// so invalid tokens cannot push out real entries.
const VERIFIED_TOKEN_LIMIT = 5000;
const verifiedTokens = new Map();

const rememberVerifiedToken = (token, payload) => {
  if (verifiedTokens.size >= VERIFIED_TOKEN_LIMIT) {
    // Map iterates in insertion order, so this drops the oldest entry.
    verifiedTokens.delete(verifiedTokens.keys().next().value);
  }
  verifiedTokens.set(token, payload);
};

export const verifyAccessToken = (token) => {
  const cached = verifiedTokens.get(token);

  if (cached) {
    if (typeof cached.exp === 'number' && cached.exp * 1000 <= Date.now()) {
      verifiedTokens.delete(token);
      throw new ApiError(401, 'jwt expired');
    }

    return cached;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    rememberVerifiedToken(token, payload);
    return payload;
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      throw new ApiError(401, 'jwt expired');
    }

    if (error?.name === 'JsonWebTokenError' || error?.name === 'NotBeforeError') {
      throw new ApiError(401, 'Invalid authorization token');
    }

    throw error;
  }
};

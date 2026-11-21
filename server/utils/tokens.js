import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'northwind-bank';

// Access token: short-lived JWT, pinned to HS256, an issuer, and a realm audience.
export const signAccessToken = ({ userId, sessionId, audience }) =>
  jwt.sign({ sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: String(userId),
    audience,
    issuer: ISSUER,
    expiresIn: env.JWT_ACCESS_TTL,
  });

export const verifyAccessToken = (token, audience) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience, issuer: ISSUER });

// Refresh token: opaque random string. Only a keyed hash of it is stored in the database.
export const newRefreshToken = () => crypto.randomBytes(48).toString('hex');
export const hashToken = (token) => crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(`rt:${token}`).digest('hex');

// CSRF token: derived from the session id with a server secret, so it needs no storage and cannot be forged.
export const csrfTokenFor = (sessionId) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(`csrf:${sessionId}`).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

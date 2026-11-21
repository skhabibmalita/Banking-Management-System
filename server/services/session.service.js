import { Session } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { csrfTokenFor, hashToken, newRefreshToken, safeEqual, signAccessToken } from '../utils/tokens.js';
import { logAudit } from './audit.service.js';

const REUSE_GRACE_MS = 10_000; // two tabs refreshing at once is not an attack

async function createSession(realm, user, req) {
  const refreshToken = newRefreshToken();
  const refreshExpires = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  const session = await Session.create({
    userId: user._id,
    userModel: realm.modelName,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: refreshExpires,
    userAgent: req.get('user-agent')?.slice(0, 300),
    ip: req.ip,
  });
  const accessToken = signAccessToken({ userId: user._id, sessionId: session._id, audience: realm.audience });
  return { session, cookies: { accessToken, refreshToken, refreshExpires, sessionId: String(session._id) } };
}

export const startSession = createSession;

export const revokeAllSessions = (userId, userModel, exceptSessionId) =>
  Session.updateMany(
    { userId, userModel, revokedAt: null, ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}) },
    { revokedAt: new Date() }
  );

export async function revokeByRefreshToken(realm, refreshToken) {
  if (!refreshToken) return null;
  const session = await Session.findOneAndUpdate(
    { refreshTokenHash: hashToken(refreshToken), userModel: realm.modelName, revokedAt: null },
    { revokedAt: new Date() }
  );
  return session;
}

// Rotates the refresh token. Each refresh token works once; presenting an already-used one after the
// grace window means it was probably stolen, so every session of that user is revoked.
export async function rotateSession(realm, refreshToken, csrfHeader, req) {
  if (!refreshToken) throw ApiError.unauthorized('Please sign in again', { code: 'UNAUTHENTICATED' });

  const old = await Session.findOne({ refreshTokenHash: hashToken(refreshToken), userModel: realm.modelName });
  if (!old) throw ApiError.unauthorized('Please sign in again', { code: 'UNAUTHENTICATED' });

  if (!safeEqual(csrfHeader, csrfTokenFor(old._id))) throw ApiError.forbidden('Invalid CSRF token', { code: 'CSRF_INVALID' });

  if (old.revokedAt) {
    const justRotated = old.replacedBy && Date.now() - old.revokedAt.getTime() < REUSE_GRACE_MS;
    if (!justRotated) {
      await revokeAllSessions(old.userId, old.userModel);
      await logAudit({ req, actorId: old.userId, actorModel: realm.modelName, action: 'TOKEN_REUSE_DETECTED', entityType: 'Session', entityId: old._id });
    }
    throw ApiError.unauthorized('Please sign in again', { code: 'UNAUTHENTICATED' });
  }
  if (old.expiresAt <= new Date()) throw ApiError.unauthorized('Session expired. Please sign in again', { code: 'UNAUTHENTICATED' });

  const user = await realm.model.findById(old.userId);
  if (!user || !user.isActive) {
    await revokeAllSessions(old.userId, old.userModel);
    throw ApiError.unauthorized('Please sign in again', { code: 'UNAUTHENTICATED' });
  }

  // Atomic claim: only one concurrent request can rotate this token.
  const claimed = await Session.findOneAndUpdate({ _id: old._id, revokedAt: null }, { revokedAt: new Date() });
  if (!claimed) throw ApiError.unauthorized('Please sign in again', { code: 'UNAUTHENTICATED' });

  const next = await createSession(realm, user, req);
  await Session.updateOne({ _id: old._id }, { replacedBy: next.session._id });
  return { user, cookies: next.cookies };
}

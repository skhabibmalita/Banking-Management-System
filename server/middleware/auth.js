import mongoose from 'mongoose';
import asyncHandler from './asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { REALMS } from '../config/realms.js';
import { can } from '../config/rbac.js';
import { Session } from '../models/index.js';
import { csrfTokenFor, safeEqual, verifyAccessToken } from '../utils/tokens.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Authenticates from the HTTP-only access cookie. Every request re-checks that the session is still
// valid and the user is still active, so logout and account disabling take effect immediately.
// Sets req.user, plus req.customer or req.admin depending on the realm.
export const authenticate = (realmName) => {
  const realm = REALMS[realmName];
  return asyncHandler(async (req, res, next) => {
    const token = req.cookies?.[realm.cookies.access];
    if (!token) throw ApiError.unauthorized('Please sign in', { code: 'UNAUTHENTICATED' });

    let payload;
    try {
      payload = verifyAccessToken(token, realm.audience);
    } catch {
      throw ApiError.unauthorized('Session expired', { code: 'TOKEN_EXPIRED' });
    }
    if (!mongoose.isValidObjectId(payload.sid) || !mongoose.isValidObjectId(payload.sub)) {
      throw ApiError.unauthorized('Session expired', { code: 'TOKEN_EXPIRED' });
    }

    const session = await Session.exists({
      _id: payload.sid, userId: payload.sub, userModel: realm.modelName, revokedAt: null, expiresAt: { $gt: new Date() },
    });
    if (!session) throw ApiError.unauthorized('Session expired', { code: 'TOKEN_EXPIRED' });

    const user = await realm.model.findById(payload.sub);
    if (!user || !user.isActive) throw ApiError.unauthorized('Please sign in', { code: 'UNAUTHENTICATED' });

    if (UNSAFE.has(req.method) && !safeEqual(req.get('X-CSRF-Token'), csrfTokenFor(payload.sid))) {
      throw ApiError.forbidden('Invalid CSRF token', { code: 'CSRF_INVALID' });
    }

    req.auth = { realm: realmName, sessionId: payload.sid };
    req.user = user;
    req[realmName] = user;
    next();
  });
};

export const authenticateCustomer = authenticate('customer');
export const authenticateAdmin = authenticate('admin');

// Use after authenticateAdmin. The admin needs every listed permission.
export const requirePermission = (...permissions) => (req, res, next) => {
  if (!req.admin) return next(ApiError.unauthorized('Please sign in', { code: 'UNAUTHENTICATED' }));
  if (!permissions.every((p) => can(req.admin, p))) return next(ApiError.forbidden());
  next();
};

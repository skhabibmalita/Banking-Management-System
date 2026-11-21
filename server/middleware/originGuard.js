import { env } from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defence in depth against CSRF: a state-changing browser request from a foreign origin is refused.
// Requests without an Origin header (Postman, server-to-server) are not browsers and pass through.
export default function originGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('Origin');
  if (origin && !env.clientOrigins.includes(origin)) {
    return next(new ApiError(403, 'Origin not allowed', { code: 'ORIGIN_BLOCKED' }));
  }
  next();
}

import ApiError from '../utils/ApiError.js';

// Every money request must carry a client-generated Idempotency-Key header. Retrying with the same key
// can never move money twice: the server returns the original result instead.
export default function requireIdempotencyKey(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key) return next(ApiError.badRequest('Send an Idempotency-Key header', { code: 'IDEMPOTENCY_KEY_REQUIRED' }));
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    return next(ApiError.badRequest('Idempotency-Key must be 8 to 80 letters, numbers, dashes or underscores', { code: 'IDEMPOTENCY_KEY_INVALID' }));
  }
  req.idempotencyKey = key;
  next();
}

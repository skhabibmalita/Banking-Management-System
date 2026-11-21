import { ok } from '../utils/response.js';
import { dbState } from '../config/db.js';

// Liveness: the process is up. Always 200, and reports the database state.
export const health = (req, res) =>
  ok(res, {
    status: 'ok',
    database: dbState(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });

// Readiness: 200 only when MongoDB is connected. Use this for deploy checks.
export const ready = (req, res) => {
  if (dbState() === 'connected') return ok(res, { status: 'ready' });
  return res.status(503).json({ success: false, message: 'Database is not connected', code: 'NOT_READY', requestId: req.id });
};

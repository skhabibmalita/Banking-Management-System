import { AuditLog } from '../models/index.js';

// Best-effort logging for events outside money movement. A failure here must not break the request.
// (Phase 8 writes audit rows inside the financial DB transaction instead.)
export async function logAudit({ req, actorId, actorModel = 'System', action, entityType, entityId, meta }) {
  try {
    await AuditLog.create({
      actorId, actorModel, action, entityType,
      entityId: entityId ? String(entityId) : undefined,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 300),
      meta,
    });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

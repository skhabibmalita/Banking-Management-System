import mongoose from 'mongoose';
import { appendOnly } from './_shared.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: ObjectId, refPath: 'actorModel' },
    actorModel: { type: String, enum: ['Customer', 'Admin', 'System'], required: true },
    action: { type: String, required: true, trim: true, uppercase: true, maxlength: 60 }, // e.g. KYC_APPROVED
    entityType: { type: String, trim: true, maxlength: 40 },
    entityId: { type: String, trim: true, maxlength: 60 },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
    meta: { type: Mixed }, // small, non-sensitive context only. Never passwords, tokens or file contents.
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false, transform: (d, r) => { r.id = r._id; delete r._id; return r; } } }
);

appendOnly(auditLogSchema, 'Audit log');

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export default mongoose.model('AuditLog', auditLogSchema);

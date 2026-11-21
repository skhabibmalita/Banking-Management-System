import mongoose from 'mongoose';
import { Admin, AuditLog, Customer, KycDocument, Notification } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { resolveStoragePath } from '../utils/storage.js';
import { logAudit } from './audit.service.js';

export async function listKyc({ page, limit, status, docType }) {
  const filter = { status, ...(docType ? { docType } : {}) };
  // Oldest first for the pending queue, so nobody waits forever.
  const sort = status === 'pending' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 };
  const [rows, total] = await Promise.all([
    KycDocument.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    KycDocument.countDocuments(filter),
  ]);
  const [customers, reviewers] = await Promise.all([
    Customer.find({ _id: { $in: rows.map((d) => d.customerId) } }).select('name email kycStatus'),
    Admin.find({ _id: { $in: rows.map((d) => d.reviewedBy).filter(Boolean) } }).select('name'),
  ]);
  const cMap = new Map(customers.map((c) => [String(c._id), c]));
  const rMap = new Map(reviewers.map((a) => [String(a._id), a.name]));
  const items = rows.map((d) => {
    const c = cMap.get(String(d.customerId));
    return {
      id: d.id, docType: d.docType, fileName: d.originalName, mimeType: d.mimeType, size: d.size, status: d.status,
      submittedAt: d.createdAt, reviewedAt: d.reviewedAt, reviewedBy: d.reviewedBy ? rMap.get(String(d.reviewedBy)) : undefined,
      rejectReason: d.rejectReason,
      customer: c ? { id: c.id, name: c.name, email: c.email, kycStatus: c.kycStatus } : null,
    };
  });
  return { items, total };
}

// Approving or rejecting a document, the customer's KYC status, the notification and the audit row
// all commit together. A document can be reviewed once; a second attempt gets a 409.
export async function reviewKyc({ admin, docId, decision, reason, req }) {
  const approve = decision === 'approve';
  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      doc = await KycDocument.findOneAndUpdate(
        { _id: docId, status: 'pending' },
        { $set: { status: approve ? 'approved' : 'rejected', reviewedBy: admin._id, reviewedAt: new Date(), ...(reason ? { rejectReason: reason } : {}) } },
        { new: true, session }
      );
      if (!doc) {
        const exists = await KycDocument.exists({ _id: docId }).session(session);
        throw exists ? ApiError.conflict('This document was already reviewed', { code: 'ALREADY_REVIEWED' }) : ApiError.notFound('Document not found');
      }

      if (approve) {
        await Customer.updateOne({ _id: doc.customerId }, { $set: { kycStatus: 'verified' }, $unset: { kycRejectReason: 1 } }, { session });
      } else {
        // Only mark the customer rejected if nothing else is pending or approved.
        const stillOpen = await KycDocument.countDocuments({ customerId: doc.customerId, status: { $in: ['pending', 'approved'] } }).session(session);
        if (!stillOpen) await Customer.updateOne({ _id: doc.customerId }, { $set: { kycStatus: 'rejected', kycRejectReason: reason } }, { session });
      }

      await Notification.create([{
        customerId: doc.customerId,
        title: approve ? 'KYC verified' : 'KYC document rejected',
        message: approve ? 'Your identity is verified. All account features are unlocked.' : `Your document was rejected: ${reason}`,
        type: approve ? 'success' : 'error',
      }], { session });
      await AuditLog.create([{
        actorId: admin._id, actorModel: 'Admin', action: approve ? 'KYC_APPROVED' : 'KYC_REJECTED',
        entityType: 'KycDocument', entityId: String(doc._id), ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300),
        meta: { customerId: String(doc.customerId), docType: doc.docType, ...(reason ? { reason } : {}) },
      }], { session });
    });
    return doc;
  } finally {
    await session.endSession();
  }
}

// Reviewers need to see the actual document. It is only ever sent as a download, with the type the
// server detected at upload time, and every view is audited because it is personal data.
export async function getKycFile({ admin, docId, req }) {
  const doc = await KycDocument.findById(docId).select('+storagePath');
  if (!doc) throw ApiError.notFound('Document not found');
  await logAudit({ req, actorId: admin._id, actorModel: 'Admin', action: 'KYC_DOCUMENT_VIEWED', entityType: 'KycDocument', entityId: doc._id, meta: { customerId: String(doc.customerId) } });
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[doc.mimeType];
  return { path: resolveStoragePath(doc.storagePath), mimeType: doc.mimeType, downloadName: `kyc-${doc.docType}-${doc.id}.${ext}` };
}

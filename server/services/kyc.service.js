import { Customer, KycDocument, Notification } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import crypto from 'node:crypto';
import { cleanFileName, detectFileType } from '../utils/fileType.js';
import { deleteStoredFile, saveKycFile } from '../utils/storage.js';
import { logAudit } from './audit.service.js';

const MAX_PENDING = 3;

// What the API returns for a document. The storage path never leaves the server.
export const kycDocumentDTO = (d) => ({
  id: d.id,
  docType: d.docType,
  fileName: d.originalName,
  status: d.status,
  rejectReason: d.rejectReason,
  uploadedAt: d.createdAt,
  reviewedAt: d.reviewedAt,
});

export async function getKycStatus(customer) {
  const docs = await KycDocument.find({ customerId: customer._id }).sort({ createdAt: -1 });
  return {
    status: customer.kycStatus,
    rejectReason: customer.kycRejectReason,
    hasDocuments: docs.length > 0,
    documents: docs.map(kycDocumentDTO),
  };
}

export async function submitKycDocument({ customer, file, docType, req }) {
  if (!file) throw ApiError.badRequest('Attach a document to upload', { code: 'FILE_REQUIRED' });
  if (customer.kycStatus === 'verified') throw ApiError.conflict('Your identity is already verified', { code: 'ALREADY_VERIFIED' });

  const pending = await KycDocument.countDocuments({ customerId: customer._id, status: 'pending' });
  if (pending >= MAX_PENDING) {
    throw ApiError.conflict(`You already have ${MAX_PENDING} documents waiting for review`, { code: 'TOO_MANY_PENDING' });
  }

  const type = detectFileType(file.buffer);
  if (!type) throw ApiError.badRequest('Upload a real PDF, JPG or PNG file', { code: 'INVALID_FILE_TYPE' });

  const storagePath = await saveKycFile(customer._id, file.buffer, type.ext);
  let doc;
  try {
    doc = await KycDocument.create({
      customerId: customer._id,
      docType,
      originalName: cleanFileName(file.originalname),
      storagePath,
      mimeType: type.mime,
      size: file.size,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    });
  } catch (err) {
    await deleteStoredFile(storagePath).catch(() => {}); // never leave an orphan file behind
    throw err;
  }

  // A resubmission after rejection puts the customer back in the review queue.
  await Customer.updateOne({ _id: customer._id }, { $set: { kycStatus: 'pending' }, $unset: { kycRejectReason: 1 } });
  await Notification.create({
    customerId: customer._id,
    title: 'KYC documents received',
    message: 'Review usually takes 1 to 2 business days.',
    type: 'info',
  }).catch((e) => console.error('kyc notification failed:', e.message));
  await logAudit({ req, actorId: customer._id, actorModel: 'Customer', action: 'KYC_SUBMITTED', entityType: 'KycDocument', entityId: doc._id, meta: { docType } });

  return { document: kycDocumentDTO(doc), kycStatus: 'pending' };
}

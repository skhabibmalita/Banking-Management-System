import mongoose from 'mongoose';
import { schemaOptions } from './_shared.js';

export const KYC_DOC_TYPES = ['aadhaar', 'pan', 'passport', 'driving_licence'];

const { ObjectId } = mongoose.Schema.Types;

const kycDocumentSchema = new mongoose.Schema(
  {
    customerId: { type: ObjectId, ref: 'Customer', required: true, immutable: true },
    docType: { type: String, enum: KYC_DOC_TYPES, required: true },
    originalName: { type: String, required: true, trim: true, maxlength: 200 },
    // Private path on disk. Never returned by the API; files are served only through an authorised endpoint.
    storagePath: { type: String, required: true, select: false },
    mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
    size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },

    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    reviewedBy: { type: ObjectId, ref: 'Admin' },
    reviewedAt: Date,
    rejectReason: { type: String, trim: true, maxlength: 200 },
  },
  schemaOptions
);

kycDocumentSchema.index({ customerId: 1, createdAt: -1 });
kycDocumentSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('KycDocument', kycDocumentSchema);

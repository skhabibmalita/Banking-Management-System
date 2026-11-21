import mongoose from 'mongoose';
import { minorUnits, schemaOptions } from './_shared.js';

const { ObjectId } = mongoose.Schema.Types;

const accountSchema = new mongoose.Schema(
  {
    customerId: { type: ObjectId, ref: 'Customer', required: true, immutable: true },
    // 10 digits ending in a Luhn check digit. Generated server-side in Phase 7.
    accountNumber: { type: String, required: true, unique: true, immutable: true, match: [/^\d{10}$/, 'Account number must be 10 digits'] },
    accountType: { type: String, enum: ['savings', 'current', 'salary'], required: true, immutable: true },
    // Cached running balance in paise. The source of truth is LedgerEntry.
    balance: minorUnits({ default: 0 }),
    currency: { type: String, enum: ['INR'], default: 'INR', immutable: true },
    status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active' },

    statusReason: { type: String, trim: true, maxlength: 200 },
    statusChangedBy: { type: ObjectId, refPath: 'statusChangedByModel' },
    statusChangedByModel: { type: String, enum: ['Customer', 'Admin'] },
    closedAt: Date,
  },
  schemaOptions
);

accountSchema.index({ customerId: 1, status: 1 });
accountSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Account', accountSchema);

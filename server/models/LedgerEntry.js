import mongoose from 'mongoose';
import { appendOnly, minorUnits } from './_shared.js';

const { ObjectId } = mongoose.Schema.Types;

// Double-entry record. A deposit writes one credit, a withdrawal one debit, and a transfer
// writes a debit on the source plus a credit on the destination, in the same DB transaction.
const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: { type: ObjectId, ref: 'Transaction', required: true },
    accountId: { type: ObjectId, ref: 'Account', required: true },
    direction: { type: String, enum: ['debit', 'credit'], required: true },
    amount: minorUnits({ min: 1 }),
    balanceAfter: minorUnits({ min: 0 }),
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false, transform: (d, r) => { r.id = r._id; delete r._id; return r; } } }
);

appendOnly(ledgerEntrySchema, 'Ledger');

ledgerEntrySchema.index({ accountId: 1, createdAt: -1 });
ledgerEntrySchema.index({ transactionId: 1 });
// A transaction can touch an account in one direction only once.
ledgerEntrySchema.index({ transactionId: 1, accountId: 1, direction: 1 }, { unique: true });

export default mongoose.model('LedgerEntry', ledgerEntrySchema);

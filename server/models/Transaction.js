import mongoose from 'mongoose';
import { minorUnits, schemaOptions } from './_shared.js';

const { ObjectId } = mongoose.Schema.Types;

const transactionSchema = new mongoose.Schema(
  {
    // For deposits and withdrawals: the account affected. For transfers: the source account.
    accountId: { type: ObjectId, ref: 'Account', required: true, immutable: true },
    // Transfers only: the destination account.
    counterpartyAccountId: { type: ObjectId, ref: 'Account', immutable: true },
    type: { type: String, enum: ['deposit', 'withdrawal', 'transfer'], required: true, immutable: true },
    amount: minorUnits({ min: 1, immutable: true }),
    date: { type: Date, default: Date.now, immutable: true },
    description: { type: String, trim: true, maxlength: 140, default: '' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'reversed'], default: 'pending' },

    reference: { type: String, required: true, unique: true, immutable: true, match: [/^TXN[A-Z0-9]{10,24}$/, 'Invalid reference'] },
    initiatedBy: { type: ObjectId, ref: 'Customer', required: true, immutable: true },
    // Client-generated key. The same key from the same customer can only ever produce one transaction.
    idempotencyKey: { type: String, trim: true, minlength: 8, maxlength: 80, immutable: true },
    failureReason: { type: String, trim: true, maxlength: 200 },

    flagged: { type: Boolean, default: false },
    flagReasons: { type: [String], default: [] },
    // Set when an admin has looked at a flagged transaction.
    reviewedBy: { type: ObjectId, ref: 'Admin' },
    reviewedAt: Date,
    reviewNote: { type: String, trim: true, maxlength: 200 },
  },
  schemaOptions
);

transactionSchema.pre('validate', function (next) {
  if (this.type === 'transfer') {
    if (!this.counterpartyAccountId) {
      this.invalidate('counterpartyAccountId', 'Transfers need a destination account');
    } else if (this.accountId && this.counterpartyAccountId.equals(this.accountId)) {
      this.invalidate('counterpartyAccountId', 'Cannot transfer to the same account');
    }
  } else if (this.counterpartyAccountId) {
    this.invalidate('counterpartyAccountId', 'Only transfers have a destination account');
  }
  next();
});

transactionSchema.index({ accountId: 1, date: -1 });
transactionSchema.index({ counterpartyAccountId: 1, date: -1 }, { sparse: true });
transactionSchema.index({ initiatedBy: 1, date: -1 });
transactionSchema.index({ status: 1, date: -1 });
transactionSchema.index({ flagged: 1, reviewedAt: 1, date: -1 });
// Duplicate-processing guard. Partial so transactions without a key do not collide.
transactionSchema.index(
  { initiatedBy: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export default mongoose.model('Transaction', transactionSchema);

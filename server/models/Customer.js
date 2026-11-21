import mongoose from 'mongoose';
import { schemaOptions } from './_shared.js';

const EMAIL = /^\S+@\S+\.\S+$/;
const PHONE = /^\+?[0-9 ]{10,14}$/;

const eighteenYearsAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d;
};

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120, match: [EMAIL, 'Enter a valid email address'] },
    phone: { type: String, required: true, trim: true, match: [PHONE, 'Enter a 10 to 14 digit phone number'] },
    address: { type: String, required: true, trim: true, minlength: 8, maxlength: 200 },
    dob: {
      type: Date,
      required: true,
      validate: { validator: (d) => d <= eighteenYearsAgo(), message: 'Customer must be at least 18 years old' },
    },

    passwordHash: { type: String, required: true, select: false },

    kycStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
    kycRejectReason: { type: String, trim: true, maxlength: 200 },

    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: Date,
    lastLoginAt: Date,
    // Bumped inside the account-opening transaction so concurrent openings conflict and run one at a time.
    accountSeq: { type: Number, default: 0, select: false },
  },
  schemaOptions
);

customerSchema.index({ createdAt: -1 });

export default mongoose.model('Customer', customerSchema);

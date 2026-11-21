import mongoose from 'mongoose';
import { schemaOptions } from './_shared.js';
import { PERMISSIONS, ROLES } from '../config/rbac.js';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120, match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address'] },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    // Extra grants on top of the role's permissions.
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },

    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: Date,
    lastLoginAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  schemaOptions
);

export default mongoose.model('Admin', adminSchema);

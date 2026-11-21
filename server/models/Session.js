import mongoose from 'mongoose';
import { schemaOptions } from './_shared.js';

const { ObjectId } = mongoose.Schema.Types;

// One row per signed-in device. Only a hash of the refresh token is stored, so a database
// leak cannot be replayed. Rotation links old to new via replacedBy to detect token reuse.
const sessionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, required: true, refPath: 'userModel' },
    userModel: { type: String, enum: ['Customer', 'Admin'], required: true },
    refreshTokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
    revokedAt: Date,
    replacedBy: { type: ObjectId, ref: 'Session' },
  },
  schemaOptions
);

sessionSchema.index({ userId: 1, userModel: 1 });
// MongoDB deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Session', sessionSchema);

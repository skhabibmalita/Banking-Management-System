import mongoose from 'mongoose';
import { schemaOptions } from './_shared.js';

const notificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, required: true, trim: true, maxlength: 240 },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    read: { type: Boolean, default: false },
    readAt: Date,
  },
  schemaOptions
);

notificationSchema.index({ customerId: 1, read: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);

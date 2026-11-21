import multer from 'multer';
import { env } from '../config/env.js';

// Memory storage so the bytes can be inspected before anything touches the disk.
// Exactly one file in the "document" field, size-capped. Real type checking happens in the KYC service.
export const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5, fieldSize: 1024 },
}).single('document');

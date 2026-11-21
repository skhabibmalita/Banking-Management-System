import { z } from 'zod';
import { addressField, nameField, phoneField } from './auth.validators.js';
import { KYC_DOC_TYPES } from '../models/KycDocument.js';
import { pagination } from './common.js';

// Email and date of birth are deliberately not editable here. strict() rejects unknown keys loudly.
export const updateProfileSchema = z
  .object({ name: nameField, phone: phoneField, address: addressField })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update');

export const kycSubmitSchema = z.object({ docType: z.enum(KYC_DOC_TYPES, { errorMap: () => ({ message: 'Choose a valid document type' }) }) });

export const notificationListQuery = z.object({
  ...pagination,
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

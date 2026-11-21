import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../config/rbac.js';
import { emailField, nameField } from './auth.validators.js';
import { objectId, pagination } from './common.js';
import { fromParam, toParam } from './transaction.validators.js';

const flag = z.enum(['true', 'false']).transform((v) => v === 'true');
const q = z.string().trim().max(60).optional();
const reason = z.string().trim().max(200).optional();
const needsReason = { path: ['reason'], message: 'Give a reason of at least 5 characters' };
const hasReason = (r) => !!r && r.length >= 5;

export const customerListQuery = z.object({
  ...pagination,
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  active: flag.optional(),
  q,
});

export const adminAccountListQuery = z.object({
  ...pagination,
  status: z.enum(['active', 'frozen', 'closed']).optional(),
  accountType: z.enum(['savings', 'current', 'salary']).optional(),
  customerId: objectId.optional(),
  q,
});

export const freezeSchema = z.object({ frozen: z.boolean(), reason }).strict()
  .refine((v) => !v.frozen || hasReason(v.reason), needsReason);

export const adminStatusSchema = z.object({ status: z.enum(['active', 'frozen', 'closed']), reason }).strict()
  .refine((v) => v.status === 'active' || hasReason(v.reason), needsReason);

export const adminTransactionQuery = z.object({
  ...pagination,
  type: z.enum(['deposit', 'withdrawal', 'transfer']).optional(),
  status: z.enum(['pending', 'completed', 'failed', 'reversed']).optional(),
  flagged: flag.optional(),
  accountNumber: z.string().regex(/^\d{10}$/).optional(),
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
  from: fromParam.optional(),
  to: toParam.optional(),
  q,
});

export const kycListQuery = z.object({
  ...pagination,
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  docType: z.enum(['aadhaar', 'pan', 'passport', 'driving_licence']).optional(),
});

export const kycDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason }).strict()
  .refine((v) => v.decision === 'approve' || hasReason(v.reason), needsReason);

export const fraudListQuery = z.object({
  ...pagination,
  reviewed: flag.optional().transform((v) => v ?? false),
  severity: z.enum(['high', 'medium', 'low']).optional(),
});
export const fraudReviewSchema = z.object({ note: z.string().trim().max(200).optional() }).strict();

export const auditLogQuery = z.object({
  ...pagination,
  action: z.string().trim().toUpperCase().max(60).optional(),
  actorId: objectId.optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(60).optional(),
  from: fromParam.optional(),
  to: toParam.optional(),
  q,
});

export const createAdminSchema = z.object({ name: nameField, email: emailField, role: z.enum(ROLES) }).strict();
export const updateAdminSchema = z.object({
  name: nameField.optional(),
  role: z.enum(ROLES).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Send at least one field to update');

const DAY = 86_400_000;
export const reportParams = z.object({ type: z.enum(['transactions', 'customers', 'daily-summary']) });
export const reportQuery = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  from: fromParam.optional(),
  to: toParam.optional(),
}).transform((v) => {
  const to = v.to ?? new Date();
  return { ...v, to, from: v.from ?? new Date(to.getTime() - 30 * DAY) };
}).refine((v) => v.from <= v.to, { path: ['to'], message: '"to" must not be before "from"' })
  .refine((v) => v.to - v.from <= 366 * DAY, { path: ['to'], message: 'Reports can cover at most 366 days' });

import { z } from 'zod';
import { MAX_TXN_PAISE, MIN_TXN_PAISE } from '../config/policy.js';
import { isValidAccountNumber } from '../utils/accountNumber.js';
import { objectId, pagination } from './common.js';

// Amounts are whole numbers of paise. Decimals and numeric strings are rejected, never rounded.
const amount = z
  .number({ invalid_type_error: 'Amount must be a number of paise', required_error: 'Amount is required' })
  .int('Amount must be a whole number of paise')
  .min(MIN_TXN_PAISE, 'The minimum amount is Rs 1')
  .max(MAX_TXN_PAISE, 'The maximum amount per transaction is Rs 1,00,00,000');

const description = z.string().trim().max(140, 'Keep the note under 140 characters').optional();

export const depositSchema = z.object({ accountId: objectId, amount, description }).strict();
export const withdrawSchema = z.object({ accountId: objectId, amount, description }).strict();
export const transferSchema = z.object({
  fromAccountId: objectId,
  toAccountNumber: z.string().regex(/^\d{10}$/, 'Account numbers have 10 digits').refine(isValidAccountNumber, 'Check the recipient account number'),
  amount,
  description,
}).strict();

export const dateParam = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a valid date');

export const fromParam = dateParam.transform((s) => new Date(s));
// A bare date ("2026-11-07") means the whole day.
export const toParam = dateParam.transform((s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.999Z`) : new Date(s)));

export const historyQuery = z.object({
  ...pagination,
  accountId: objectId.optional(),
  type: z.enum(['deposit', 'withdrawal', 'transfer']).optional(),
  status: z.enum(['pending', 'completed', 'failed', 'reversed']).optional(),
  direction: z.enum(['credit', 'debit']).optional(),
  from: fromParam.optional(),
  to: toParam.optional(),
  q: z.string().trim().max(50).optional(),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: '"to" must not be before "from"' });

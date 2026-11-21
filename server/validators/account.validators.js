import { z } from 'zod';
import { pagination } from './common.js';

const types = ['savings', 'current', 'salary'];
const statuses = ['active', 'frozen', 'closed'];

// strict() makes mass-assignment attempts (for example sending a balance) fail loudly.
export const createAccountSchema = z.object({
  accountType: z.enum(types, { errorMap: () => ({ message: 'Choose savings, current or salary' }) }),
}).strict();

export const statusSchema = z.object({
  status: z.enum(statuses),
  reason: z.string().trim().max(200).optional(),
}).strict();

export const accountListQuery = z.object({ ...pagination, status: z.enum(statuses).optional() });

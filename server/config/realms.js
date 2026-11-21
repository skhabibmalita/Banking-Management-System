import { Customer, Admin } from '../models/index.js';

// Customers and admins are separate "realms": different collections, JWT audiences, cookie names
// and refresh paths. A customer token can never authenticate as an admin, and vice versa.
export const REALMS = {
  customer: {
    name: 'customer',
    model: Customer,
    modelName: 'Customer',
    audience: 'customer',
    cookies: { access: 'bank_at', refresh: 'bank_rt', csrf: 'bank_csrf' },
    refreshPath: '/api/auth',
  },
  admin: {
    name: 'admin',
    model: Admin,
    modelName: 'Admin',
    audience: 'admin',
    cookies: { access: 'bank_admin_at', refresh: 'bank_admin_rt', csrf: 'bank_admin_csrf' },
    refreshPath: '/api/admin/auth',
  },
};

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

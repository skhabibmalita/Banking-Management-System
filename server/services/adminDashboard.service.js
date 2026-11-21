import { Account, Customer, KycDocument, Transaction } from '../models/index.js';
import { can } from '../config/rbac.js';
import { listAuditLogs } from './adminList.service.js';

const MONTHS = 6;

// Each section appears only if the admin's role allows it; others come back as null.
// (A KYC officer sees the KYC queue size, not platform-wide money totals.)
export async function adminDashboard(admin) {
  const has = (p) => can(admin, p);
  const totals = { customers: null, accounts: null, deposits: null, withdrawals: null, volume: null, pendingKyc: null, alerts: null };
  const out = { totals, trend: null, byType: null, recent: null };
  const jobs = [];

  if (has('customers:read')) jobs.push(Customer.countDocuments().then((n) => { totals.customers = n; }));
  if (has('accounts:read')) jobs.push(Account.countDocuments({ status: { $ne: 'closed' } }).then((n) => { totals.accounts = n; }));
  if (has('kyc:review')) jobs.push(KycDocument.distinct('customerId', { status: 'pending' }).then((ids) => { totals.pendingKyc = ids.length; }));
  if (has('fraud:read')) jobs.push(Transaction.countDocuments({ flagged: true, reviewedAt: { $exists: false } }).then((n) => { totals.alerts = n; }));
  if (has('audit:read')) jobs.push(listAuditLogs({ page: 1, limit: 5 }).then((r) => { out.recent = r.items; }));
  if (has('transactions:read')) jobs.push(financials(out));

  await Promise.all(jobs);
  return out;
}

async function financials(out) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
  const [byType, monthly] = await Promise.all([
    Transaction.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Transaction.aggregate([
      { $match: { status: 'completed', type: { $in: ['deposit', 'withdrawal'] }, date: { $gte: start } } },
      { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' }, total: { $sum: '$amount' } } },
    ]),
  ]);
  const sum = (t) => byType.find((x) => x._id === t)?.total ?? 0;
  const volume = byType.reduce((s, x) => s + x.total, 0);
  Object.assign(out.totals, { deposits: sum('deposit'), withdrawals: sum('withdrawal'), volume });
  out.byType = [['Deposits', 'deposit'], ['Withdrawals', 'withdrawal'], ['Transfers', 'transfer']]
    .map(([name, t]) => ({ name, value: volume ? Math.round((sum(t) / volume) * 100) : 0 }));
  out.trend = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    const get = (type) => monthly.find((m) => m._id.m === key && m._id.type === type)?.total ?? 0;
    return { month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), deposits: get('deposit'), withdrawals: get('withdrawal') };
  });
}

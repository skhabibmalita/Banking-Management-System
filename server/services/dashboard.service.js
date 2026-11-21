import { Account, Transaction } from '../models/index.js';
import { accountDTO } from './account.service.js';
import { getHistory } from './transaction.service.js';

const MONTHS = 6;

// Everything the customer dashboard needs in one call.
export async function customerDashboard(customer) {
  const all = await Account.find({ customerId: customer._id }).sort({ createdAt: -1 });
  const open = all.filter((a) => a.status !== 'closed');
  const ids = all.map((a) => a._id);

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));
  const base = { accountId: { $in: ids }, status: 'completed', type: { $in: ['deposit', 'withdrawal'] } };

  const [sums, monthly, recent] = await Promise.all([
    Transaction.aggregate([{ $match: base }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Transaction.aggregate([
      { $match: { ...base, date: { $gte: start } } },
      { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' }, total: { $sum: '$amount' } } },
    ]),
    getHistory(customer, { page: 1, limit: 5 }),
  ]);

  const sum = (t) => sums.find((s) => s._id === t)?.total ?? 0;
  const trend = Array.from({ length: MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = d.toISOString().slice(0, 7);
    const get = (type) => monthly.find((m) => m._id.m === key && m._id.type === type)?.total ?? 0;
    return { month: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), deposits: get('deposit'), withdrawals: get('withdrawal') };
  });

  return {
    totals: {
      balance: open.reduce((s, a) => s + a.balance, 0),
      activeAccounts: all.filter((a) => a.status === 'active').length,
      deposits: sum('deposit'),
      withdrawals: sum('withdrawal'),
    },
    accounts: open.map(accountDTO),
    recent: recent.items,
    trend,
  };
}

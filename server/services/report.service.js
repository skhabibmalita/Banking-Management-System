import { Account, Customer, Transaction } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { rupees } from '../utils/csv.js';

const MAX_ROWS = 50_000;

export async function buildReport(type, { from, to }) {
  if (type === 'transactions') return transactionsReport(from, to);
  if (type === 'customers') return customersReport();
  return dailySummary(from, to);
}

async function transactionsReport(from, to) {
  const rows = await Transaction.find({ date: { $gte: from, $lte: to } }).sort({ date: -1 }).limit(MAX_ROWS + 1);
  if (rows.length > MAX_ROWS) throw new ApiError(422, `This report has more than ${MAX_ROWS} rows. Choose a shorter date range.`, { code: 'REPORT_TOO_LARGE' });
  const ids = [...new Set(rows.flatMap((t) => [t.accountId, t.counterpartyAccountId]).filter(Boolean).map(String))];
  const numbers = new Map((await Account.find({ _id: { $in: ids } }).select('accountNumber')).map((a) => [String(a._id), a.accountNumber]));
  return {
    columns: ['reference', 'date', 'type', 'status', 'amount_inr', 'account', 'counterparty', 'flagged', 'flag_reasons'],
    rows: rows.map((t) => ({
      reference: t.reference, date: t.date, type: t.type, status: t.status, amount_inr: rupees(t.amount),
      account: numbers.get(String(t.accountId)), counterparty: t.counterpartyAccountId ? numbers.get(String(t.counterpartyAccountId)) : '',
      flagged: t.flagged ? 'yes' : 'no', flag_reasons: t.flagReasons.join(' '),
    })),
  };
}

async function customersReport() {
  const rows = await Customer.find().sort({ createdAt: 1 }).limit(MAX_ROWS + 1);
  if (rows.length > MAX_ROWS) throw new ApiError(422, 'Too many customers for one report', { code: 'REPORT_TOO_LARGE' });
  const counts = await Account.aggregate([{ $match: { status: { $ne: 'closed' } } }, { $group: { _id: '$customerId', n: { $sum: 1 } } }]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
  return {
    columns: ['name', 'email', 'phone', 'kyc_status', 'active', 'open_accounts', 'joined'],
    rows: rows.map((c) => ({
      name: c.name, email: c.email, phone: c.phone, kyc_status: c.kycStatus, active: c.isActive ? 'yes' : 'no',
      open_accounts: countOf.get(c.id) ?? 0, joined: c.createdAt,
    })),
  };
}

async function dailySummary(from, to) {
  const agg = await Transaction.aggregate([
    { $match: { date: { $gte: from, $lte: to } } },
    { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, type: '$type', status: '$status' }, n: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]);
  const days = new Map();
  for (const { _id, n, total } of agg) {
    const d = days.get(_id.day) ?? { date: _id.day, deposits: 0, deposits_inr: 0, withdrawals: 0, withdrawals_inr: 0, transfers: 0, transfers_inr: 0, failed: 0 };
    if (_id.status === 'completed') {
      const key = { deposit: 'deposits', withdrawal: 'withdrawals', transfer: 'transfers' }[_id.type];
      d[key] += n;
      d[`${key}_inr`] += total;
    } else if (_id.status === 'failed') {
      d.failed += n;
    }
    days.set(_id.day, d);
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
    ...d, deposits_inr: rupees(d.deposits_inr), withdrawals_inr: rupees(d.withdrawals_inr), transfers_inr: rupees(d.transfers_inr),
  }));
  return { columns: ['date', 'deposits', 'deposits_inr', 'withdrawals', 'withdrawals_inr', 'transfers', 'transfers_inr', 'failed'], rows };
}

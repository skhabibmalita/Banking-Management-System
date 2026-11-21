import { Account, LedgerEntry, Transaction } from '../models/index.js';
import ApiError from '../utils/ApiError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A customer sees a transaction if their account is the source, or the destination of a COMPLETED
// transfer. Failed or pending transfers are never shown to the recipient.
const visibleTo = (ids) => ({ $or: [{ accountId: { $in: ids } }, { counterpartyAccountId: { $in: ids }, status: 'completed' }] });

// Loads account numbers for every account referenced, and which ones belong to the customer.
export async function loadContext(customerId, txns = []) {
  const mine = await Account.find({ customerId }).select('accountNumber');
  const numbers = new Map(mine.map((a) => [String(a._id), a.accountNumber]));
  const mineIds = new Set(numbers.keys());
  const others = new Set();
  for (const t of txns) {
    for (const id of [t.accountId, t.counterpartyAccountId]) if (id && !mineIds.has(String(id))) others.add(String(id));
  }
  if (others.size) {
    (await Account.find({ _id: { $in: [...others] } }).select('accountNumber')).forEach((a) => numbers.set(String(a._id), a.accountNumber));
  }
  return { mineIds, numbers };
}

// The transaction as one customer sees it. Credit or debit depends on whose account it touches.
// Other people's account numbers are masked to the last 4 digits and no names are ever shown.
export function transactionDTO(t, { mineIds, numbers }) {
  const sourceMine = mineIds.has(String(t.accountId));
  const direction = sourceMine ? (t.type === 'deposit' ? 'credit' : 'debit') : 'credit';
  const myAccountId = !sourceMine && t.type === 'transfer' ? t.counterpartyAccountId : t.accountId;
  const otherId = t.type === 'transfer' ? (sourceMine ? t.counterpartyAccountId : t.accountId) : null;
  return {
    id: t.id,
    reference: t.reference,
    type: t.type,
    direction,
    amount: t.amount,
    description: t.description,
    status: t.status,
    date: t.date,
    accountId: String(myAccountId),
    counterparty: otherId ? { last4: numbers.get(String(otherId))?.slice(-4) } : undefined,
    failureReason: t.status === 'failed' && sourceMine ? t.failureReason : undefined,
  };
}

export async function getHistory(customer, { page, limit, accountId, type, status, direction, from, to, q }) {
  const { mineIds } = await loadContext(customer._id);
  const ids = [...mineIds];
  if (accountId && !mineIds.has(String(accountId))) throw ApiError.notFound('Account not found');

  const conds = [visibleTo(ids)];
  if (accountId) conds.push({ $or: [{ accountId }, { counterpartyAccountId: accountId, status: 'completed' }] });
  if (type) conds.push({ type });
  if (status) conds.push({ status });
  if (direction === 'debit') conds.push({ accountId: { $in: ids }, type: { $in: ['withdrawal', 'transfer'] } });
  if (direction === 'credit') {
    conds.push({ $or: [
      { type: 'deposit', accountId: { $in: ids } },
      { type: 'transfer', counterpartyAccountId: { $in: ids }, accountId: { $nin: ids }, status: 'completed' },
    ] });
  }
  if (from || to) conds.push({ date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i'); // escaped, so user input can never act as a pattern
    conds.push({ $or: [{ reference: rx }, { description: rx }] });
  }
  const filter = { $and: conds };

  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  const ctx = await loadContext(customer._id, rows);
  return { items: rows.map((t) => transactionDTO(t, ctx)), total };
}

export async function findVisibleTransaction(customer, id) {
  const { mineIds } = await loadContext(customer._id);
  const txn = await Transaction.findOne({ $and: [{ _id: id }, visibleTo([...mineIds])] });
  if (!txn) throw ApiError.notFound('Transaction not found');
  return { txn, mineIds };
}

export async function getTransactionDetail(customer, id) {
  const { txn, mineIds } = await findVisibleTransaction(customer, id);
  const ctx = await loadContext(customer._id, [txn]);
  const ledger = await LedgerEntry.find({ transactionId: txn._id, accountId: { $in: [...mineIds] } }).sort({ createdAt: 1 });
  return {
    transaction: transactionDTO(txn, ctx),
    ledger: ledger.map((l) => ({ accountId: String(l.accountId), direction: l.direction, amount: l.amount, balanceAfter: l.balanceAfter })),
  };
}

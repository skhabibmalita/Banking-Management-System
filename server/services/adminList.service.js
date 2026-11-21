import { Account, Admin, AuditLog, Customer, Transaction } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { describeReasons, severityOf } from './fraud.service.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rx = (q) => new RegExp(escapeRegex(q), 'i'); // user text is always escaped before it becomes a pattern
const paging = ({ page, limit }) => ({ skip: (page - 1) * limit, limit });
const idMap = (docs, pick) => new Map(docs.map((d) => [String(d._id), pick(d)]));

const ownerInfo = async (customerIds) =>
  idMap(await Customer.find({ _id: { $in: customerIds } }).select('name email'), (c) => ({ id: c.id, name: c.name, email: c.email }));

export async function listCustomers(query) {
  const { page, limit, kycStatus, active, q } = query;
  const filter = { ...(kycStatus ? { kycStatus } : {}), ...(active !== undefined ? { isActive: active } : {}) };
  if (q) filter.$or = [{ name: rx(q) }, { email: rx(q) }, { phone: rx(q) }];

  const [rows, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging(query).skip).limit(limit),
    Customer.countDocuments(filter),
  ]);
  const counts = await Account.aggregate([
    { $match: { customerId: { $in: rows.map((r) => r._id) }, status: { $ne: 'closed' } } },
    { $group: { _id: '$customerId', n: { $sum: 1 } } },
  ]);
  const countOf = idMap(counts, (c) => c.n);
  // Address and date of birth are deliberately not in the list view.
  const items = rows.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, kycStatus: c.kycStatus,
    isActive: c.isActive, accounts: countOf.get(c.id) ?? 0, joined: c.createdAt, lastLoginAt: c.lastLoginAt,
  }));
  return { items, total };
}

export async function listAccounts(query) {
  const { limit, status, accountType, customerId, q } = query;
  const filter = { ...(status ? { status } : {}), ...(accountType ? { accountType } : {}), ...(customerId ? { customerId } : {}) };
  if (q) {
    if (/^\d+$/.test(q)) {
      filter.accountNumber = new RegExp(`^${escapeRegex(q)}`);
    } else {
      const owners = await Customer.find({ $or: [{ name: rx(q) }, { email: rx(q) }] }).select('_id');
      filter.customerId = customerId ? { $in: owners.map((o) => o._id).filter((id) => String(id) === customerId) } : { $in: owners.map((o) => o._id) };
    }
  }
  const [rows, total] = await Promise.all([
    Account.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging(query).skip).limit(limit),
    Account.countDocuments(filter),
  ]);
  const owners = await ownerInfo(rows.map((a) => a.customerId));
  const items = rows.map((a) => ({
    id: a.id, accountNumber: a.accountNumber, accountType: a.accountType, balance: a.balance, status: a.status,
    statusReason: a.statusReason, owner: owners.get(String(a.customerId)), createdAt: a.createdAt, closedAt: a.closedAt,
  }));
  return { items, total };
}

export async function getAccountForAdmin(id) {
  const account = await Account.findById(id);
  if (!account) throw ApiError.notFound('Account not found');
  return account;
}

async function accountNumbers(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  return idMap(await Account.find({ _id: { $in: unique } }).select('accountNumber'), (a) => a.accountNumber);
}

const txnDTO = (t, numbers, owners) => ({
  id: t.id, reference: t.reference, type: t.type, amount: t.amount, status: t.status, description: t.description,
  account: numbers.get(String(t.accountId)),
  counterparty: t.counterpartyAccountId ? numbers.get(String(t.counterpartyAccountId)) : undefined,
  customer: owners.get(String(t.initiatedBy)),
  flagged: t.flagged, flagReasons: t.flagReasons, failureReason: t.failureReason, date: t.date,
});

export async function listTransactions(query) {
  const { limit, type, status, flagged, accountNumber, minAmount, maxAmount, from, to, q } = query;
  const conds = [];
  if (type) conds.push({ type });
  if (status) conds.push({ status });
  if (flagged !== undefined) conds.push({ flagged });
  if (minAmount !== undefined || maxAmount !== undefined) {
    conds.push({ amount: { ...(minAmount !== undefined ? { $gte: minAmount } : {}), ...(maxAmount !== undefined ? { $lte: maxAmount } : {}) } });
  }
  if (from || to) conds.push({ date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (q) conds.push({ $or: [{ reference: rx(q) }, { description: rx(q) }] });
  if (accountNumber) {
    const acct = await Account.findOne({ accountNumber }).select('_id');
    conds.push(acct ? { $or: [{ accountId: acct._id }, { counterpartyAccountId: acct._id }] } : { _id: null });
  }
  const filter = conds.length ? { $and: conds } : {};

  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ date: -1, _id: -1 }).skip(paging(query).skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  const [numbers, owners] = await Promise.all([
    accountNumbers(rows.flatMap((t) => [t.accountId, t.counterpartyAccountId])),
    ownerInfo(rows.map((t) => t.initiatedBy)),
  ]);
  return { items: rows.map((t) => txnDTO(t, numbers, owners)), total };
}

export async function listFraud(query) {
  const { limit, reviewed, severity } = query;
  const filter = { flagged: true, reviewedAt: reviewed ? { $exists: true } : { $exists: false } };
  // Severity is derived from reasons, so filter after loading a generous window and page in memory.
  const all = await Transaction.find(filter).sort({ date: -1, _id: -1 }).limit(1000);
  const withSeverity = all.map((t) => ({ t, severity: severityOf(t.flagReasons) })).filter((x) => !severity || x.severity === severity);
  const pageRows = withSeverity.slice(paging(query).skip, paging(query).skip + limit);

  const [numbers, owners] = await Promise.all([
    accountNumbers(pageRows.flatMap(({ t }) => [t.accountId, t.counterpartyAccountId])),
    ownerInfo(pageRows.map(({ t }) => t.initiatedBy)),
  ]);
  const reviewers = idMap(await Admin.find({ _id: { $in: pageRows.map(({ t }) => t.reviewedBy).filter(Boolean) } }).select('name'), (a) => a.name);
  const items = pageRows.map(({ t, severity: sev }) => ({
    ...txnDTO(t, numbers, owners),
    severity: sev,
    reasons: describeReasons(t.flagReasons),
    reviewed: !!t.reviewedAt,
    reviewedAt: t.reviewedAt,
    reviewedBy: t.reviewedBy ? reviewers.get(String(t.reviewedBy)) : undefined,
    reviewNote: t.reviewNote,
  }));
  return { items, total: withSeverity.length };
}

export async function reviewFraud({ admin, id, note }) {
  const updated = await Transaction.findOneAndUpdate(
    { _id: id, flagged: true, reviewedAt: { $exists: false } },
    { $set: { reviewedBy: admin._id, reviewedAt: new Date(), ...(note ? { reviewNote: note } : {}) } },
    { new: true }
  );
  if (updated) return updated;
  const exists = await Transaction.findOne({ _id: id, flagged: true }).select('_id');
  throw exists ? ApiError.conflict('This alert was already reviewed', { code: 'ALREADY_REVIEWED' }) : ApiError.notFound('Flagged transaction not found');
}

export async function listAuditLogs(query) {
  const { limit, action, actorId, entityType, entityId, from, to, q } = query;
  const conds = [];
  if (action) conds.push({ action });
  if (actorId) conds.push({ actorId });
  if (entityType) conds.push({ entityType });
  if (entityId) conds.push({ entityId });
  if (from || to) conds.push({ createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (q) conds.push({ $or: [{ action: rx(q) }, { entityId: rx(q) }, { ip: rx(q) }] });
  const filter = conds.length ? { $and: conds } : {};

  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging(query).skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);
  const ids = (model) => rows.filter((r) => r.actorModel === model && r.actorId).map((r) => r.actorId);
  const [cs, ads] = await Promise.all([
    Customer.find({ _id: { $in: ids('Customer') } }).select('name'),
    Admin.find({ _id: { $in: ids('Admin') } }).select('name'),
  ]);
  const names = new Map([...cs, ...ads].map((d) => [String(d._id), d.name]));
  const items = rows.map((l) => ({
    id: l.id,
    actor: { id: l.actorId ? String(l.actorId) : null, type: l.actorModel, name: l.actorId ? names.get(String(l.actorId)) ?? 'Deleted user' : 'System' },
    action: l.action, entityType: l.entityType, entityId: l.entityId, ip: l.ip, meta: l.meta, at: l.createdAt,
  }));
  return { items, total };
}

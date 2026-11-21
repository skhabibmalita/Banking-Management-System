import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Account, AuditLog, LedgerEntry, Notification, Transaction } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { formatINR, maskAccount } from '../utils/money.js';
import {
  DEPOSIT_THEN_WITHDRAW_WINDOW_MS, KYC_REQUIRED_FOR_MONEY, RAPID_TRANSFER_WINDOW_MS, REPEATED_FAILURE_WINDOW_MS,
} from '../config/policy.js';
import { evaluateRules } from './fraud.service.js';

// The only place where balances change. Every deposit, withdrawal and transfer runs as ONE MongoDB
// transaction that (1) moves the balance with a guarded update, (2) writes the Transaction record,
// (3) writes the double-entry ledger rows and (4) writes the audit row. If any step fails, all of
// it is rolled back, so a transfer can never update only one side.

const newReference = () => `TXN${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
const RECIPIENT_MSG = 'Recipient account not found or unavailable';
const LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', transfer: 'Transfer' };

// Business failures worth keeping a "failed" record for (visible in the customer's history).
const failure = (status, message, code, details) =>
  Object.assign(new ApiError(status, message, { code, details }), { recordFailure: true });

function diagnose(account, amount) {
  if (!account) return ApiError.notFound('Account not found');
  if (account.status === 'frozen') return failure(403, 'This account is frozen. Contact support.', 'ACCOUNT_FROZEN');
  if (account.status === 'closed') return failure(409, 'This account is closed', 'ACCOUNT_CLOSED');
  if (account.balance < amount) return failure(422, 'Insufficient balance', 'INSUFFICIENT_FUNDS', { available: account.balance });
  return ApiError.conflict('The account changed while processing. Please try again.', { code: 'STATE_CHANGED' });
}

const defaultDescription = (type, dest) =>
  type === 'transfer' ? `Transfer to ${maskAccount(dest.accountNumber)}` : LABEL[type];

async function applyInTransaction(session, { customer, type, accountId, dest, amount, description, idempotencyKey, req }) {
  const source = await Account.findOne({ _id: accountId, customerId: customer._id }).session(session);
  if (!source) throw ApiError.notFound('Account not found'); // not mine, or does not exist: same answer

  const now = Date.now();

  // 1. Guarded balance changes. The filter makes each check-and-change a single atomic step.
  let sourceAfter;
  let destAfter;
  if (type === 'deposit') {
    sourceAfter = await Account.findOneAndUpdate({ _id: source._id, status: 'active' }, { $inc: { balance: amount } }, { new: true, session });
    if (!sourceAfter) throw diagnose(await Account.findById(source._id).session(session), 0);
  } else {
    sourceAfter = await Account.findOneAndUpdate(
      { _id: source._id, status: 'active', balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session }
    );
    if (!sourceAfter) throw diagnose(await Account.findById(source._id).session(session), amount);
    if (type === 'transfer') {
      destAfter = await Account.findOneAndUpdate({ _id: dest._id, status: 'active' }, { $inc: { balance: amount } }, { new: true, session });
      if (!destAfter) throw failure(422, RECIPIENT_MSG, 'RECIPIENT_UNAVAILABLE'); // rolls the debit back too
    }
  }

  // 2. Fraud inputs, read inside the same transaction.
  const priorTransfersInWindow = type === 'transfer'
    ? await Transaction.countDocuments({ initiatedBy: customer._id, type: 'transfer', status: 'completed', date: { $gte: new Date(now - RAPID_TRANSFER_WINDOW_MS) } }).session(session)
    : 0;
  let recentDepositTotal = 0;
  if (type !== 'deposit') {
    const [row] = await Transaction.aggregate([
      { $match: { accountId: source._id, type: 'deposit', status: 'completed', date: { $gte: new Date(now - DEPOSIT_THEN_WITHDRAW_WINDOW_MS) } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session);
    recentDepositTotal = row?.total ?? 0;
  }
  const flagReasons = evaluateRules({ type, amount, priorTransfersInWindow, recentDepositTotal });

  // 3. The transaction record.
  const [txn] = await Transaction.create([{
    accountId: source._id,
    counterpartyAccountId: dest?._id,
    type,
    amount,
    description: description || defaultDescription(type, dest),
    status: 'completed',
    reference: newReference(),
    initiatedBy: customer._id,
    idempotencyKey,
    flagged: flagReasons.length > 0,
    flagReasons,
  }], { session });

  // 4. Double-entry ledger: money in is a credit, money out is a debit. A transfer has both.
  const entry = (acct, direction) => ({ transactionId: txn._id, accountId: acct._id, direction, amount, balanceAfter: acct.balance });
  const entries = type === 'deposit' ? [entry(sourceAfter, 'credit')]
    : type === 'withdrawal' ? [entry(sourceAfter, 'debit')]
    : [entry(sourceAfter, 'debit'), entry(destAfter, 'credit')];
  await LedgerEntry.create(entries, { session, ordered: true });

  // 5. Audit row, inside the same transaction so it exists if and only if the money moved.
  await AuditLog.create([{
    actorId: customer._id, actorModel: 'Customer', action: `${type.toUpperCase()}_COMPLETED`,
    entityType: 'Transaction', entityId: String(txn._id), ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 300), meta: { type, amount, flagged: flagReasons.length > 0 },
  }], { session });

  return { txn, sourceAfter, destAfter };
}

const sameRequest = async (existing, { type, accountId, amount, toAccountNumber }) => {
  if (existing.type !== type || existing.amount !== amount || String(existing.accountId) !== String(accountId)) return false;
  if (type !== 'transfer') return true;
  const dest = await Account.findById(existing.counterpartyAccountId).select('accountNumber');
  return dest?.accountNumber === toAccountNumber;
};

async function replay(existing, params) {
  if (!(await sameRequest(existing, params))) {
    throw new ApiError(422, 'This Idempotency-Key was already used for a different request', { code: 'IDEMPOTENCY_MISMATCH' });
  }
  const account = await Account.findById(existing.accountId).select('balance');
  return { transaction: existing, balance: account.balance, replay: true };
}

async function recordFailedAttempt({ customer, type, accountId, dest, amount, description, err }) {
  try {
    const priorFailuresInWindow = await Transaction.countDocuments({
      initiatedBy: customer._id, status: 'failed', date: { $gte: new Date(Date.now() - REPEATED_FAILURE_WINDOW_MS) },
    });
    const flagReasons = evaluateRules({ type, amount, failed: true, priorFailuresInWindow });
    // No idempotency key is stored: a failed attempt must never block a legitimate retry.
    await Transaction.create({
      accountId, counterpartyAccountId: dest?._id, type, amount,
      description: description || defaultDescription(type, dest), status: 'failed', failureReason: err.message,
      reference: newReference(), initiatedBy: customer._id, flagged: flagReasons.length > 0, flagReasons,
    });
    await Notification.create({
      customerId: customer._id, title: `${LABEL[type]} failed`, type: 'error',
      message: `Your ${formatINR(amount)} ${type} could not be completed. Your balance was not changed.`,
    });
  } catch (e) {
    console.error('failed-attempt record error:', e.message);
  }
}

export async function executeMoney({ customer, type, accountId, toAccountNumber, amount, description, idempotencyKey, req }) {
  const params = { type, accountId, amount, toAccountNumber };

  // Replays are answered first, so a retry always gets the original outcome.
  const existing = await Transaction.findOne({ initiatedBy: customer._id, idempotencyKey });
  if (existing) return replay(existing, params);

  if (KYC_REQUIRED_FOR_MONEY && customer.kycStatus !== 'verified') {
    throw ApiError.forbidden('Complete KYC verification before moving money', { code: 'KYC_REQUIRED' });
  }

  let dest = null;
  if (type === 'transfer') {
    dest = await Account.findOne({ accountNumber: toAccountNumber });
    if (!dest) throw new ApiError(422, RECIPIENT_MSG, { code: 'RECIPIENT_UNAVAILABLE' });
    if (String(dest._id) === String(accountId)) throw ApiError.badRequest('Choose a different account to send to', { code: 'SAME_ACCOUNT' });
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await applyInTransaction(session, { customer, type, accountId, dest, amount, description, idempotencyKey, req });
    });

    if (type === 'transfer') {
      const from = maskAccount(result.sourceAfter.accountNumber);
      await Notification.insertMany([
        { customerId: customer._id, title: 'Transfer sent', message: `${formatINR(amount)} sent to ${maskAccount(dest.accountNumber)}.`, type: 'success' },
        { customerId: dest.customerId, title: 'Money received', message: `${formatINR(amount)} received from ${from}.`, type: 'success' },
      ]).catch((e) => console.error('transfer notification failed:', e.message));
    }
    return { transaction: result.txn, balance: result.sourceAfter.balance, replay: false };
  } catch (err) {
    // Two identical requests raced: the unique (customer, key) index let only one commit. Return its result.
    if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
      const winner = await Transaction.findOne({ initiatedBy: customer._id, idempotencyKey });
      if (winner) return replay(winner, params);
    }
    if (err.recordFailure) await recordFailedAttempt({ customer, type, accountId, dest, amount, description, err });
    throw err;
  } finally {
    await session.endSession();
  }
}

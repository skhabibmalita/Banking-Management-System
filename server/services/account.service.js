import mongoose from 'mongoose';
import { Account, Customer, Notification } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { generateAccountNumber } from '../utils/accountNumber.js';
import { MAX_OPEN_ACCOUNTS } from '../config/policy.js';
import { transitionError } from './accountRules.js';
import { logAudit } from './audit.service.js';

// What a customer sees. Internal fields (who changed the status, why) stay on the server.
export const accountDTO = (a) => ({
  id: a.id,
  accountNumber: a.accountNumber,
  accountType: a.accountType,
  balance: a.balance,
  currency: a.currency,
  status: a.status,
  createdAt: a.createdAt,
  closedAt: a.closedAt,
});

const last4 = (a) => a.accountNumber.slice(-4);
const notify = (customerId, title, message, type) =>
  Notification.create({ customerId, title, message, type }).catch((e) => console.error('notification failed:', e.message));

// Opening runs in a transaction that first writes to the customer document. Two simultaneous requests
// therefore conflict and run one after the other, so the open-account limit cannot be beaten by a race.
async function createInTransaction(customerId, accountType, accountNumber) {
  const session = await mongoose.startSession();
  try {
    let account;
    await session.withTransaction(async () => {
      await Customer.updateOne({ _id: customerId }, { $inc: { accountSeq: 1 } }, { session });
      const open = await Account.countDocuments({ customerId, status: { $ne: 'closed' } }).session(session);
      if (open >= MAX_OPEN_ACCOUNTS) {
        throw ApiError.conflict(`You can have up to ${MAX_OPEN_ACCOUNTS} open accounts. Close one first.`, { code: 'TOO_MANY_ACCOUNTS' });
      }
      [account] = await Account.create([{ customerId, accountNumber, accountType }], { session });
    });
    return account;
  } finally {
    await session.endSession();
  }
}

export async function openAccount({ customer, accountType, req }) {
  let account;
  for (let attempt = 0; attempt < 5 && !account; attempt += 1) {
    try {
      account = await createInTransaction(customer._id, accountType, generateAccountNumber());
    } catch (err) {
      // Astronomically rare random collision: try a fresh number.
      if (!(err.code === 11000 && err.keyPattern?.accountNumber)) throw err;
    }
  }
  if (!account) throw new Error('Could not allocate an account number');

  await notify(customer._id, 'New account opened', `Your ${accountType} account ending ${last4(account)} is ready.`, 'success');
  await logAudit({ req, actorId: customer._id, actorModel: 'Customer', action: 'ACCOUNT_OPENED', entityType: 'Account', entityId: account._id, meta: { accountType } });
  return account;
}

const AUDIT_ACTION = { closed: 'ACCOUNT_CLOSED', frozen: 'ACCOUNT_FROZEN', active: 'ACCOUNT_UNFROZEN' };

// Shared by the customer route (close) and, in Phase 9, the admin routes (freeze, unfreeze, close).
// The caller has already proven the actor may see this account.
export async function changeAccountStatus({ account, to, actor, reason, req }) {
  const blocked = transitionError({ actor: actor.type, from: account.status, to });
  if (blocked) throw blocked;
  if (to === 'closed' && account.balance !== 0) {
    throw ApiError.conflict('Move the remaining balance out before closing this account', { code: 'BALANCE_NOT_ZERO' });
  }

  const from = account.status;
  const update = {
    $set: {
      status: to,
      statusChangedBy: actor.id,
      statusChangedByModel: actor.type === 'admin' ? 'Admin' : 'Customer',
      ...(reason ? { statusReason: reason } : {}),
      ...(to === 'closed' ? { closedAt: new Date() } : {}),
    },
    ...(reason ? {} : { $unset: { statusReason: 1 } }),
  };
  // The filter makes the change atomic: it only applies if the status (and, for closing, the zero
  // balance) is still what we checked a moment ago.
  const result = await Account.updateOne({ _id: account._id, status: from, ...(to === 'closed' ? { balance: 0 } : {}) }, update);
  if (result.modifiedCount === 0) {
    const fresh = await Account.findById(account._id);
    if (to === 'closed' && fresh?.status === from && fresh.balance !== 0) {
      throw ApiError.conflict('Move the remaining balance out before closing this account', { code: 'BALANCE_NOT_ZERO' });
    }
    throw ApiError.conflict('This account was just changed. Refresh and try again.', { code: 'STATE_CHANGED' });
  }

  const messages = {
    closed: ['Account closed', `Your ${account.accountType} account ending ${last4(account)} has been closed.`, 'info'],
    frozen: ['Account frozen', `Your ${account.accountType} account ending ${last4(account)} was frozen after a security review.`, 'warning'],
    active: ['Account active again', `Your ${account.accountType} account ending ${last4(account)} can be used again.`, 'success'],
  };
  await notify(account.customerId, ...messages[to]);
  await logAudit({
    req, actorId: actor.id, actorModel: actor.type === 'admin' ? 'Admin' : 'Customer',
    action: AUDIT_ACTION[to], entityType: 'Account', entityId: account._id, meta: { from, to, reason },
  });
  return Account.findById(account._id);
}

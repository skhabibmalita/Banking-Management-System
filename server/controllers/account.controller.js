import asyncHandler from '../middleware/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { created, ok, pageMeta } from '../utils/response.js';
import { Account } from '../models/index.js';
import { accountDTO, changeAccountStatus, openAccount } from '../services/account.service.js';

// Scoping every lookup by the session's customer id means another customer's account looks like
// "not found". An id from the URL is never trusted on its own.
async function loadOwnAccount(req) {
  const account = await Account.findOne({ _id: req.params.id, customerId: req.customer._id });
  if (!account) throw ApiError.notFound('Account not found');
  return account;
}

export const create = asyncHandler(async (req, res) => {
  const account = await openAccount({ customer: req.customer, accountType: req.body.accountType, req });
  return created(res, { account: accountDTO(account) }, { message: 'Account opened' });
});

export const list = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const filter = { customerId: req.customer._id, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    Account.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Account.countDocuments(filter),
  ]);
  return ok(res, items.map(accountDTO), { meta: pageMeta({ page, limit, total }) });
});

export const get = asyncHandler(async (req, res) => ok(res, { account: accountDTO(await loadOwnAccount(req)) }));

export const setStatus = asyncHandler(async (req, res) => {
  const account = await loadOwnAccount(req);
  const updated = await changeAccountStatus({
    account, to: req.body.status, reason: req.body.reason, actor: { type: 'customer', id: req.customer._id }, req,
  });
  return ok(res, { account: accountDTO(updated) }, { message: 'Account updated' });
});

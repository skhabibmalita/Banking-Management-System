import asyncHandler from '../middleware/asyncHandler.js';
import { created, ok, pageMeta } from '../utils/response.js';
import { executeMoney } from '../services/ledger.service.js';
import { getHistory, getTransactionDetail, loadContext, transactionDTO } from '../services/transaction.service.js';
import { streamReceipt } from '../services/receipt.service.js';

// Shared by deposit, withdraw and transfer. The customer comes from the session, never from the body.
const money = (type) => asyncHandler(async (req, res) => {
  const { transaction, balance, replay } = await executeMoney({
    customer: req.customer, type, idempotencyKey: req.idempotencyKey, req,
    accountId: req.body.accountId ?? req.body.fromAccountId,
    toAccountNumber: req.body.toAccountNumber,
    amount: req.body.amount,
    description: req.body.description,
  });
  const ctx = await loadContext(req.customer._id, [transaction]);
  const data = { transaction: transactionDTO(transaction, ctx), account: { id: String(transaction.accountId), balance } };
  if (replay) {
    res.setHeader('Idempotent-Replay', 'true');
    return ok(res, data, { message: 'This request was already processed' });
  }
  return created(res, data, { message: `${type[0].toUpperCase()}${type.slice(1)} completed` });
});

export const deposit = money('deposit');
export const withdraw = money('withdrawal');
export const transfer = money('transfer');

export const history = asyncHandler(async (req, res) => {
  const { items, total } = await getHistory(req.customer, req.query);
  return ok(res, items, { meta: pageMeta({ page: req.query.page, limit: req.query.limit, total }) });
});

export const detail = asyncHandler(async (req, res) => ok(res, await getTransactionDetail(req.customer, req.params.id)));

export const receipt = asyncHandler(async (req, res) => streamReceipt(req.customer, req.params.id, res));

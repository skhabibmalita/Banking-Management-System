import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../app.js';
import { Account, AuditLog, Customer, LedgerEntry, Notification, Transaction } from '../../models/index.js';
import { as, signUp, startTestDb } from '../helpers/session.js';
import { generateAccountNumber } from '../../utils/accountNumber.js';

let db;
const uid = () => crypto.randomUUID();
const bin = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };

const money = (who, path, body, key = uid()) => as(request(app).post(`/api/transactions/${path}`), who).set('Idempotency-Key', key).send(body);
const deposit = (who, acct, amount, key) => money(who, 'deposit', { accountId: acct.id, amount }, key);
const withdraw = (who, acct, amount, key) => money(who, 'withdraw', { accountId: acct.id, amount }, key);
const transfer = (who, from, to, amount, extra = {}, key) => money(who, 'transfer', { fromAccountId: from.id, toAccountNumber: to.accountNumber, amount, ...extra }, key);
const get = (who, url) => as(request(app).get(url), who);

const balance = async (acct) => (await Account.findById(acct._id)).balance;
const totalBalance = async () => (await Account.aggregate([{ $group: { _id: null, t: { $sum: '$balance' } } }]))[0]?.t ?? 0;

async function customer({ funds = 0, verified = true } = {}) {
  const who = await signUp(app);
  if (verified) await Customer.updateOne({ _id: who.id }, { kycStatus: 'verified' });
  const account = await Account.create({ customerId: who.id, accountNumber: generateAccountNumber(), accountType: 'savings', balance: funds });
  return { who, account };
}

beforeAll(async () => { db = await startTestDb('bank_txn_test'); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  await Promise.all([Customer, Account, Transaction, Notification].map((m) => m.deleteMany({})));
  await Promise.all([LedgerEntry, AuditLog].map((m) => m.collection.deleteMany({})));
});

describe('deposit', () => {
  it('credits the account and writes the transaction, ledger and audit rows', async () => {
    const { who, account } = await customer();
    const res = await deposit(who, account, 150_000);
    expect(res.status).toBe(201);
    expect(res.body.data.transaction).toMatchObject({ type: 'deposit', direction: 'credit', amount: 150_000, status: 'completed' });
    expect(res.body.data.transaction.reference).toMatch(/^TXN[A-F0-9]{16}$/);
    expect(res.body.data.account.balance).toBe(150_000);
    expect(await balance(account)).toBe(150_000);

    const [entry] = await LedgerEntry.find();
    expect(entry).toMatchObject({ direction: 'credit', amount: 150_000, balanceAfter: 150_000 });
    expect(await AuditLog.countDocuments({ action: 'DEPOSIT_COMPLETED' })).toBe(1);
  });

  it('is refused for frozen and closed accounts', async () => {
    const { who, account } = await customer({ funds: 1000 });
    await Account.updateOne({ _id: account._id }, { status: 'frozen' });
    const frozen = await deposit(who, account, 5000);
    expect([frozen.status, frozen.body.code]).toEqual([403, 'ACCOUNT_FROZEN']);
    await Account.updateOne({ _id: account._id }, { status: 'closed' });
    expect((await deposit(who, account, 5000)).body.code).toBe('ACCOUNT_CLOSED');
    expect(await balance(account)).toBe(1000);
  });
});

describe('withdrawal', () => {
  it('debits the account, including down to exactly zero', async () => {
    const { who, account } = await customer({ funds: 50_000 });
    expect((await withdraw(who, account, 20_000)).status).toBe(201);
    expect((await withdraw(who, account, 30_000)).status).toBe(201);
    expect(await balance(account)).toBe(0);
    expect(await LedgerEntry.countDocuments({ direction: 'debit' })).toBe(2);
  });

  it('refuses an overdraft by even one paisa, records the failure and moves nothing', async () => {
    const { who, account } = await customer({ funds: 50_000 });
    const key = uid();
    const res = await withdraw(who, account, 50_001, key);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    expect(res.body.details.available).toBe(50_000);
    expect(await balance(account)).toBe(50_000);
    expect(await LedgerEntry.countDocuments()).toBe(0);

    const failed = await Transaction.findOne({ status: 'failed' });
    expect(failed).toMatchObject({ type: 'withdrawal', amount: 50_001 });
    expect(failed.idempotencyKey).toBeUndefined();
    expect(await Notification.countDocuments({ customerId: who.id, title: 'Withdrawal failed' })).toBe(1);

    // After topping up, the SAME key works: a failed attempt never blocks a retry.
    await deposit(who, account, 10_000);
    expect((await withdraw(who, account, 50_001, key)).status).toBe(201);
  });

  it('is refused for frozen accounts', async () => {
    const { who, account } = await customer({ funds: 50_000 });
    await Account.updateOne({ _id: account._id }, { status: 'frozen' });
    expect((await withdraw(who, account, 100)).body.code).toBe('ACCOUNT_FROZEN');
    expect(await balance(account)).toBe(50_000);
  });
});

describe('transfer', () => {
  it('moves money between customers with matching debit and credit entries', async () => {
    const [a, b] = [await customer({ funds: 100_000 }), await customer({ funds: 5_000 })];
    const before = await totalBalance();
    const res = await transfer(a.who, a.account, b.account, 30_000, { description: 'Rent' });
    expect(res.status).toBe(201);
    expect(res.body.data.transaction).toMatchObject({ type: 'transfer', direction: 'debit', description: 'Rent', counterparty: { last4: b.account.accountNumber.slice(-4) } });
    expect(await balance(a.account)).toBe(70_000);
    expect(await balance(b.account)).toBe(35_000);
    expect(await totalBalance()).toBe(before); // money is conserved

    const entries = await LedgerEntry.find({ transactionId: (await Transaction.findOne())._id });
    expect(entries.map((e) => `${e.direction}:${e.amount}`).sort()).toEqual(['credit:30000', 'debit:30000']);
    expect(await Notification.countDocuments({ customerId: b.who.id, title: 'Money received' })).toBe(1);
  });

  it('allows moving money between my own accounts', async () => {
    const a = await customer({ funds: 20_000 });
    const second = await Account.create({ customerId: a.who.id, accountNumber: generateAccountNumber(), accountType: 'current', balance: 0 });
    expect((await transfer(a.who, a.account, second, 5_000)).status).toBe(201);
    expect(await balance(second)).toBe(5_000);
  });

  it('rolls the debit back when the recipient cannot receive', async () => {
    const [a, b] = [await customer({ funds: 100_000 }), await customer({ funds: 0 })];
    await Account.updateOne({ _id: b.account._id }, { status: 'frozen' });
    const res = await transfer(a.who, a.account, b.account, 30_000);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RECIPIENT_UNAVAILABLE');
    expect(await balance(a.account)).toBe(100_000); // debit undone
    expect(await balance(b.account)).toBe(0);
    expect(await LedgerEntry.countDocuments()).toBe(0);
    expect(await Transaction.countDocuments({ status: 'completed' })).toBe(0);
  });

  it('answers the same way for a recipient that does not exist', async () => {
    const a = await customer({ funds: 100_000 });
    const res = await money(a.who, 'transfer', { fromAccountId: a.account.id, toAccountNumber: generateAccountNumber(), amount: 1000 });
    expect([res.status, res.body.code]).toEqual([422, 'RECIPIENT_UNAVAILABLE']);
    expect(await balance(a.account)).toBe(100_000);
  });

  it('refuses insufficient funds, same-account transfers and bad numbers', async () => {
    const [a, b] = [await customer({ funds: 1_000 }), await customer()];
    expect((await transfer(a.who, a.account, b.account, 5_000)).body.code).toBe('INSUFFICIENT_FUNDS');
    expect((await transfer(a.who, a.account, a.account, 100)).body.code).toBe('SAME_ACCOUNT');
    const bad = b.account.accountNumber.slice(0, 9) + ((Number(b.account.accountNumber[9]) + 1) % 10);
    expect((await money(a.who, 'transfer', { fromAccountId: a.account.id, toAccountNumber: bad, amount: 100 })).status).toBe(400);
    expect(await balance(a.account)).toBe(1_000);
  });
});

describe('rules that apply to every money request', () => {
  it('rejects bad amounts, unknown fields and missing or malformed keys', async () => {
    const { who, account } = await customer({ funds: 10_000 });
    for (const amount of [10.5, '500', 0, -100, 50, 2_000_000_000]) {
      expect((await money(who, 'deposit', { accountId: account.id, amount })).status, String(amount)).toBe(400);
    }
    expect((await money(who, 'deposit', { accountId: account.id, amount: 500, balance: 999 })).status).toBe(400);
    const noKey = await as(request(app).post('/api/transactions/deposit'), who).send({ accountId: account.id, amount: 500 });
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect((await deposit(who, account, 500, 'bad key!')).body.code).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(await Transaction.countDocuments()).toBe(0);
  });

  it('requires verified KYC', async () => {
    const { who, account } = await customer({ funds: 10_000, verified: false });
    const res = await withdraw(who, account, 500);
    expect([res.status, res.body.code]).toEqual([403, 'KYC_REQUIRED']);
    expect(await balance(account)).toBe(10_000);
  });

  it('requires sign-in and the CSRF header', async () => {
    const { who, account } = await customer();
    const anon = await request(app).post('/api/transactions/deposit').set('Idempotency-Key', uid()).send({ accountId: account.id, amount: 500 });
    expect(anon.status).toBe(401);
    const noCsrf = await request(app).post('/api/transactions/deposit').set('Cookie', who.cookie).set('Idempotency-Key', uid()).send({ accountId: account.id, amount: 500 });
    expect(noCsrf.status).toBe(403);
  });

  it('never lets one customer touch another customer\'s account', async () => {
    const [a, b] = [await customer({ funds: 100_000 }), await customer({ funds: 0 })];
    expect((await deposit(b.who, a.account, 5_000)).status).toBe(404);
    expect((await withdraw(b.who, a.account, 5_000)).status).toBe(404);
    expect((await transfer(b.who, a.account, b.account, 5_000)).status).toBe(404);
    expect(await balance(a.account)).toBe(100_000);
    expect(await Transaction.countDocuments()).toBe(0);
  });
});

describe('duplicate prevention', () => {
  it('returns the original result when a request is retried with the same key', async () => {
    const { who, account } = await customer();
    const key = uid();
    const first = await deposit(who, account, 40_000, key);
    const second = await deposit(who, account, 40_000, key);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.data.transaction.reference).toBe(first.body.data.transaction.reference);
    expect(await balance(account)).toBe(40_000);
    expect(await Transaction.countDocuments()).toBe(1);
  });

  it('rejects the same key used for a different request', async () => {
    const { who, account } = await customer();
    const key = uid();
    await deposit(who, account, 40_000, key);
    const res = await deposit(who, account, 50_000, key);
    expect([res.status, res.body.code]).toEqual([422, 'IDEMPOTENCY_MISMATCH']);
    expect(await balance(account)).toBe(40_000);
  });

  it('processes only once when identical requests arrive at the same moment', async () => {
    const { who, account } = await customer();
    const key = uid();
    const results = await Promise.all(Array.from({ length: 6 }, () => deposit(who, account, 25_000, key)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
    expect(new Set(results.map((r) => r.body.data.transaction.reference)).size).toBe(1);
    expect(await balance(account)).toBe(25_000);
    expect(await Transaction.countDocuments()).toBe(1);
  });

  it('keeps keys separate per customer', async () => {
    const [a, b] = [await customer(), await customer()];
    const key = uid();
    expect((await deposit(a.who, a.account, 1_000, key)).status).toBe(201);
    expect((await deposit(b.who, b.account, 1_000, key)).status).toBe(201);
  });
});

describe('concurrency and ledger integrity', () => {
  it('never lets simultaneous withdrawals overdraw an account', async () => {
    const { who, account } = await customer({ funds: 55_000 });
    const results = await Promise.all(Array.from({ length: 10 }, () => withdraw(who, account, 10_000)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.body.code === 'INSUFFICIENT_FUNDS')).toHaveLength(5);
    expect(await balance(account)).toBe(5_000);
  });

  it('keeps totals exact when transfers cross in both directions at once', async () => {
    const [a, b] = [await customer({ funds: 100_000 }), await customer({ funds: 100_000 })];
    const before = await totalBalance();
    const results = await Promise.all([
      ...Array.from({ length: 5 }, () => transfer(a.who, a.account, b.account, 1_000)),
      ...Array.from({ length: 5 }, () => transfer(b.who, b.account, a.account, 2_000)),
    ]);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await balance(a.account)).toBe(100_000 - 5_000 + 10_000);
    expect(await balance(b.account)).toBe(100_000 + 5_000 - 10_000);
    expect(await totalBalance()).toBe(before);
  });

  it('has a ledger that fully explains every balance', async () => {
    const [a, b] = [await customer(), await customer()];
    await deposit(a.who, a.account, 90_000);
    await withdraw(a.who, a.account, 10_000);
    await transfer(a.who, a.account, b.account, 25_000);
    await withdraw(b.who, b.account, 5_000);
    await withdraw(b.who, b.account, 999_999); // fails, must leave no trace in the ledger

    for (const { account } of [a, b]) {
      const entries = await LedgerEntry.find({ accountId: account._id }).sort({ createdAt: 1, _id: 1 });
      const sum = entries.reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0);
      expect(sum).toBe(await balance(account));
      expect(entries.at(-1).balanceAfter).toBe(await balance(account));
    }
    const credits = await LedgerEntry.aggregate([{ $group: { _id: '$direction', t: { $sum: '$amount' } } }]);
    const total = (d) => credits.find((c) => c._id === d)?.t ?? 0;
    expect(total('credit') - total('debit')).toBe(await totalBalance()); // all money entered via deposits
  });
});

describe('fraud flags', () => {
  it('flags large amounts, rapid transfers and deposit-then-withdraw, but still processes them', async () => {
    const [a, b] = [await customer(), await customer()];
    const large = await deposit(a.who, a.account, 45_000_000);
    expect(large.status).toBe(201);
    expect((await Transaction.findById(large.body.data.transaction.id)).flagReasons).toEqual(['LARGE_AMOUNT']);

    const out = await withdraw(a.who, a.account, 44_000_000);
    expect((await Transaction.findById(out.body.data.transaction.id)).flagReasons).toContain('DEPOSIT_THEN_WITHDRAW');

    let last;
    for (let i = 0; i < 5; i += 1) last = await transfer(a.who, a.account, b.account, 100);
    expect((await Transaction.findById(last.body.data.transaction.id)).flagReasons).toContain('RAPID_TRANSFERS');
    expect(await Transaction.countDocuments({ flagged: true })).toBeGreaterThanOrEqual(3);
  });
});

describe('history and details', () => {
  async function scenario() {
    const [a, b, c] = [await customer(), await customer({ funds: 1_000 }), await customer()];
    await deposit(a.who, a.account, 100_000);
    await withdraw(a.who, a.account, 20_000);
    const t = await transfer(a.who, a.account, b.account, 30_000, { description: 'Rent for November' });
    await withdraw(a.who, a.account, 9_999_999); // fails
    await transfer(a.who, a.account, b.account, 9_999_999); // fails, counterparty is b
    return { a, b, c, transferRef: t.body.data.transaction.reference, transferId: t.body.data.transaction.id };
  }

  it('shows my credits and debits, newest first, only mine', async () => {
    const { a, b, c } = await scenario();
    const mine = await get(a.who, '/api/transactions/history');
    expect(mine.status).toBe(200);
    expect(mine.body.meta.total).toBe(5);
    expect(mine.body.data[0].date >= mine.body.data.at(-1).date).toBe(true);
    expect((await get(a.who, '/api/transactions/history?direction=credit')).body.data).toHaveLength(1);
    expect((await get(a.who, '/api/transactions/history?direction=debit')).body.data).toHaveLength(4);
    expect((await get(c.who, '/api/transactions/history')).body.meta.total).toBe(0);

    const theirs = (await get(b.who, '/api/transactions/history')).body.data;
    expect(theirs).toHaveLength(1); // only the completed transfer; the failed one is never shown to the recipient
    expect(theirs[0]).toMatchObject({ type: 'transfer', direction: 'credit', amount: 30_000 });
    expect(theirs[0].failureReason).toBeUndefined();
  });

  it('filters by type, status, date and search text, and paginates', async () => {
    const { a, transferRef } = await scenario();
    const body = async (qs) => (await get(a.who, `/api/transactions/history?${qs}`)).body;
    expect((await body('type=transfer')).meta.total).toBe(2);
    expect((await body('status=failed')).meta.total).toBe(2);
    expect((await body('q=november')).data[0].reference).toBe(transferRef);
    expect((await body(`q=${transferRef.slice(0, 8)}`)).meta.total).toBe(1);
    const today = new Date().toISOString().slice(0, 10);
    expect((await body(`from=${today}&to=${today}`)).meta.total).toBe(5);
    expect((await body('to=2001-01-01')).meta.total).toBe(0);
    const page2 = await body('limit=2&page=2');
    expect(page2.data).toHaveLength(2);
    expect(page2.meta).toMatchObject({ page: 2, pages: 3, total: 5 });
  });

  it('treats search text as plain text and rejects bad filters', async () => {
    const { a, b } = await scenario();
    expect((await get(a.who, '/api/transactions/history?q=(')).status).toBe(200);
    expect((await get(a.who, '/api/transactions/history?q=.*')).body.meta.total).toBe(0);
    expect((await get(a.who, '/api/transactions/history?type=refund')).status).toBe(400);
    expect((await get(a.who, `/api/transactions/history?accountId=${b.account.id}`)).status).toBe(404);
    expect((await get(a.who, `/api/transactions/history?accountId=${a.account.id}`)).body.meta.total).toBe(5);
  });

  it('shows each side only its own ledger entry', async () => {
    const { a, b, c, transferId } = await scenario();
    const sender = (await get(a.who, `/api/transactions/${transferId}`)).body.data;
    expect(sender.ledger).toHaveLength(1);
    expect(sender.ledger[0]).toMatchObject({ direction: 'debit', amount: 30_000 });
    const receiver = (await get(b.who, `/api/transactions/${transferId}`)).body.data;
    expect(receiver.ledger[0]).toMatchObject({ direction: 'credit', balanceAfter: 31_000 });
    expect((await get(c.who, `/api/transactions/${transferId}`)).status).toBe(404);
    expect((await get(a.who, '/api/transactions/not-an-id')).status).toBe(400);
  });
});

describe('receipts', () => {
  it('serves a PDF to the sender and the recipient of a completed transaction only', async () => {
    const [a, b, c] = [await customer({ funds: 100_000 }), await customer(), await customer()];
    const t = (await transfer(a.who, a.account, b.account, 30_000)).body.data.transaction;
    for (const who of [a.who, b.who]) {
      const res = await get(who, `/api/transactions/${t.id}/receipt`).buffer(true).parse(bin);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toContain(t.reference);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect((await get(c.who, `/api/transactions/${t.id}/receipt`)).status).toBe(404);

    await withdraw(a.who, a.account, 9_999_999);
    const failed = await Transaction.findOne({ status: 'failed' });
    expect((await get(a.who, `/api/transactions/${failed.id}/receipt`)).body.code).toBe('NOT_COMPLETED');
  });
});

describe('customer dashboard', () => {
  it('summarises balances, totals, trend and recent activity', async () => {
    const { who, account } = await customer();
    await deposit(who, account, 100_000);
    await withdraw(who, account, 20_000);
    const closed = await Account.create({ customerId: who.id, accountNumber: generateAccountNumber(), accountType: 'current', balance: 0, status: 'closed' });
    expect(closed.status).toBe('closed');

    const res = await get(who, '/api/customers/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ balance: 80_000, activeAccounts: 1, deposits: 100_000, withdrawals: 20_000 });
    expect(res.body.data.accounts).toHaveLength(1);
    expect(res.body.data.recent).toHaveLength(2);
    expect(res.body.data.trend).toHaveLength(6);
    expect(res.body.data.trend.at(-1)).toMatchObject({ deposits: 100_000, withdrawals: 20_000 });
  });
});

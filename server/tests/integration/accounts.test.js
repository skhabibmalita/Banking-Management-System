import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { Account, AuditLog, Customer, Notification } from '../../models/index.js';
import { as, signUp, startTestDb } from '../helpers/session.js';
import { isValidAccountNumber } from '../../utils/accountNumber.js';

let db;
const open = (who, accountType = 'savings') => as(request(app).post('/api/accounts'), who).send({ accountType });
const setStatus = (who, id, body) => as(request(app).put(`/api/accounts/${id}/status`), who).send(body);

beforeAll(async () => { db = await startTestDb('bank_accounts_test'); });
afterAll(async () => { await db.stop(); });
beforeEach(async () => {
  await Promise.all([Customer, Account, Notification].map((m) => m.deleteMany({})));
  await AuditLog.collection.deleteMany({});
});

describe('opening accounts', () => {
  it('requires sign-in and the CSRF header', async () => {
    expect((await request(app).post('/api/accounts').send({ accountType: 'savings' })).status).toBe(401);
    const me = await signUp(app);
    const noCsrf = await request(app).post('/api/accounts').set('Cookie', me.cookie).send({ accountType: 'savings' });
    expect(noCsrf.status).toBe(403);
  });

  it('opens an account with a valid number, zero balance and active status', async () => {
    const me = await signUp(app);
    const res = await open(me, 'salary');
    expect(res.status).toBe(201);
    const acc = res.body.data.account;
    expect(acc).toMatchObject({ accountType: 'salary', balance: 0, status: 'active', currency: 'INR' });
    expect(isValidAccountNumber(acc.accountNumber)).toBe(true);
    expect(acc.customerId).toBeUndefined();
    expect(acc.statusChangedBy).toBeUndefined();
    expect((await Account.findById(acc.id)).customerId.toString()).toBe(me.id);
    expect(await Notification.countDocuments({ customerId: me.id, title: 'New account opened' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'ACCOUNT_OPENED' })).toBe(1);
  });

  it('rejects bad types and attempts to set a balance or owner', async () => {
    const me = await signUp(app);
    const other = await signUp(app);
    expect((await open(me, 'gold')).status).toBe(400);
    const rich = await as(request(app).post('/api/accounts'), me).send({ accountType: 'savings', balance: 99999999 });
    expect(rich.status).toBe(400);
    const stolen = await as(request(app).post('/api/accounts'), me).send({ accountType: 'savings', customerId: other.id });
    expect(stolen.status).toBe(400);
    expect(await Account.countDocuments()).toBe(0);
  });

  it('allows several accounts of the same type', async () => {
    const me = await signUp(app);
    const [a, b] = [await open(me), await open(me)];
    expect(a.body.data.account.accountNumber).not.toBe(b.body.data.account.accountNumber);
  });

  it('enforces the open-account limit, and closed accounts do not count', async () => {
    const me = await signUp(app);
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push((await open(me)).body.data.account.id);
    const sixth = await open(me);
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe('TOO_MANY_ACCOUNTS');
    expect((await setStatus(me, ids[0], { status: 'closed' })).status).toBe(200);
    expect((await open(me)).status).toBe(201);
  });

  it('cannot be beaten by simultaneous requests', async () => {
    const me = await signUp(app);
    for (let i = 0; i < 4; i += 1) await open(me);
    const results = await Promise.all([open(me), open(me), open(me)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await Account.countDocuments({ customerId: me.id, status: { $ne: 'closed' } })).toBe(5);
  });
});

describe('reading accounts', () => {
  it('lists only my accounts, with filtering and pagination', async () => {
    const [a, b] = [await signUp(app), await signUp(app)];
    await open(a); await open(a); await open(b);
    const closing = (await open(a)).body.data.account.id;
    await setStatus(a, closing, { status: 'closed' });

    const all = await as(request(app).get('/api/accounts'), a);
    expect(all.body.data).toHaveLength(3);
    expect(all.body.meta).toMatchObject({ total: 3, page: 1 });
    const active = await as(request(app).get('/api/accounts?status=active'), a);
    expect(active.body.data).toHaveLength(2);
    const paged = await as(request(app).get('/api/accounts?limit=1&page=2'), a);
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta).toMatchObject({ pages: 3, limit: 1, page: 2 });
    expect((await as(request(app).get('/api/accounts?status=weird'), a)).status).toBe(400);
  });

  it('hides other customers\' accounts as "not found"', async () => {
    const [a, b] = [await signUp(app), await signUp(app)];
    const id = (await open(a)).body.data.account.id;
    expect((await as(request(app).get(`/api/accounts/${id}`), a)).status).toBe(200);
    expect((await as(request(app).get(`/api/accounts/${id}`), b)).status).toBe(404);
    expect((await setStatus(b, id, { status: 'closed' })).status).toBe(404);
    expect((await Account.findById(id)).status).toBe('active');
    expect((await as(request(app).get('/api/accounts/not-an-id'), a)).status).toBe(400);
  });
});

describe('changing account status', () => {
  it('closes an empty account, records who and when, and notifies', async () => {
    const me = await signUp(app);
    const id = (await open(me)).body.data.account.id;
    const res = await setStatus(me, id, { status: 'closed', reason: 'No longer needed' });
    expect(res.status).toBe(200);
    expect(res.body.data.account.status).toBe('closed');
    const stored = await Account.findById(id);
    expect(stored.closedAt).toBeInstanceOf(Date);
    expect(stored.statusChangedBy.toString()).toBe(me.id);
    expect(await AuditLog.countDocuments({ action: 'ACCOUNT_CLOSED' })).toBe(1);
    expect(await Notification.countDocuments({ customerId: me.id, title: 'Account closed' })).toBe(1);
  });

  it('refuses to close an account that still holds money', async () => {
    const me = await signUp(app);
    const id = (await open(me)).body.data.account.id;
    await Account.updateOne({ _id: id }, { balance: 2500 });
    const res = await setStatus(me, id, { status: 'closed' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BALANCE_NOT_ZERO');
    expect((await Account.findById(id)).status).toBe('active');
  });

  it('blocks the close atomically if money arrives at the last moment', async () => {
    const me = await signUp(app);
    const id = (await open(me)).body.data.account.id;
    const account = await Account.findById(id);
    await Account.updateOne({ _id: id }, { balance: 100 }); // deposit lands after the service read the account
    const { changeAccountStatus } = await import('../../services/account.service.js');
    await expect(changeAccountStatus({ account, to: 'closed', actor: { type: 'customer', id: me.id }, req: {} })).rejects.toMatchObject({ code: 'BALANCE_NOT_ZERO' });
    expect((await Account.findById(id)).status).toBe('active');
  });

  it('stops customers from freezing, unfreezing or reopening', async () => {
    const me = await signUp(app);
    const id = (await open(me)).body.data.account.id;
    const freeze = await setStatus(me, id, { status: 'frozen' });
    expect([freeze.status, freeze.body.code]).toEqual([403, 'TRANSITION_NOT_ALLOWED']);

    await Account.updateOne({ _id: id }, { status: 'frozen' });
    const unfreeze = await setStatus(me, id, { status: 'active' });
    expect([unfreeze.status, unfreeze.body.code]).toEqual([403, 'ACCOUNT_FROZEN']);
    expect((await setStatus(me, id, { status: 'closed' })).body.code).toBe('ACCOUNT_FROZEN');

    await Account.updateOne({ _id: id }, { status: 'closed' });
    expect((await setStatus(me, id, { status: 'active' })).body.code).toBe('ACCOUNT_CLOSED');
  });

  it('rejects unknown statuses and extra fields', async () => {
    const me = await signUp(app);
    const id = (await open(me)).body.data.account.id;
    expect((await setStatus(me, id, { status: 'deleted' })).status).toBe(400);
    expect((await setStatus(me, id, { status: 'closed', balance: 0 })).status).toBe(400);
  });
});

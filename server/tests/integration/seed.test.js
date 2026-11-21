import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import request from 'supertest';
import app from '../../app.js';
import { Account, Admin, Customer, KycDocument, LedgerEntry, Transaction } from '../../models/index.js';
import { adminSignIn, as, cookieMap, jar, startTestDb } from '../helpers/session.js';
import { seedDemo } from '../../scripts/seedData.js';
import { ACCOUNTS, ADMINS, DEMO_ADMIN_PASSWORD, DEMO_CUSTOMER_PASSWORD, PEOPLE } from '../../scripts/demoPlan.js';
import { resolveStoragePath, uploadRoot } from '../../utils/storage.js';
import { isValidAccountNumber } from '../../utils/accountNumber.js';

let db; let result;
beforeAll(async () => { db = await startTestDb('bank_seed_test'); result = await seedDemo(); }, 120_000);
afterAll(async () => { await db.stop(); await fs.rm(uploadRoot, { recursive: true, force: true }); });

describe('demo seed', () => {
  it('creates the planned people, accounts and admins', async () => {
    expect(result.summary).toMatchObject({ admins: ADMINS.length, customers: PEOPLE.length, accounts: ACCOUNTS.length });
    expect(result.summary.transactions).toBeGreaterThan(100);
    expect(ACCOUNTS.every((a) => isValidAccountNumber(a.number))).toBe(true);
    expect(await Customer.countDocuments({ kycStatus: 'verified' })).toBe(PEOPLE.filter((p) => p.kyc === 'verified').length);
  });

  it('leaves a ledger that fully explains every balance, with no negatives', async () => {
    for (const account of await Account.find()) {
      expect(account.balance).toBeGreaterThanOrEqual(0);
      const entries = await LedgerEntry.find({ accountId: account._id }).sort({ createdAt: 1, _id: 1 });
      const sum = entries.reduce((s, e) => s + (e.direction === 'credit' ? e.amount : -e.amount), 0);
      expect(sum, account.accountNumber).toBe(account.balance);
      if (entries.length) expect(entries.at(-1).balanceAfter).toBe(account.balance);
    }
  });

  it('keeps transfers balanced and money conserved', async () => {
    const transfers = await Transaction.find({ type: 'transfer', status: 'completed' });
    for (const t of transfers.slice(0, 40)) {
      const rows = await LedgerEntry.find({ transactionId: t._id });
      expect(rows.map((r) => r.direction).sort()).toEqual(['credit', 'debit']);
      expect(rows[0].amount).toBe(rows[1].amount);
    }
    const [credits, debits] = ['credit', 'debit'].map(async (d) => (await LedgerEntry.aggregate([{ $match: { direction: d } }, { $group: { _id: null, t: { $sum: '$amount' } } }]))[0].t);
    const total = (await Account.aggregate([{ $group: { _id: null, t: { $sum: '$balance' } } }]))[0].t;
    expect((await credits) - (await debits)).toBe(total);
  });

  it('includes the stories the admin console needs', async () => {
    expect(await Transaction.countDocuments({ flagged: true, reviewedAt: { $exists: false } })).toBe(result.summary.flaggedOpen);
    expect(result.summary.flaggedOpen).toBeGreaterThanOrEqual(3);
    expect(await Transaction.countDocuments({ flagged: true, reviewedAt: { $exists: true } })).toBeGreaterThanOrEqual(1);
    expect(await Transaction.countDocuments({ status: 'failed' })).toBeGreaterThanOrEqual(1);
    expect(await KycDocument.countDocuments({ status: 'pending' })).toBe(2);
    expect(await Account.countDocuments({ status: 'frozen' })).toBe(1);
    for (const doc of await KycDocument.find().select('+storagePath')) {
      expect((await fs.readFile(resolveStoragePath(doc.storagePath))).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('lets every documented demo user sign in', async () => {
    for (const p of PEOPLE) {
      const res = await request(app).post('/api/auth/login').send({ email: p.email, password: DEMO_CUSTOMER_PASSWORD });
      expect(res.status, p.email).toBe(200);
    }
    for (const a of ADMINS) {
      const res = await request(app).post('/api/admin/auth/login').send({ email: a.email, password: DEMO_ADMIN_PASSWORD });
      expect(res.status, a.email).toBe(200);
      expect(res.body.data.user.effectivePermissions.length).toBeGreaterThan(0);
    }
  });

  it('works end to end: a seeded customer sees data, and a seeded admin sees the platform', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'aarav.mehta@example.com', password: DEMO_CUSTOMER_PASSWORD });
    const aarav = { cookie: jar(login), csrf: cookieMap(login).bank_csrf };
    const dash = (await as(request(app).get('/api/customers/dashboard'), aarav)).body.data;
    expect(dash.accounts).toHaveLength(3);
    expect(dash.recent).toHaveLength(5);
    expect(dash.trend.filter((m) => m.deposits > 0).length).toBeGreaterThanOrEqual(4);

    const root = await adminSignIn(app, 'superadmin');
    const platform = (await as(request(app).get('/api/admin/dashboard'), root)).body.data;
    expect(platform.totals.customers).toBe(PEOPLE.length + 0);
    expect(platform.totals.pendingKyc).toBe(2);
    expect(platform.totals.alerts).toBe(result.summary.flaggedOpen);
    expect(await Admin.countDocuments()).toBe(ADMINS.length + 1);
  });
});

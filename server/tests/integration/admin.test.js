import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import request from 'supertest';
import app from '../../app.js';
import { Account, Admin, AuditLog, Customer, KycDocument, LedgerEntry, Notification, Session, Transaction } from '../../models/index.js';
import { ADMIN_PASSWORD, adminSignIn, as, cookieMap, jar, signUp, startTestDb } from '../helpers/session.js';
import { generateAccountNumber } from '../../utils/accountNumber.js';
import { ROLES, can } from '../../config/rbac.js';
import { uploadRoot } from '../../utils/storage.js';

let db;
const uid = () => crypto.randomUUID();
const bin = (res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };

const get = (who, url) => as(request(app).get(url), who);
const put = (who, url, body) => as(request(app).put(url), who).send(body);
const post = (who, url, body) => as(request(app).post(url), who).send(body);
const adminLogin = (email, password) => request(app).post('/api/admin/auth/login').send({ email, password });
const money = (who, path, body) => as(request(app).post(`/api/transactions/${path}`), who).set('Idempotency-Key', uid()).send(body);
const uploadKyc = (who, docType = 'aadhaar') =>
  as(request(app).post('/api/customers/kyc'), who).attach('document', Buffer.from('%PDF-1.4\nkyc test'), { filename: 'id.pdf', contentType: 'application/pdf' }).field('docType', docType);

async function customer({ funds = 0, verified = true, name } = {}) {
  const who = await signUp(app, name ? { name } : {});
  if (verified) await Customer.updateOne({ _id: who.id }, { kycStatus: 'verified' });
  const account = await Account.create({ customerId: who.id, accountNumber: generateAccountNumber(), accountType: 'savings', balance: funds });
  return { who, account };
}

beforeAll(async () => { db = await startTestDb('bank_admin_test'); });
afterAll(async () => { await db.stop(); await fs.rm(uploadRoot, { recursive: true, force: true }); });
beforeEach(async () => {
  await Promise.all([Customer, Admin, Account, Transaction, Notification, KycDocument, Session].map((m) => m.deleteMany({})));
  await Promise.all([LedgerEntry, AuditLog].map((m) => m.collection.deleteMany({})));
});

describe('access control', () => {
  it('rejects anonymous callers and customer sessions on every admin route', async () => {
    const me = await signUp(app);
    const asAdminCookie = me.cookie.replace('bank_at=', 'bank_admin_at=');
    for (const url of ['/api/admin/dashboard', '/api/admin/customers', '/api/admin/admins', '/api/admin/audit-logs']) {
      expect((await request(app).get(url)).status, url).toBe(401);
      expect((await request(app).get(url).set('Cookie', asAdminCookie)).status, url).toBe(401);
      expect((await get(me, url)).status, url).toBe(401); // a customer's own cookies do not work either
    }
  });

  it('gives each role exactly the endpoints its permissions allow', async () => {
    const endpoints = [
      ['/api/admin/customers', 'customers:read'], ['/api/admin/accounts', 'accounts:read'],
      ['/api/admin/transactions', 'transactions:read'], ['/api/admin/kyc', 'kyc:review'],
      ['/api/admin/fraud', 'fraud:read'], ['/api/admin/audit-logs', 'audit:read'],
      ['/api/admin/admins', 'admins:manage'], ['/api/admin/reports/customers', 'reports:read'],
    ];
    for (const role of ROLES) {
      const who = await adminSignIn(app, role);
      expect((await get(who, '/api/admin/dashboard')).status).toBe(200);
      for (const [url, permission] of endpoints) {
        expect((await get(who, url)).status, `${role} ${url}`).toBe(can({ role }, permission) ? 200 : 403);
      }
    }
  });

  it('requires the CSRF header on admin changes', async () => {
    const ops = await adminSignIn(app, 'operations');
    const { account } = await customer();
    const res = await request(app).put(`/api/admin/accounts/${account.id}/freeze`).set('Cookie', ops.cookie).send({ frozen: true, reason: 'Testing CSRF' });
    expect(res.status).toBe(403);
    expect((await Account.findById(account._id)).status).toBe('active');
  });
});

describe('dashboard', () => {
  it('shows only the sections an admin may see', async () => {
    const officer = await adminSignIn(app, 'kyc_officer');
    const { totals, trend, recent } = (await get(officer, '/api/admin/dashboard')).body.data;
    expect(totals.pendingKyc).toBe(0);
    expect(totals.customers).toBe(0);
    for (const k of ['accounts', 'deposits', 'withdrawals', 'volume', 'alerts']) expect(totals[k], k).toBeNull();
    expect([trend, recent]).toEqual([null, null]);
  });

  it('reports platform totals to a super admin', async () => {
    const { who, account } = await customer();
    await customer();
    await money(who, 'deposit', { accountId: account.id, amount: 100_000 });
    await money(who, 'withdraw', { accountId: account.id, amount: 20_000 });
    const root = await adminSignIn(app, 'superadmin');
    const d = (await get(root, '/api/admin/dashboard')).body.data;
    expect(d.totals).toMatchObject({ customers: 2, accounts: 2, deposits: 100_000, withdrawals: 20_000, volume: 120_000, alerts: 0 });
    expect(d.byType).toEqual([{ name: 'Deposits', value: 83 }, { name: 'Withdrawals', value: 17 }, { name: 'Transfers', value: 0 }]);
    expect(d.trend).toHaveLength(6);
    expect(d.trend.at(-1)).toMatchObject({ deposits: 100_000, withdrawals: 20_000 });
    expect(d.recent.length).toBeGreaterThan(0);
  });
});

describe('customers and accounts lists', () => {
  it('lists, filters and searches customers without exposing sensitive fields', async () => {
    await customer({ name: 'Priya Nair' });
    await customer({ name: 'Rohan Kapoor', verified: false });
    const ops = await adminSignIn(app, 'auditor');
    const all = await get(ops, '/api/admin/customers');
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0]).toMatchObject({ accounts: 1 });
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|address|dob|Lake View/);
    expect((await get(ops, '/api/admin/customers?kycStatus=pending')).body.data.map((c) => c.name)).toEqual(['Rohan Kapoor']);
    expect((await get(ops, '/api/admin/customers?q=priya')).body.data).toHaveLength(1);
    expect((await get(ops, '/api/admin/customers?q=.*')).body.meta.total).toBe(0);
    expect((await get(ops, '/api/admin/customers?limit=1&page=2')).body.data).toHaveLength(1);
    expect((await get(ops, '/api/admin/customers?kycStatus=weird')).status).toBe(400);
  });

  it('lists accounts with owners and filters', async () => {
    const a = await customer({ funds: 5_000, name: 'Meera Iyer' });
    await customer();
    await Account.updateOne({ _id: a.account._id }, { status: 'frozen' });
    const ops = await adminSignIn(app, 'operations');
    const all = (await get(ops, '/api/admin/accounts')).body;
    expect(all.meta.total).toBe(2);
    expect((await get(ops, '/api/admin/accounts?status=frozen')).body.data[0]).toMatchObject({ balance: 5_000, owner: { name: 'Meera Iyer' } });
    expect((await get(ops, '/api/admin/accounts?q=meera')).body.meta.total).toBe(1);
    expect((await get(ops, `/api/admin/accounts?q=${a.account.accountNumber.slice(0, 6)}`)).body.meta.total).toBe(1);
  });
});

describe('freezing accounts', () => {
  it('freezes with a reason, blocks the customer, notifies and audits; then unfreezes', async () => {
    const { who, account } = await customer({ funds: 50_000 });
    const ops = await adminSignIn(app, 'operations');

    expect((await put(ops, `/api/admin/accounts/${account.id}/freeze`, { frozen: true })).status).toBe(400); // reason required
    const res = await put(ops, `/api/admin/accounts/${account.id}/freeze`, { frozen: true, reason: 'Suspicious pattern' });
    expect(res.status).toBe(200);
    expect(res.body.data.account).toMatchObject({ status: 'frozen', statusReason: 'Suspicious pattern' });

    expect((await money(who, 'withdraw', { accountId: account.id, amount: 1_000 })).body.code).toBe('ACCOUNT_FROZEN');
    expect(await Notification.countDocuments({ customerId: who.id, title: 'Account frozen' })).toBe(1);
    const log = await AuditLog.findOne({ action: 'ACCOUNT_FROZEN' });
    expect(log).toMatchObject({ actorModel: 'Admin', entityType: 'Account' });
    expect(log.actorId.toString()).toBe(ops.id);

    expect((await put(ops, `/api/admin/accounts/${account.id}/freeze`, { frozen: false })).status).toBe(200);
    expect((await money(who, 'withdraw', { accountId: account.id, amount: 1_000 })).status).toBe(201);
  });

  it('lets only the right roles do it, and handles odd cases', async () => {
    const { account } = await customer({ funds: 1_000 });
    const [auditor, officer, ops] = [await adminSignIn(app, 'auditor'), await adminSignIn(app, 'kyc_officer'), await adminSignIn(app, 'operations')];
    const body = { frozen: true, reason: 'Fraud check' };
    expect((await put(auditor, `/api/admin/accounts/${account.id}/freeze`, body)).status).toBe(403);
    expect((await put(officer, `/api/admin/accounts/${account.id}/freeze`, body)).status).toBe(403);
    expect((await put(ops, '/api/admin/accounts/65f000000000000000000001/freeze', body)).status).toBe(404);
    expect((await put(ops, `/api/admin/accounts/${account.id}/status`, { status: 'closed', reason: 'Closing it' })).body.code).toBe('BALANCE_NOT_ZERO');
    await Account.updateOne({ _id: account._id }, { balance: 0 });
    expect((await put(ops, `/api/admin/accounts/${account.id}/status`, { status: 'closed', reason: 'Customer request' })).status).toBe(200);
    expect((await put(ops, `/api/admin/accounts/${account.id}/freeze`, body)).body.code).toBe('ACCOUNT_CLOSED');
  });
});

describe('transaction monitoring', () => {
  it('shows every transaction with full detail and powerful filters', async () => {
    const [a, b] = [await customer({ name: 'Aarav Mehta' }), await customer()];
    await money(a.who, 'deposit', { accountId: a.account.id, amount: 45_000_000 });
    await money(a.who, 'withdraw', { accountId: a.account.id, amount: 2_000 });
    await money(a.who, 'transfer', { fromAccountId: a.account.id, toAccountNumber: b.account.accountNumber, amount: 5_000, description: 'Rent' });
    const audit = await adminSignIn(app, 'auditor');

    const all = (await get(audit, '/api/admin/transactions')).body;
    expect(all.meta.total).toBe(3);
    const transfer = all.data.find((t) => t.type === 'transfer');
    expect(transfer).toMatchObject({ account: a.account.accountNumber, counterparty: b.account.accountNumber, customer: { name: 'Aarav Mehta' } });
    expect((await get(audit, '/api/admin/transactions?flagged=true')).body.meta.total).toBe(1);
    expect((await get(audit, '/api/admin/transactions?type=withdrawal')).body.meta.total).toBe(1);
    expect((await get(audit, `/api/admin/transactions?accountNumber=${b.account.accountNumber}`)).body.meta.total).toBe(1);
    expect((await get(audit, '/api/admin/transactions?minAmount=3000&maxAmount=10000')).body.data).toHaveLength(1);
    expect((await get(audit, '/api/admin/transactions?q=rent')).body.meta.total).toBe(1);
    expect((await get(audit, `/api/admin/transactions?accountNumber=${generateAccountNumber()}`)).body.meta.total).toBe(0);
  });
});

describe('KYC review', () => {
  it('approves a document, verifies the customer and unlocks money movement', async () => {
    const { who, account } = await customer({ verified: false });
    expect((await money(who, 'deposit', { accountId: account.id, amount: 1_000 })).body.code).toBe('KYC_REQUIRED');
    await uploadKyc(who);

    const officer = await adminSignIn(app, 'kyc_officer');
    const queue = (await get(officer, '/api/admin/kyc')).body;
    expect(queue.meta.total).toBe(1);
    expect(queue.data[0]).toMatchObject({ docType: 'aadhaar', status: 'pending', customer: { kycStatus: 'pending' } });
    expect(JSON.stringify(queue)).not.toMatch(/storagePath|kyc[\\/]/);

    const res = await put(officer, `/api/admin/kyc/${queue.data[0].id}`, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect((await Customer.findById(who.id)).kycStatus).toBe('verified');
    expect(await Notification.countDocuments({ customerId: who.id, title: 'KYC verified' })).toBe(1);
    expect((await AuditLog.findOne({ action: 'KYC_APPROVED' })).actorId.toString()).toBe(officer.id);
    expect((await money(who, 'deposit', { accountId: account.id, amount: 1_000 })).status).toBe(201); // end to end

    expect((await put(officer, `/api/admin/kyc/${queue.data[0].id}`, { decision: 'approve' })).body.code).toBe('ALREADY_REVIEWED');
    expect((await get(officer, '/api/admin/kyc')).body.meta.total).toBe(0);
    expect((await get(officer, '/api/admin/kyc?status=approved')).body.data[0].reviewedBy).toMatch(/kyc_officer/);
  });

  it('rejects with a reason the customer can see, and only rejects the customer when nothing else is open', async () => {
    const { who } = await customer({ verified: false });
    await uploadKyc(who); await uploadKyc(who, 'pan');
    const officer = await adminSignIn(app, 'kyc_officer');
    const [first, second] = (await get(officer, '/api/admin/kyc')).body.data;

    expect((await put(officer, `/api/admin/kyc/${first.id}`, { decision: 'reject' })).status).toBe(400); // reason required
    expect((await put(officer, `/api/admin/kyc/${first.id}`, { decision: 'reject', reason: 'Photo is blurry' })).status).toBe(200);
    expect((await Customer.findById(who.id)).kycStatus).toBe('pending'); // second document still waiting

    await put(officer, `/api/admin/kyc/${second.id}`, { decision: 'reject', reason: 'Name does not match' });
    const status = (await get(who, '/api/customers/kyc-status')).body.data;
    expect(status).toMatchObject({ status: 'rejected', rejectReason: 'Name does not match' });
    expect(await Notification.countDocuments({ customerId: who.id, title: 'KYC document rejected' })).toBe(2);
  });

  it('serves the document as a safe download, audits the view and limits who may open it', async () => {
    const { who } = await customer({ verified: false });
    await uploadKyc(who);
    const officer = await adminSignIn(app, 'kyc_officer');
    const [doc] = (await get(officer, '/api/admin/kyc')).body.data;

    const file = await get(officer, `/api/admin/kyc/${doc.id}/file`).buffer(true).parse(bin);
    expect(file.status).toBe(200);
    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(await AuditLog.countDocuments({ action: 'KYC_DOCUMENT_VIEWED' })).toBe(1);

    expect((await get(await adminSignIn(app, 'auditor'), `/api/admin/kyc/${doc.id}/file`)).status).toBe(403);
    expect((await get(officer, '/api/admin/kyc/65f000000000000000000001/file')).status).toBe(404);
    expect((await put(officer, '/api/admin/kyc/65f000000000000000000001', { decision: 'approve' })).status).toBe(404);
  });
});

describe('fraud monitoring', () => {
  it('queues flagged transactions, grades them, and lets operations mark them reviewed', async () => {
    const { who, account } = await customer();
    await money(who, 'deposit', { accountId: account.id, amount: 45_000_000 });
    const [ops, auditor] = [await adminSignIn(app, 'operations'), await adminSignIn(app, 'auditor')];

    const queue = (await get(auditor, '/api/admin/fraud')).body;
    expect(queue.meta.total).toBe(1);
    expect(queue.data[0]).toMatchObject({ severity: 'high', reasons: ['Unusually large amount'], reviewed: false, type: 'deposit' });
    expect((await get(auditor, '/api/admin/fraud?severity=medium')).body.meta.total).toBe(0);
    expect((await get(await adminSignIn(app, 'superadmin'), '/api/admin/dashboard')).body.data.totals.alerts).toBe(1);

    const id = queue.data[0].id;
    expect((await put(auditor, `/api/admin/fraud/${id}/review`, {})).status).toBe(403); // read-only role
    expect((await put(ops, `/api/admin/fraud/${id}/review`, { note: 'Salary payout, verified' })).status).toBe(200);
    expect((await put(ops, `/api/admin/fraud/${id}/review`, {})).body.code).toBe('ALREADY_REVIEWED');
    expect((await get(ops, '/api/admin/fraud')).body.meta.total).toBe(0);
    const done = (await get(ops, '/api/admin/fraud?reviewed=true')).body.data[0];
    expect(done).toMatchObject({ reviewed: true, reviewNote: 'Salary payout, verified' });
    expect(done.reviewedBy).toMatch(/operations/);
    expect(await AuditLog.countDocuments({ action: 'FRAUD_REVIEWED' })).toBe(1);
    expect((await put(ops, '/api/admin/fraud/65f000000000000000000001/review', {})).status).toBe(404);
  });
});

describe('audit logs', () => {
  it('lets auditors search who did what, with names', async () => {
    const { who, account } = await customer({ funds: 1_000 });
    const ops = await adminSignIn(app, 'operations');
    await put(ops, `/api/admin/accounts/${account.id}/freeze`, { frozen: true, reason: 'Fraud check' });
    const auditor = await adminSignIn(app, 'auditor');

    const logs = (await get(auditor, '/api/admin/audit-logs?action=account_frozen')).body;
    expect(logs.meta.total).toBe(1);
    expect(logs.data[0]).toMatchObject({ action: 'ACCOUNT_FROZEN', actor: { type: 'Admin', name: expect.stringContaining('operations') } });
    const registered = (await get(auditor, '/api/admin/audit-logs?action=REGISTER')).body.data[0];
    expect(registered.actor).toMatchObject({ type: 'Customer', id: who.id });
    expect((await get(auditor, '/api/admin/audit-logs?q=ACCOUNT_')).body.meta.total).toBeGreaterThanOrEqual(1);
    expect((await get(auditor, '/api/admin/audit-logs?limit=1&page=2')).body.data).toHaveLength(1);
    expect((await get(ops, '/api/admin/audit-logs')).status).toBe(403);
  });
});

describe('admin management', () => {
  it('creates an admin with a one-time password they can use to sign in', async () => {
    const root = await adminSignIn(app, 'superadmin');
    const res = await post(root, '/api/admin/admins', { name: 'Farah Khan', email: 'Farah@Northwind.test', role: 'kyc_officer' });
    expect(res.status).toBe(201);
    const { admin, temporaryPassword } = res.body.data;
    expect(admin).toMatchObject({ email: 'farah@northwind.test', role: 'kyc_officer', isActive: true, effectivePermissions: ['customers:read', 'kyc:review'] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    expect((await adminLogin('farah@northwind.test', temporaryPassword)).status).toBe(200);
    expect((await get(root, '/api/admin/admins')).body.data).toHaveLength(2);
    expect((await post(root, '/api/admin/admins', { name: 'Farah Again', email: 'farah@northwind.test', role: 'auditor' })).body.code).toBe('EMAIL_TAKEN');
    expect(await AuditLog.countDocuments({ action: 'ADMIN_CREATED' })).toBe(1);
  });

  it('stops anyone but a super admin from creating or changing super admins', async () => {
    const ops = await adminSignIn(app, 'operations', { permissions: ['admins:manage'] });
    const root = await adminSignIn(app, 'superadmin');
    expect((await post(ops, '/api/admin/admins', { name: 'Sneaky Admin', email: 's@northwind.test', role: 'superadmin' })).body.code).toBe('SUPERADMIN_ONLY');
    expect((await put(ops, `/api/admin/admins/${root.id}`, { isActive: false })).body.code).toBe('SUPERADMIN_ONLY');
    expect((await post(await adminSignIn(app, 'kyc_officer'), '/api/admin/admins', { name: 'Nope Admin', email: 'n@northwind.test', role: 'auditor' })).status).toBe(403);
  });

  it('protects admins from locking themselves out', async () => {
    const root = await adminSignIn(app, 'superadmin');
    for (const body of [{ isActive: false }, { role: 'auditor' }, { permissions: [] }]) {
      expect((await put(root, `/api/admin/admins/${root.id}`, body)).body.code).toBe('CANNOT_MODIFY_SELF');
    }
    expect((await put(root, `/api/admin/admins/${root.id}`, { name: 'Renamed Root' })).status).toBe(200);
    expect((await post(root, `/api/admin/admins/${root.id}/reset-password`, {})).body.code).toBe('CANNOT_MODIFY_SELF');
  });

  it('applies a role change on the very next request', async () => {
    const root = await adminSignIn(app, 'superadmin');
    const ops = await adminSignIn(app, 'operations');
    expect((await get(ops, '/api/admin/accounts')).status).toBe(200);
    expect((await put(root, `/api/admin/admins/${ops.id}`, { role: 'kyc_officer' })).status).toBe(200);
    expect((await get(ops, '/api/admin/accounts')).status).toBe(403);
    expect((await get(ops, '/api/admin/kyc')).status).toBe(200);
    expect((await put(root, `/api/admin/admins/${ops.id}`, { permissions: ['accounts:read'] })).status).toBe(200);
    expect((await get(ops, '/api/admin/accounts')).status).toBe(200);
  });

  it('signs a deactivated admin out everywhere and blocks sign-in', async () => {
    const root = await adminSignIn(app, 'superadmin');
    const target = await adminSignIn(app, 'operations');
    expect((await put(root, `/api/admin/admins/${target.id}`, { isActive: false })).status).toBe(200);
    expect((await get(target, '/api/admin/accounts')).status).toBe(401);
    expect((await adminLogin(target.email, ADMIN_PASSWORD)).status).toBe(403);
    expect(await AuditLog.countDocuments({ action: 'ADMIN_DEACTIVATED' })).toBe(1);
    expect((await put(root, `/api/admin/admins/${target.id}`, { isActive: true })).status).toBe(200);
    expect((await adminLogin(target.email, ADMIN_PASSWORD)).status).toBe(200);
  });

  it('resets a password: the old one stops working, the temporary one works once set', async () => {
    const root = await adminSignIn(app, 'superadmin');
    const target = await adminSignIn(app, 'auditor');
    const { temporaryPassword } = (await post(root, `/api/admin/admins/${target.id}/reset-password`, {})).body.data;
    expect((await get(target, '/api/admin/dashboard')).status).toBe(401); // old sessions revoked
    expect((await adminLogin(target.email, ADMIN_PASSWORD)).status).toBe(401);
    expect((await adminLogin(target.email, temporaryPassword)).status).toBe(200);
  });

  it('validates updates', async () => {
    const root = await adminSignIn(app, 'superadmin');
    const target = await adminSignIn(app, 'auditor');
    for (const body of [{}, { role: 'root' }, { permissions: ['god:mode'] }, { passwordHash: 'x' }]) {
      expect((await put(root, `/api/admin/admins/${target.id}`, body)).status).toBe(400);
    }
    expect((await put(root, '/api/admin/admins/65f000000000000000000001', { isActive: false })).status).toBe(404);
  });
});

describe('reports', () => {
  it('produces JSON and CSV reports and logs each one', async () => {
    const { who, account } = await customer();
    await money(who, 'deposit', { accountId: account.id, amount: 123_456 });
    await money(who, 'withdraw', { accountId: account.id, amount: 456 });
    await money(who, 'withdraw', { accountId: account.id, amount: 99_999_999 }); // fails
    const ops = await adminSignIn(app, 'operations');

    const json = (await get(ops, '/api/admin/reports/transactions')).body.data;
    expect(json.columns).toContain('amount_inr');
    expect(json.rows).toHaveLength(3);
    expect(json.rows.find((r) => r.type === 'deposit').amount_inr).toBe('1234.56');

    const csv = await get(ops, '/api/admin/reports/transactions?format=csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="transactions-report-/);
    expect(csv.text.split('\r\n')[0]).toBe('reference,date,type,status,amount_inr,account,counterparty,flagged,flag_reasons');

    const summary = (await get(ops, '/api/admin/reports/daily-summary')).body.data.rows;
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ deposits: 1, deposits_inr: '1234.56', withdrawals: 1, withdrawals_inr: '4.56', transfers: 0, failed: 1 });
    expect(await AuditLog.countDocuments({ action: 'REPORT_GENERATED' })).toBe(3);
  });

  it('does not let a malicious customer name run as a spreadsheet formula', async () => {
    await customer({ name: '=cmd|\' /C calc\'!A0' });
    const ops = await adminSignIn(app, 'operations');
    const csv = (await get(ops, '/api/admin/reports/customers?format=csv')).text;
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/\r\n=cmd/);
  });

  it('validates the type and date range, and limits who can run reports', async () => {
    const ops = await adminSignIn(app, 'operations');
    expect((await get(ops, '/api/admin/reports/everything')).status).toBe(400);
    expect((await get(ops, '/api/admin/reports/transactions?from=2026-11-07&to=2026-11-01')).status).toBe(400);
    expect((await get(ops, '/api/admin/reports/transactions?from=2020-01-01&to=2026-11-01')).status).toBe(400);
    expect((await get(ops, '/api/admin/reports/transactions?format=xml')).status).toBe(400);
    expect((await get(await adminSignIn(app, 'kyc_officer'), '/api/admin/reports/customers')).status).toBe(403);
  });
});

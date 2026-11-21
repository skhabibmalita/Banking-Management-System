import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Account, Admin, AuditLog, Customer, KycDocument, LedgerEntry, Notification, Transaction } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { saveKycFile } from '../utils/storage.js';
import {
  ACCOUNTS, ADMINS, DEMO_ADMIN_PASSWORD, DEMO_CUSTOMER_PASSWORD, PEOPLE, accountNumberOf,
} from './demoPlan.js';

const { ObjectId } = mongoose.Types;

// Small seeded random generator, so every run produces the same demo world.
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (daysAgo, hour = 10, minute = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};

// A tiny but valid PDF, so the KYC download in the admin console opens in any viewer.
const demoPdf = (label) => Buffer.from(
  `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
  `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
  `4 0 obj<</Length 60>>stream\nBT /F1 12 Tf 20 50 Td (DEMO KYC: ${label}) Tj ET\nendstream endobj\n` +
  `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`
);

const WITHDRAWALS = ['ATM withdrawal', 'Electricity bill', 'Grocery run', 'Mobile recharge', 'Insurance premium', 'Cash withdrawal'];
const TRANSFER_NOTES = ['Rent', 'Split dinner', 'Gift', 'Loan repayment', 'Trip share', 'Utilities share'];

// Creates the whole demo world directly in the database. Ledger rows are built from the same
// transaction list that sets the balances, so every balance is fully explained by the ledger.
export async function seedDemo({ log = () => {} } = {}) {
  const rand = rng(2026);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

  // ---- Admins -------------------------------------------------------------------------------
  const adminHash = await hashPassword(DEMO_ADMIN_PASSWORD);
  const adminDocs = ADMINS.map((a) => ({ _id: new ObjectId(), ...a, passwordHash: adminHash, isActive: true, createdAt: at(210) }));
  await Admin.insertMany(adminDocs);
  const admin = Object.fromEntries(adminDocs.map((a) => [a.key, a]));
  log(`admins: ${adminDocs.length}`);

  // ---- Customers and accounts ---------------------------------------------------------------
  const customerHash = await hashPassword(DEMO_CUSTOMER_PASSWORD);
  const customers = PEOPLE.map((p) => ({
    _id: new ObjectId(), name: p.name, email: p.email, phone: p.phone, dob: new Date(p.dob), address: p.address,
    passwordHash: customerHash, kycStatus: p.kyc, kycRejectReason: p.rejectReason, isActive: true,
    createdAt: at(p.joinedAgo), updatedAt: at(p.joinedAgo), lastLoginAt: p.joinedAgo > 30 ? at(rand() < 0.5 ? 1 : 2, 9, 30) : undefined,
  }));
  await Customer.insertMany(customers);
  const customer = Object.fromEntries(PEOPLE.map((p, i) => [p.key, customers[i]]));

  const accounts = ACCOUNTS.map((a) => {
    const person = PEOPLE.find((p) => p.key === a.person);
    const created = at(person.joinedAgo - 1);
    return { _id: new ObjectId(), customerId: customer[a.person]._id, accountNumber: a.number, accountType: a.type, balance: 0, currency: 'INR', status: 'active', createdAt: created, updatedAt: created };
  });
  const acct = Object.fromEntries(ACCOUNTS.map((a, i) => [a.key, accounts[i]]));
  log(`customers: ${customers.length}, accounts: ${accounts.length}`);

  // ---- Money movement: a planned list of operations, applied in time order ------------------
  const ops = [];
  const add = (from, type, amount, description, ago, hour = 10, minute = 0, extra = {}) =>
    ops.push({ from, type, amount, description, when: at(ago, hour, minute), ...extra });
  const rupees = (r) => r * 100;

  const earners = ['aarav', 'priya', 'ananya', 'vikram', 'isha', 'neha'];
  const main = { aarav: 'aarav:savings', priya: 'priya:savings', ananya: 'ananya:savings', vikram: 'vikram:current', isha: 'isha:savings', neha: 'neha:savings' };

  for (let m = 0; m < 6; m += 1) {
    const base = 170 - m * 28;
    for (const key of earners) {
      add(main[key], 'deposit', rupees(between(65_000, 180_000)), 'Salary credit', base, 9, between(0, 40));
      for (let i = 0; i < 3; i += 1) add(main[key], 'withdrawal', rupees(between(500, 9_000)), pick(WITHDRAWALS), base - between(2, 20), between(9, 18), between(0, 59));
      const others = earners.filter((k) => k !== key);
      for (let i = 0; i < 2; i += 1) add(main[key], 'transfer', rupees(between(1_000, 20_000)), pick(TRANSFER_NOTES), base - between(3, 22), between(9, 20), between(0, 59), { to: main[pick(others)] });
    }
    add('aarav:current', 'deposit', rupees(30_000), 'Freelance payment', base - 4, 14, 15);
    add('aarav:savings', 'transfer', rupees(10_000), 'Top-up current account', base - 6, 11, 5, { to: 'aarav:current' });
    add('aarav:salary', 'deposit', rupees(5_000 + m * 2_500), 'Salary credit', base - 1, 8, 45);
    add('priya:current', 'deposit', rupees(between(8_000, 20_000)), 'Client invoice', base - 7, 15, 30);
    add('neha:current', 'deposit', rupees(between(5_000, 15_000)), 'Consulting fee', base - 9, 16, 0);
  }

  // Stories that show off the admin console.
  add('vikram:current', 'deposit', rupees(650_000), 'Property sale proceeds', 5, 11, 20, { flags: ['LARGE_AMOUNT'] }); // open fraud alert
  add('isha:savings', 'deposit', rupees(480_000), 'Sale of shares', 40, 12, 5, { flags: ['LARGE_AMOUNT'], reviewed: { by: 'sam', note: 'Broker statement checked. Genuine.' } });
  for (let i = 0; i < 5; i += 1) { // five quick transfers in a row: the last one trips the rapid-transfer rule
    add('ananya:savings', 'transfer', rupees(500), 'Event tickets', 2, 9, 10 + i, { to: main.priya, ...(i === 4 ? { flags: ['RAPID_TRANSFERS'] } : {}) });
  }
  add('isha:savings', 'deposit', rupees(90_000), 'Cash deposit', 1, 14, 0);
  add('isha:savings', 'withdrawal', rupees(85_000), 'Cash withdrawal', 1, 14, 12, { flags: ['DEPOSIT_THEN_WITHDRAW'] });
  add('aarav:savings', 'withdrawal', 900_000_000, 'ATM withdrawal', 6, 18, 40, { failed: 'Insufficient balance' });

  ops.sort((a, b) => a.when - b.when);

  const balance = Object.fromEntries(ACCOUNTS.map((a) => [a.key, 0]));
  const txns = [];
  const ledger = [];
  const used = new Set();
  const reference = () => { let r; do { r = `TXN${Math.floor(rand() * 2 ** 48).toString(16).toUpperCase().padStart(12, '0')}${crypto.randomBytes(2).toString('hex').toUpperCase()}`; } while (used.has(r)); used.add(r); return r; };

  for (const op of ops) {
    const src = acct[op.from];
    const base = { _id: new ObjectId(), accountId: src._id, counterpartyAccountId: op.to ? acct[op.to]._id : undefined, type: op.type, amount: op.amount, description: op.description, date: op.when, createdAt: op.when, updatedAt: op.when, reference: reference(), initiatedBy: src.customerId };
    if (op.failed) { txns.push({ ...base, status: 'failed', failureReason: op.failed }); continue; }
    if (op.type !== 'deposit' && balance[op.from] < op.amount) continue; // keep every balance non-negative
    const flags = op.flags ?? [];
    const txn = { ...base, status: 'completed', flagged: flags.length > 0, flagReasons: flags };
    if (op.reviewed) Object.assign(txn, { reviewedBy: admin[op.reviewed.by]._id, reviewedAt: new Date(op.when.getTime() + 2 * 86_400_000), reviewNote: op.reviewed.note });
    txns.push(txn);

    const entry = (key, direction) => ({ transactionId: txn._id, accountId: acct[key]._id, direction, amount: op.amount, balanceAfter: balance[key], createdAt: op.when });
    if (op.type === 'deposit') { balance[op.from] += op.amount; ledger.push(entry(op.from, 'credit')); }
    else {
      balance[op.from] -= op.amount; ledger.push(entry(op.from, 'debit'));
      if (op.type === 'transfer') { balance[op.to] += op.amount; ledger.push(entry(op.to, 'credit')); }
    }
  }
  await Transaction.insertMany(txns, { ordered: true });
  await LedgerEntry.insertMany(ledger, { ordered: true });

  // Aarav's salary account was frozen by operations after a security review (shows the frozen state).
  const frozenKey = 'aarav:salary';
  for (const a of ACCOUNTS) {
    const set = { balance: balance[a.key] };
    if (a.key === frozenKey) Object.assign(set, { status: 'frozen', statusReason: 'Security review: unusual login activity', statusChangedBy: admin.sam._id, statusChangedByModel: 'Admin' });
    await Account.updateOne({ _id: acct[a.key]._id }, { $set: set });
  }
  log(`transactions: ${txns.length}, ledger entries: ${ledger.length}`);

  // ---- KYC documents (real files on disk, so admins can download them) ----------------------
  const kycDocs = [];
  for (const p of PEOPLE) {
    const doc = p.doc ?? (p.kyc === 'verified' ? { type: p.key.length % 2 ? 'aadhaar' : 'pan', status: 'approved', ago: p.joinedAgo - 1 } : null);
    if (!doc) continue;
    const buffer = demoPdf(`${p.name} - ${doc.type}`);
    const storagePath = await saveKycFile(customer[p.key]._id, buffer, 'pdf');
    const when = at(doc.ago, 13);
    kycDocs.push({
      _id: new ObjectId(), customerId: customer[p.key]._id, docType: doc.type, originalName: `${doc.type}-${p.key}.pdf`, storagePath,
      mimeType: 'application/pdf', size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      status: doc.status, createdAt: when, updatedAt: when,
      ...(doc.status !== 'pending' ? { reviewedBy: admin.farah._id, reviewedAt: new Date(when.getTime() + 86_400_000), ...(doc.status === 'rejected' ? { rejectReason: p.rejectReason } : {}) } : {}),
    });
  }
  await KycDocument.insertMany(kycDocs);
  log(`KYC documents: ${kycDocs.length}`);

  // ---- Notifications and audit trail --------------------------------------------------------
  const notes = PEOPLE.map((p) => ({ customerId: customer[p.key]._id, title: 'Welcome to Northwind', message: 'Complete KYC verification to unlock transfers.', type: 'info', read: true, createdAt: at(p.joinedAgo) }));
  const aarav = customer.aarav._id;
  notes.push(
    { customerId: aarav, title: 'Transfer sent', message: 'Rent sent successfully.', type: 'success', read: false, createdAt: at(1, 8) },
    { customerId: aarav, title: 'Account frozen', message: 'Your salary account ending 4030 was frozen after a security review.', type: 'warning', read: false, createdAt: at(3, 11) },
    { customerId: aarav, title: 'Withdrawal failed', message: 'Your withdrawal could not be completed. Your balance was not changed.', type: 'error', read: true, createdAt: at(6, 18) },
    { customerId: aarav, title: 'KYC verified', message: 'Your identity is verified. All account features are unlocked.', type: 'success', read: true, createdAt: at(199, 10) },
    { customerId: customer.meera._id, title: 'KYC document rejected', message: `Your document was rejected: ${PEOPLE.find((p) => p.key === 'meera').rejectReason}`, type: 'error', read: false, createdAt: at(8, 10) },
    { customerId: customer.rohan._id, title: 'KYC documents received', message: 'Review usually takes 1 to 2 business days.', type: 'info', read: false, createdAt: at(2, 14) },
  );
  await Notification.insertMany(notes);

  const audit = [];
  const log_ = (actorModel, actorId, action, entityType, entityId, ago, hour, ip, meta) =>
    audit.push({ actorModel, actorId, action, entityType, entityId: entityId ? String(entityId) : undefined, ip, meta, createdAt: at(ago, hour) });
  for (const a of adminDocs.slice(1)) log_('Admin', admin.neel._id, 'ADMIN_CREATED', 'Admin', a._id, 205, 9, '10.0.4.9', { role: a.role });
  for (const p of PEOPLE) {
    log_('Customer', customer[p.key]._id, 'REGISTER', 'Customer', customer[p.key]._id, p.joinedAgo, 9, '103.21.58.4');
    if (p.kyc === 'verified') log_('Admin', admin.farah._id, 'KYC_APPROVED', 'KycDocument', null, p.joinedAgo - 1, 15, '10.0.4.21', { customerId: String(customer[p.key]._id) });
    if (p.joinedAgo > 30) log_('Customer', customer[p.key]._id, 'LOGIN_SUCCESS', 'Customer', customer[p.key]._id, 1, 9, '103.21.58.4');
  }
  log_('Admin', admin.farah._id, 'KYC_REJECTED', 'KycDocument', null, 8, 10, '10.0.4.21', { customerId: String(customer.meera._id), reason: 'Blurry photo' });
  log_('Admin', admin.sam._id, 'ACCOUNT_FROZEN', 'Account', acct[frozenKey]._id, 3, 11, '10.0.4.33', { from: 'active', to: 'frozen', reason: 'Security review: unusual login activity' });
  log_('Admin', admin.sam._id, 'FRAUD_REVIEWED', 'Transaction', null, 38, 10, '10.0.4.33');
  log_('Admin', admin.sam._id, 'REPORT_GENERATED', 'Report', 'daily-summary', 4, 12, '10.0.4.33', { format: 'csv' });
  log_('System', undefined, 'LOGIN_FAILED', 'Customer', null, 1, 3, '45.33.12.90', { email: 'unknown@example.com' });
  await AuditLog.insertMany(audit);

  const summary = {
    admins: adminDocs.length, customers: customers.length, accounts: accounts.length,
    transactions: txns.length, ledgerEntries: ledger.length, kycDocuments: kycDocs.length,
    flaggedOpen: txns.filter((t) => t.flagged && !t.reviewedAt).length,
  };
  log(`audit entries: ${audit.length}`);
  return { summary, accountNumberOf };
}

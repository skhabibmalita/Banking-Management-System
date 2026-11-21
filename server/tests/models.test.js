import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Customer, Admin, Account, Transaction, LedgerEntry } from '../models/index.js';
import { permissionsFor, can, ROLES } from '../config/rbac.js';

const id = () => new mongoose.Types.ObjectId();
const errorPaths = (doc) => Object.keys(doc.validateSync()?.errors || {});

const goodCustomer = () => ({
  name: 'Aarav Mehta', email: 'Aarav.Mehta@Example.com', phone: '+91 98765 43210',
  address: '14 Lake View Road, Pune', dob: new Date('1998-04-12'), passwordHash: 'x'.repeat(60),
});

describe('Customer', () => {
  it('accepts a valid customer and normalises the email', () => {
    const c = new Customer(goodCustomer());
    expect(c.validateSync()).toBeUndefined();
    expect(c.email).toBe('aarav.mehta@example.com');
    expect(c.kycStatus).toBe('pending');
  });

  it('rejects under-18 customers, bad email and bad phone', () => {
    const young = new Date(); young.setFullYear(young.getFullYear() - 17);
    const c = new Customer({ ...goodCustomer(), dob: young, email: 'nope', phone: 'abc' });
    expect(errorPaths(c)).toEqual(expect.arrayContaining(['dob', 'email', 'phone']));
  });

  it('requires a password hash but never serialises it', () => {
    expect(errorPaths(new Customer({ ...goodCustomer(), passwordHash: undefined }))).toContain('passwordHash');
    const json = new Customer(goodCustomer()).toJSON();
    expect(json.passwordHash).toBeUndefined();
    expect(json.failedLoginAttempts).toBeUndefined();
    expect(json.id).toBeDefined();
    expect(json._id).toBeUndefined();
  });

  it('rejects an unknown KYC status', () => {
    expect(errorPaths(new Customer({ ...goodCustomer(), kycStatus: 'maybe' }))).toContain('kycStatus');
  });
});

describe('Account', () => {
  const base = () => ({ customerId: id(), accountNumber: '4021883301', accountType: 'savings' });

  it('defaults to an active, zero-balance INR account', () => {
    const a = new Account(base());
    expect(a.validateSync()).toBeUndefined();
    expect(a).toMatchObject({ balance: 0, status: 'active', currency: 'INR' });
  });

  it('rejects negative, fractional and unsafe balances', () => {
    for (const balance of [-1, 10.5, Number.MAX_SAFE_INTEGER + 2]) {
      expect(errorPaths(new Account({ ...base(), balance }))).toContain('balance');
    }
  });

  it('rejects malformed account numbers, types and statuses', () => {
    expect(errorPaths(new Account({ ...base(), accountNumber: '123' }))).toContain('accountNumber');
    expect(errorPaths(new Account({ ...base(), accountType: 'gold' }))).toContain('accountType');
    expect(errorPaths(new Account({ ...base(), status: 'paused' }))).toContain('status');
  });
});

describe('Transaction', () => {
  const base = () => ({ accountId: id(), type: 'deposit', amount: 50000, reference: 'TXN1A2B3C4D5E6F', initiatedBy: id() });

  it('accepts a deposit with a pending default status', () => {
    const t = new Transaction(base());
    expect(t.validateSync()).toBeUndefined();
    expect(t.status).toBe('pending');
  });

  it('requires a different destination for transfers', () => {
    expect(errorPaths(new Transaction({ ...base(), type: 'transfer' }))).toContain('counterpartyAccountId');
    const accountId = id();
    expect(errorPaths(new Transaction({ ...base(), type: 'transfer', accountId, counterpartyAccountId: accountId }))).toContain('counterpartyAccountId');
    expect(new Transaction({ ...base(), type: 'transfer', counterpartyAccountId: id() }).validateSync()).toBeUndefined();
  });

  it('rejects a destination on deposits and withdrawals', () => {
    expect(errorPaths(new Transaction({ ...base(), counterpartyAccountId: id() }))).toContain('counterpartyAccountId');
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amount of [0, -100, 99.5]) expect(errorPaths(new Transaction({ ...base(), amount }))).toContain('amount');
  });

  it('rejects malformed references and idempotency keys', () => {
    expect(errorPaths(new Transaction({ ...base(), reference: 'abc' }))).toContain('reference');
    expect(errorPaths(new Transaction({ ...base(), idempotencyKey: 'short' }))).toContain('idempotencyKey');
  });
});

describe('Ledger and append-only rules', () => {
  const entry = () => ({ transactionId: id(), accountId: id(), direction: 'debit', amount: 100, balanceAfter: 900 });

  it('validates ledger entries', () => {
    expect(new LedgerEntry(entry()).validateSync()).toBeUndefined();
    expect(errorPaths(new LedgerEntry({ ...entry(), direction: 'sideways', amount: 0 }))).toEqual(expect.arrayContaining(['direction', 'amount']));
  });

  it('refuses updates and deletes', async () => {
    await expect(LedgerEntry.updateOne({}, { amount: 1 })).rejects.toThrow('append-only');
    await expect(LedgerEntry.deleteMany({})).rejects.toThrow('append-only');
  });

  it('refuses re-saving an existing entry', async () => {
    const existing = LedgerEntry.hydrate({ _id: id(), ...entry() });
    existing.amount = 999;
    await expect(existing.save()).rejects.toThrow('append-only');
  });
});

describe('Admin and RBAC', () => {
  it('only allows known roles', () => {
    const base = { name: 'Neel Sharma', email: 'neel@northwind.test', passwordHash: 'x'.repeat(60) };
    expect(new Admin({ ...base, role: 'auditor' }).validateSync()).toBeUndefined();
    expect(errorPaths(new Admin({ ...base, role: 'root' }))).toContain('role');
  });

  it('derives permissions from role plus extra grants', () => {
    expect(ROLES).toEqual(['superadmin', 'kyc_officer', 'operations', 'auditor']);
    expect(can({ role: 'kyc_officer' }, 'kyc:review')).toBe(true);
    expect(can({ role: 'kyc_officer' }, 'accounts:freeze')).toBe(false);
    expect(can({ role: 'auditor' }, 'accounts:freeze')).toBe(false);
    expect(permissionsFor({ role: 'kyc_officer', permissions: ['reports:read'] })).toContain('reports:read');
    expect(can({ role: 'superadmin' }, 'admins:manage')).toBe(true);
  });
});

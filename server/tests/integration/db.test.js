import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '../../config/db.js';
import { Customer, Account, Transaction, LedgerEntry } from '../../models/index.js';

let replSet;
const hash = 'x'.repeat(60);
const newCustomer = (n) => Customer.create({
  name: `Customer ${n}`, email: `c${n}@example.com`, phone: '+91 98765 43210',
  address: '14 Lake View Road, Pune', dob: new Date('1990-01-01'), passwordHash: hash,
});
const newAccount = (customerId, accountNumber, balance = 100000) =>
  Account.create({ customerId, accountNumber, accountType: 'savings', balance });

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(replSet.getUri('bank_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterAll(async () => {
  await disconnectDB();
  await replSet.stop();
});

beforeEach(async () => {
  await Promise.all([Customer, Account, Transaction].map((m) => m.deleteMany({})));
  await LedgerEntry.collection.deleteMany({}); // raw access: the model itself is append-only
});

describe('unique indexes', () => {
  it('rejects duplicate emails regardless of letter case', async () => {
    await newCustomer(1);
    await expect(Customer.create({
      name: 'Other Person', email: 'C1@EXAMPLE.com', phone: '+91 98765 43210',
      address: '22 Hill Road, Mumbai', dob: new Date('1992-02-02'), passwordHash: hash,
    })).rejects.toThrow(/E11000/);
  });

  it('rejects duplicate account numbers', async () => {
    const c = await newCustomer(1);
    await newAccount(c._id, '4021883301');
    await expect(newAccount(c._id, '4021883301')).rejects.toThrow(/E11000/);
  });

  it('allows one transaction per customer and idempotency key', async () => {
    const c = await newCustomer(1);
    const a = await newAccount(c._id, '4021883301');
    const base = { accountId: a._id, type: 'deposit', amount: 5000, initiatedBy: c._id, idempotencyKey: 'key-12345678' };
    await Transaction.create({ ...base, reference: 'TXNAAAAAAAAAA1' });
    await expect(Transaction.create({ ...base, reference: 'TXNAAAAAAAAAA2' })).rejects.toThrow(/E11000/);
    // Transactions without a key never collide.
    await Transaction.create({ ...base, idempotencyKey: undefined, reference: 'TXNAAAAAAAAAA3' });
    await Transaction.create({ ...base, idempotencyKey: undefined, reference: 'TXNAAAAAAAAAA4' });
  });

  it('allows each ledger direction once per transaction and account', async () => {
    const c = await newCustomer(1);
    const a = await newAccount(c._id, '4021883301');
    const t = await Transaction.create({ accountId: a._id, type: 'deposit', amount: 100, initiatedBy: c._id, reference: 'TXNBBBBBBBBBB1' });
    const entry = { transactionId: t._id, accountId: a._id, direction: 'credit', amount: 100, balanceAfter: 100100 };
    await LedgerEntry.create(entry);
    await expect(LedgerEntry.create(entry)).rejects.toThrow(/E11000/);
  });
});

describe('replica-set transactions', () => {
  it('commits both sides of a transfer together', async () => {
    const c = await newCustomer(1);
    const [from, to] = [await newAccount(c._id, '4021883301'), await newAccount(c._id, '4021883377')];
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Account.updateOne({ _id: from._id, balance: { $gte: 30000 } }, { $inc: { balance: -30000 } }, { session });
      await Account.updateOne({ _id: to._id }, { $inc: { balance: 30000 } }, { session });
    });
    await session.endSession();
    expect((await Account.findById(from._id)).balance).toBe(70000);
    expect((await Account.findById(to._id)).balance).toBe(130000);
  });

  it('rolls back everything when a step fails', async () => {
    const c = await newCustomer(1);
    const [from, to] = [await newAccount(c._id, '4021883301'), await newAccount(c._id, '4021883377')];
    const session = await mongoose.startSession();
    await expect(session.withTransaction(async () => {
      await Account.updateOne({ _id: from._id }, { $inc: { balance: -30000 } }, { session });
      await Account.updateOne({ _id: to._id }, { $inc: { balance: 30000 } }, { session });
      throw new Error('simulated failure before commit');
    })).rejects.toThrow('simulated failure');
    await session.endSession();
    expect((await Account.findById(from._id)).balance).toBe(100000);
    expect((await Account.findById(to._id)).balance).toBe(100000);
  });
});

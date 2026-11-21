import { describe, it, expect } from 'vitest';
import { evaluateRules } from '../services/fraud.service.js';
import { formatINR, maskAccount } from '../utils/money.js';
import requireIdempotencyKey from '../middleware/idempotency.js';
import { depositSchema, historyQuery, transferSchema, withdrawSchema } from '../validators/transaction.validators.js';
import { generateAccountNumber } from '../utils/accountNumber.js';

const id = '65f000000000000000000001';

describe('fraud rules', () => {
  it('flags large amounts', () => {
    expect(evaluateRules({ type: 'deposit', amount: 50_000 })).toEqual([]);
    expect(evaluateRules({ type: 'deposit', amount: 45_000_000 })).toEqual(['LARGE_AMOUNT']);
  });

  it('flags the fifth transfer inside the window, not the fourth', () => {
    expect(evaluateRules({ type: 'transfer', amount: 100, priorTransfersInWindow: 3 })).toEqual([]);
    expect(evaluateRules({ type: 'transfer', amount: 100, priorTransfersInWindow: 4 })).toEqual(['RAPID_TRANSFERS']);
  });

  it('flags moving out most of a fresh deposit', () => {
    expect(evaluateRules({ type: 'withdrawal', amount: 95_000, recentDepositTotal: 100_000 })).toEqual(['DEPOSIT_THEN_WITHDRAW']);
    expect(evaluateRules({ type: 'withdrawal', amount: 50_000, recentDepositTotal: 100_000 })).toEqual([]);
    expect(evaluateRules({ type: 'deposit', amount: 95_000, recentDepositTotal: 100_000 })).toEqual([]);
  });

  it('flags the third failure in a row', () => {
    expect(evaluateRules({ type: 'withdrawal', amount: 100, failed: true, priorFailuresInWindow: 1 })).toEqual([]);
    expect(evaluateRules({ type: 'withdrawal', amount: 100, failed: true, priorFailuresInWindow: 2 })).toEqual(['REPEATED_FAILURES']);
  });
});

describe('money formatting', () => {
  it('formats paise with Indian digit grouping', () => {
    expect(formatINR(12_345_678)).toBe('INR 1,23,456.78');
    expect(formatINR(100)).toBe('INR 1.00');
    expect(maskAccount('4021883301')).toBe('•••• 3301');
  });
});

describe('Idempotency-Key header', () => {
  const run = (key) => {
    let err; const req = { get: () => key };
    requireIdempotencyKey(req, {}, (e) => { err = e; });
    return { err, req };
  };

  it('accepts a good key and stores it on the request', () => {
    const { err, req } = run('3f1c2d4e-5a6b-47c8-9d0e-1f2a3b4c5d6e');
    expect(err).toBeUndefined();
    expect(req.idempotencyKey).toBe('3f1c2d4e-5a6b-47c8-9d0e-1f2a3b4c5d6e');
  });

  it('rejects a missing, short or malformed key', () => {
    expect(run(undefined).err.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(run('short').err.code).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(run('has spaces and $ymbols!!').err.code).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});

describe('transaction validators', () => {
  it('accepts whole-paise amounts within limits', () => {
    expect(depositSchema.safeParse({ accountId: id, amount: 50_000 }).success).toBe(true);
    expect(depositSchema.safeParse({ accountId: id, amount: 100 }).success).toBe(true);
    expect(withdrawSchema.safeParse({ accountId: id, amount: 1_000_000_000 }).success).toBe(true);
  });

  it('rejects decimals, strings, zero, negatives and oversized amounts', () => {
    for (const amount of [100.5, '5000', 0, -500, 99, 1_000_000_001, null, NaN, Infinity]) {
      expect(depositSchema.safeParse({ accountId: id, amount }).success, String(amount)).toBe(false);
    }
  });

  it('rejects unknown fields such as a balance or customer id', () => {
    expect(depositSchema.safeParse({ accountId: id, amount: 500, balance: 9 }).success).toBe(false);
    expect(withdrawSchema.safeParse({ accountId: id, amount: 500, customerId: id }).success).toBe(false);
  });

  it('checks the recipient number format and check digit', () => {
    const good = generateAccountNumber();
    const bad = good.slice(0, 9) + ((Number(good[9]) + 1) % 10);
    expect(transferSchema.safeParse({ fromAccountId: id, toAccountNumber: good, amount: 500 }).success).toBe(true);
    expect(transferSchema.safeParse({ fromAccountId: id, toAccountNumber: bad, amount: 500 }).success).toBe(false);
    expect(transferSchema.safeParse({ fromAccountId: id, toAccountNumber: '123', amount: 500 }).success).toBe(false);
  });

  it('parses history filters, including whole-day "to" dates', () => {
    expect(historyQuery.parse({})).toEqual({ page: 1, limit: 20 });
    const q = historyQuery.parse({ type: 'transfer', direction: 'debit', from: '2026-11-01', to: '2026-11-07', limit: '10' });
    expect(q).toMatchObject({ type: 'transfer', direction: 'debit', limit: 10 });
    expect(q.to.toISOString()).toBe('2026-11-07T23:59:59.999Z');
    expect(historyQuery.safeParse({ from: '2026-11-07', to: '2026-11-01' }).success).toBe(false);
    expect(historyQuery.safeParse({ type: 'refund' }).success).toBe(false);
    expect(historyQuery.safeParse({ from: 'yesterday-ish' }).success).toBe(false);
    expect(historyQuery.safeParse({ limit: '500' }).success).toBe(false);
  });
});

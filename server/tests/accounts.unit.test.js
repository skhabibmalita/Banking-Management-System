import { describe, it, expect } from 'vitest';
import { generateAccountNumber, isValidAccountNumber, luhnCheckDigit } from '../utils/accountNumber.js';
import { transitionError } from '../services/accountRules.js';
import { accountListQuery, createAccountSchema, statusSchema } from '../validators/account.validators.js';

describe('account numbers', () => {
  it('computes the standard Luhn check digit', () => {
    expect(luhnCheckDigit('7992739871')).toBe(3);
  });

  it('generates valid 10-digit numbers starting with 4, and they differ', () => {
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const n = generateAccountNumber();
      expect(n).toMatch(/^4\d{9}$/);
      expect(isValidAccountNumber(n)).toBe(true);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(290);
  });

  it('catches typos, wrong lengths and non-digits', () => {
    const n = generateAccountNumber();
    expect(isValidAccountNumber(n.slice(0, 9) + ((Number(n[9]) + 1) % 10))).toBe(false);
    expect(isValidAccountNumber('123')).toBe(false);
    expect(isValidAccountNumber('40abc12345')).toBe(false);
  });
});

describe('status transition rules', () => {
  const code = (actor, from, to) => transitionError({ actor, from, to })?.code ?? 'ALLOWED';

  it('lets a customer close an active account and nothing else', () => {
    expect(code('customer', 'active', 'closed')).toBe('ALLOWED');
    expect(code('customer', 'active', 'frozen')).toBe('TRANSITION_NOT_ALLOWED');
    expect(code('customer', 'frozen', 'active')).toBe('ACCOUNT_FROZEN');
    expect(code('customer', 'frozen', 'closed')).toBe('ACCOUNT_FROZEN');
  });

  it('lets an admin freeze, unfreeze and close', () => {
    expect(code('admin', 'active', 'frozen')).toBe('ALLOWED');
    expect(code('admin', 'frozen', 'active')).toBe('ALLOWED');
    expect(code('admin', 'frozen', 'closed')).toBe('ALLOWED');
  });

  it('treats closed as final and flags no-op changes', () => {
    expect(code('admin', 'closed', 'active')).toBe('ACCOUNT_CLOSED');
    expect(code('customer', 'closed', 'closed')).toBe('ACCOUNT_CLOSED');
    expect(code('customer', 'active', 'active')).toBe('NO_CHANGE');
  });

  it('gives unknown actors no permissions', () => {
    expect(code('stranger', 'active', 'closed')).toBe('TRANSITION_NOT_ALLOWED');
  });
});

describe('account validators', () => {
  it('accepts only a known account type and rejects extra fields', () => {
    expect(createAccountSchema.safeParse({ accountType: 'savings' }).success).toBe(true);
    expect(createAccountSchema.safeParse({ accountType: 'gold' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ accountType: 'savings', balance: 999999 }).success).toBe(false);
    expect(createAccountSchema.safeParse({ accountType: 'savings', customerId: '65f000000000000000000001' }).success).toBe(false);
  });

  it('validates status requests and list queries', () => {
    expect(statusSchema.parse({ status: 'closed', reason: '  moving banks ' })).toEqual({ status: 'closed', reason: 'moving banks' });
    expect(statusSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(accountListQuery.parse({})).toEqual({ page: 1, limit: 20 });
    expect(accountListQuery.safeParse({ status: 'weird' }).success).toBe(false);
  });
});

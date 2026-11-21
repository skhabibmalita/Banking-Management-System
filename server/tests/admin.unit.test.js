import { describe, it, expect } from 'vitest';
import { csvCell, rupees, toCsv } from '../utils/csv.js';
import { generateTempPassword } from '../utils/tempPassword.js';
import { describeReasons, severityOf } from '../services/fraud.service.js';
import { PERMISSIONS, ROLE_PERMISSIONS, can } from '../config/rbac.js';
import {
  adminTransactionQuery, createAdminSchema, freezeSchema, fraudListQuery, kycDecisionSchema, reportQuery, updateAdminSchema,
} from '../validators/admin.validators.js';

describe('CSV output', () => {
  it('neutralises spreadsheet formulas', () => {
    for (const evil of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\t=1']) {
      expect(csvCell(evil).replace(/^"/, '').startsWith("'")).toBe(true);
    }
    expect(csvCell('plain text')).toBe('plain text');
    expect(csvCell(-5)).toBe('-5'); // real numbers are left alone
  });

  it('quotes commas, quotes and newlines, and formats dates', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(new Date('2026-11-07T10:00:00Z'))).toBe('2026-11-07T10:00:00.000Z');
    expect(csvCell(null)).toBe('');
  });

  it('builds a header plus rows and converts paise exactly', () => {
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x' }, { a: 2, b: '=y' }])).toBe("a,b\r\n1,x\r\n2,'=y\r\n");
    expect([rupees(0), rupees(5), rupees(100), rupees(12_345_678)]).toEqual(['0.00', '0.05', '1.00', '123456.78']);
  });
});

describe('temporary passwords', () => {
  it('are 16 characters, mixed, and random', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i += 1) {
      const p = generateTempPassword();
      expect(p).toHaveLength(16);
      expect(p).toMatch(/[A-Za-z]/);
      expect(p).toMatch(/\d/);
      seen.add(p);
    }
    expect(seen.size).toBe(100);
  });
});

describe('fraud severity', () => {
  it('grades reasons', () => {
    expect(severityOf(['LARGE_AMOUNT'])).toBe('high');
    expect(severityOf(['RAPID_TRANSFERS', 'REPEATED_FAILURES'])).toBe('high');
    expect(severityOf(['DEPOSIT_THEN_WITHDRAW'])).toBe('medium');
    expect(severityOf(['REPEATED_FAILURES'])).toBe('low');
    expect(severityOf([])).toBeNull();
    expect(describeReasons(['LARGE_AMOUNT'])).toEqual(['Unusually large amount']);
  });
});

describe('role permissions', () => {
  it('keeps each role to its job', () => {
    expect(ROLE_PERMISSIONS.superadmin.sort()).toEqual([...PERMISSIONS].sort());
    expect(ROLE_PERMISSIONS.kyc_officer.sort()).toEqual(['customers:read', 'kyc:review']);
    expect(can({ role: 'operations' }, 'fraud:review')).toBe(true);
    expect(can({ role: 'operations' }, 'kyc:review')).toBe(false);
    expect(can({ role: 'operations' }, 'admins:manage')).toBe(false);
  });

  it('gives the auditor read-only access', () => {
    for (const p of ROLE_PERMISSIONS.auditor) expect(p.endsWith(':read'), p).toBe(true);
    for (const p of ['accounts:freeze', 'fraud:review', 'kyc:review', 'admins:manage']) expect(can({ role: 'auditor' }, p)).toBe(false);
  });
});

describe('admin validators', () => {
  it('requires a real reason to freeze or reject, but not to unfreeze or approve', () => {
    expect(freezeSchema.safeParse({ frozen: true }).success).toBe(false);
    expect(freezeSchema.safeParse({ frozen: true, reason: 'abc' }).success).toBe(false);
    expect(freezeSchema.safeParse({ frozen: true, reason: 'Suspicious pattern' }).success).toBe(true);
    expect(freezeSchema.safeParse({ frozen: false }).success).toBe(true);
    expect(kycDecisionSchema.safeParse({ decision: 'reject' }).success).toBe(false);
    expect(kycDecisionSchema.safeParse({ decision: 'reject', reason: 'Blurry photo' }).success).toBe(true);
    expect(kycDecisionSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(kycDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });

  it('rejects unknown fields and unknown permissions', () => {
    expect(freezeSchema.safeParse({ frozen: false, balance: 1 }).success).toBe(false);
    expect(createAdminSchema.safeParse({ name: 'New Admin', email: 'a@b.co', role: 'root' }).success).toBe(false);
    expect(createAdminSchema.safeParse({ name: 'New Admin', email: 'a@b.co', role: 'auditor', passwordHash: 'x' }).success).toBe(false);
    expect(updateAdminSchema.safeParse({}).success).toBe(false);
    expect(updateAdminSchema.safeParse({ permissions: ['god:mode'] }).success).toBe(false);
    expect(updateAdminSchema.safeParse({ permissions: ['reports:read'], isActive: false }).success).toBe(true);
  });

  it('applies list defaults', () => {
    expect(fraudListQuery.parse({})).toMatchObject({ page: 1, limit: 20, reviewed: false });
    expect(fraudListQuery.parse({ reviewed: 'true' }).reviewed).toBe(true);
    expect(adminTransactionQuery.parse({ flagged: 'true', minAmount: '500' })).toMatchObject({ flagged: true, minAmount: 500 });
    expect(adminTransactionQuery.safeParse({ accountNumber: '12' }).success).toBe(false);
  });

  it('defaults reports to the last 30 days and caps the range', () => {
    const r = reportQuery.parse({});
    expect(r.format).toBe('json');
    expect(Math.round((r.to - r.from) / 86_400_000)).toBe(30);
    expect(reportQuery.safeParse({ from: '2026-11-07', to: '2026-11-01' }).success).toBe(false);
    expect(reportQuery.safeParse({ from: '2024-01-01', to: '2026-01-01' }).success).toBe(false);
    expect(reportQuery.safeParse({ format: 'xml' }).success).toBe(false);
  });
});

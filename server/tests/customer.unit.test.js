import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import { cleanFileName, detectFileType } from '../utils/fileType.js';
import { deleteStoredFile, resolveStoragePath, saveKycFile, uploadRoot } from '../utils/storage.js';
import { kycSubmitSchema, notificationListQuery, updateProfileSchema } from '../validators/customer.validators.js';
import { idParam } from '../validators/common.js';

describe('file type detection', () => {
  it('recognises PDF, JPEG and PNG by signature', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n...'))).toEqual({ mime: 'application/pdf', ext: 'pdf' });
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('rejects disguised or empty files', () => {
    expect(detectFileType(Buffer.from('MZ\x90\x00 executable pretending to be a pdf'))).toBeNull();
    expect(detectFileType(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
    expect(detectFileType('not a buffer')).toBeNull();
  });

  it('cleans display file names', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('C:\\Users\\me\\id<1>.pdf')).toBe('id1.pdf');
    expect(cleanFileName('')).toBe('document');
    expect(cleanFileName('a'.repeat(500)).length).toBe(200);
  });
});

describe('private storage', () => {
  it('refuses paths that escape the upload folder', () => {
    expect(() => resolveStoragePath('../secret.txt')).toThrow('Invalid storage path');
    expect(() => resolveStoragePath('kyc/../../x')).toThrow('Invalid storage path');
    expect(resolveStoragePath('kyc/1/a.pdf').startsWith(uploadRoot)).toBe(true);
  });

  it('saves under a random name and can delete it', async () => {
    const rel = await saveKycFile('cust1', Buffer.from('%PDF-1.4 test'), 'pdf');
    expect(rel).toMatch(/^kyc[\\/]cust1[\\/][0-9a-f-]{36}\.pdf$/);
    expect((await fs.readFile(resolveStoragePath(rel))).toString()).toBe('%PDF-1.4 test');
    await deleteStoredFile(rel);
    await expect(fs.access(resolveStoragePath(rel))).rejects.toThrow();
  });
});

describe('customer validators', () => {
  it('only allows editable profile fields', () => {
    expect(updateProfileSchema.parse({ name: '  Priya Nair ' })).toEqual({ name: 'Priya Nair' });
    expect(updateProfileSchema.safeParse({ email: 'x@y.co' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ dob: '2000-01-01' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ kycStatus: 'verified' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ phone: 'abc' }).success).toBe(false);
  });

  it('validates KYC document types', () => {
    expect(kycSubmitSchema.safeParse({ docType: 'aadhaar' }).success).toBe(true);
    expect(kycSubmitSchema.safeParse({ docType: 'selfie' }).success).toBe(false);
  });

  it('validates notification queries and ids', () => {
    expect(notificationListQuery.parse({})).toEqual({ page: 1, limit: 20, unread: false });
    expect(notificationListQuery.parse({ unread: 'true', limit: '5' })).toMatchObject({ unread: true, limit: 5 });
    expect(notificationListQuery.safeParse({ limit: '500' }).success).toBe(false);
    expect(idParam.safeParse({ id: 'abc' }).success).toBe(false);
    expect(idParam.safeParse({ id: '65f000000000000000000001' }).success).toBe(true);
  });
});

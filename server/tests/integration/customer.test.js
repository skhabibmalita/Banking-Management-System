import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import app from '../../app.js';
import { Customer, KycDocument, Notification } from '../../models/index.js';
import { as, signUp, startTestDb } from '../helpers/session.js';
import { resolveStoragePath, uploadRoot } from '../../utils/storage.js';

let db;
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n${extra}`);
const upload = (who, { buffer = pdf(), filename = 'aadhaar.pdf', type = 'application/pdf', docType = 'aadhaar' } = {}) =>
  as(request(app).post('/api/customers/kyc'), who).attach('document', buffer, { filename, contentType: type }).field('docType', docType);

beforeAll(async () => { db = await startTestDb('bank_customer_test'); });
afterAll(async () => { await db.stop(); await fs.rm(uploadRoot, { recursive: true, force: true }); });
beforeEach(async () => { await Promise.all([Customer, KycDocument, Notification].map((m) => m.deleteMany({}))); });

describe('profile', () => {
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/customers/profile')).status).toBe(401);
  });

  it('returns the signed-in customer without secrets', async () => {
    const me = await signUp(app);
    const res = await as(request(app).get('/api/customers/profile'), me);
    expect(res.status).toBe(200);
    expect(res.body.data.customer).toMatchObject({ email: me.email, kycStatus: 'pending' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|failedLogin|lockUntil/);
  });

  it('updates name, phone and address', async () => {
    const me = await signUp(app);
    const res = await as(request(app).put('/api/customers/profile'), me).send({ phone: '+91 91234 56789', address: '22 Hill Road, Mumbai 400001' });
    expect(res.status).toBe(200);
    expect(res.body.data.customer.phone).toBe('+91 91234 56789');
    expect((await Customer.findById(me.id)).address).toBe('22 Hill Road, Mumbai 400001');
  });

  it('refuses to change email, dob or KYC status', async () => {
    const me = await signUp(app);
    for (const body of [{ email: 'new@example.com' }, { dob: '1990-01-01' }, { kycStatus: 'verified' }]) {
      expect((await as(request(app).put('/api/customers/profile'), me).send(body)).status).toBe(400);
    }
    expect((await Customer.findById(me.id)).kycStatus).toBe('pending');
  });

  it('needs the CSRF header', async () => {
    const me = await signUp(app);
    const res = await request(app).put('/api/customers/profile').set('Cookie', me.cookie).send({ name: 'Someone Else' });
    expect(res.status).toBe(403);
  });

  it('locks the name once KYC is verified', async () => {
    const me = await signUp(app);
    await Customer.updateOne({ _id: me.id }, { kycStatus: 'verified' });
    const res = await as(request(app).put('/api/customers/profile'), me).send({ name: 'Different Name' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NAME_LOCKED');
    expect((await as(request(app).put('/api/customers/profile'), me).send({ phone: '+91 91234 56789' })).status).toBe(200);
  });
});

describe('KYC upload', () => {
  it('accepts a real PDF, stores it privately and moves the customer to pending', async () => {
    const me = await signUp(app);
    const res = await upload(me);
    expect(res.status).toBe(201);
    expect(res.body.data.document).toMatchObject({ docType: 'aadhaar', status: 'pending', fileName: 'aadhaar.pdf' });
    expect(JSON.stringify(res.body)).not.toMatch(/storagePath|kyc[\\/]/);

    const stored = await KycDocument.findOne({ customerId: me.id }).select('+storagePath');
    expect(stored.mimeType).toBe('application/pdf');
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.storagePath).not.toContain('aadhaar'); // random name, not the user's
    expect((await fs.readFile(resolveStoragePath(stored.storagePath))).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await Notification.countDocuments({ customerId: me.id, title: 'KYC documents received' })).toBe(1);
  });

  it('rejects a disguised file even when the name and MIME type say PDF', async () => {
    const me = await signUp(app);
    const res = await upload(me, { buffer: Buffer.from('MZ not a pdf at all'), filename: 'id.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
    expect(await KycDocument.countDocuments()).toBe(0);
  });

  it('rejects oversized files, missing files and bad document types', async () => {
    const me = await signUp(app);
    const big = await upload(me, { buffer: Buffer.concat([pdf(), Buffer.alloc(5 * 1024 * 1024)]) });
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('FILE_TOO_LARGE');
    const none = await as(request(app).post('/api/customers/kyc'), me).field('docType', 'aadhaar');
    expect(none.status).toBe(400);
    expect((await upload(me, { docType: 'selfie' })).status).toBe(400);
  });

  it('requires sign-in and the CSRF header', async () => {
    const me = await signUp(app);
    const anon = await request(app).post('/api/customers/kyc').attach('document', pdf(), 'a.pdf').field('docType', 'pan');
    expect(anon.status).toBe(401);
    const noCsrf = await request(app).post('/api/customers/kyc').set('Cookie', me.cookie).attach('document', pdf(), 'a.pdf').field('docType', 'pan');
    expect(noCsrf.status).toBe(403);
  });

  it('caps pending documents and blocks verified customers', async () => {
    const me = await signUp(app);
    for (let i = 0; i < 3; i += 1) expect((await upload(me)).status).toBe(201);
    expect((await upload(me)).body.code).toBe('TOO_MANY_PENDING');

    const other = await signUp(app);
    await Customer.updateOne({ _id: other.id }, { kycStatus: 'verified' });
    expect((await upload(other)).body.code).toBe('ALREADY_VERIFIED');
  });

  it('puts a rejected customer back in the queue on resubmission', async () => {
    const me = await signUp(app);
    await Customer.updateOne({ _id: me.id }, { kycStatus: 'rejected', kycRejectReason: 'Document is blurry' });
    expect((await as(request(app).get('/api/customers/kyc-status'), me)).body.data).toMatchObject({ status: 'rejected', rejectReason: 'Document is blurry' });
    expect((await upload(me)).status).toBe(201);
    const after = await Customer.findById(me.id);
    expect(after.kycStatus).toBe('pending');
    expect(after.kycRejectReason).toBeUndefined();
  });
});

describe('KYC status', () => {
  it('shows only the customer\'s own documents', async () => {
    const [a, b] = [await signUp(app), await signUp(app)];
    await upload(a);
    const empty = (await as(request(app).get('/api/customers/kyc-status'), b)).body.data;
    expect(empty).toMatchObject({ status: 'pending', hasDocuments: false, documents: [] });
    const mine = (await as(request(app).get('/api/customers/kyc-status'), a)).body.data;
    expect(mine.hasDocuments).toBe(true);
    expect(mine.documents).toHaveLength(1);
  });
});

describe('notifications', () => {
  it('lists, counts unread and paginates only my notifications', async () => {
    const [a, b] = [await signUp(app), await signUp(app)]; // each gets a welcome notification
    await Notification.create({ customerId: a.id, title: 'Second', message: 'Another one', type: 'success' });
    const res = await as(request(app).get('/api/notifications?limit=1'), a);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, pages: 2, unread: 2 });
    expect((await as(request(app).get('/api/notifications'), b)).body.meta.total).toBe(1);
  });

  it('marks one as read, and hides other customers\' notifications', async () => {
    const [a, b] = [await signUp(app), await signUp(app)];
    const mine = await Notification.findOne({ customerId: a.id });
    expect((await as(request(app).put(`/api/notifications/${mine.id}/read`), b)).status).toBe(404);
    const ok = await as(request(app).put(`/api/notifications/${mine.id}/read`), a);
    expect(ok.status).toBe(200);
    expect(ok.body.data.read).toBe(true);
    expect((await as(request(app).put('/api/notifications/not-an-id/read'), a)).status).toBe(400);
  });

  it('marks everything as read', async () => {
    const me = await signUp(app);
    await Notification.create({ customerId: me.id, title: 'Another', message: 'Hello again', type: 'info' });
    const res = await as(request(app).put('/api/notifications/read-all'), me);
    expect(res.body.data.updated).toBe(2);
    expect((await as(request(app).get('/api/notifications?unread=true'), me)).body.data).toHaveLength(0);
  });
});

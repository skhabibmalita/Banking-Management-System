import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../../app.js';
import { connectDB, disconnectDB } from '../../config/db.js';
import { Admin, AuditLog, Customer, Session } from '../../models/index.js';
import { authenticateAdmin, requirePermission } from '../../middleware/auth.js';
import errorHandler from '../../middleware/errorHandler.js';
import { hashPassword } from '../../utils/password.js';

let replSet;
const person = { name: 'Aarav Mehta', email: 'aarav@example.com', phone: '+91 98765 43210', dob: '1998-04-12', address: '14 Lake View Road, Pune', password: 'Passw0rdOK1' };

// Helpers that read Set-Cookie headers directly, so each test controls exactly which cookies it sends.
const cookieMap = (res) => Object.fromEntries((res.headers['set-cookie'] || []).map((c) => c.split(';')[0].split('=')));
const jar = (res) => Object.entries(cookieMap(res)).map(([k, v]) => `${k}=${v}`).join('; ');
const setCookieLine = (res, name) => res.headers['set-cookie'].find((c) => c.startsWith(`${name}=`));

const register = (body = person) => request(app).post('/api/auth/register').send(body);
const login = (email = person.email, password = person.password) => request(app).post('/api/auth/login').send({ email, password });

// RBAC check app: a route that only admins with accounts:freeze may use (the real one arrives in Phase 9).
const rbacApp = express();
rbacApp.use(cookieParser(), express.json());
rbacApp.post('/api/test/freeze', authenticateAdmin, requirePermission('accounts:freeze'), (req, res) => res.json({ frozen: true }));
rbacApp.use(errorHandler);

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(replSet.getUri('bank_auth_test'));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});
afterAll(async () => { await disconnectDB(); await replSet.stop(); });
beforeEach(async () => {
  await Promise.all([Customer, Admin, Session].map((m) => m.deleteMany({})));
  await AuditLog.collection.deleteMany({});
});

describe('registration', () => {
  it('creates an account, signs in with HTTP-only cookies and never leaks secrets', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'aarav@example.com', kycStatus: 'pending' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);
    expect(setCookieLine(res, 'bank_at')).toMatch(/HttpOnly/i);
    expect(setCookieLine(res, 'bank_rt')).toMatch(/HttpOnly/i);
    expect(setCookieLine(res, 'bank_rt')).toMatch(/Path=\/api\/auth/);
    expect(setCookieLine(res, 'bank_csrf')).not.toMatch(/HttpOnly/i);
    const stored = await Customer.findOne({ email: person.email }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate emails, weak passwords and mass-assignment', async () => {
    await register();
    expect((await register()).status).toBe(409);
    expect((await register({ ...person, email: 'other@example.com', password: 'password' })).status).toBe(400);
    const res = await register({ ...person, email: 'third@example.com', kycStatus: 'verified', isActive: false });
    expect(res.body.data.user.kycStatus).toBe('pending');
  });
});

describe('login and sessions', () => {
  beforeEach(register);

  it('signs in and serves /me with the cookies', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', jar(res));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(person.email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const [a, b] = [await login(person.email, 'Wrong1Password'), await login('nobody@example.com', 'Wrong1Password')];
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.message).toBe(b.body.message);
  });

  it('rejects unauthenticated and forged requests', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', 'bank_at=not.a.jwt')).status).toBe(401);
  });

  it('requires the CSRF header on authenticated changes', async () => {
    const res = await login();
    const body = { currentPassword: person.password, newPassword: 'Another1Pass' };
    const without = await request(app).put('/api/auth/password').set('Cookie', jar(res)).send(body);
    expect(without.status).toBe(403);
    expect(without.body.code).toBe('CSRF_INVALID');
    const wrong = await request(app).put('/api/auth/password').set('Cookie', jar(res)).set('X-CSRF-Token', 'nope').send(body);
    expect(wrong.status).toBe(403);
    const ok = await request(app).put('/api/auth/password').set('Cookie', jar(res)).set('X-CSRF-Token', cookieMap(res).bank_csrf).send(body);
    expect(ok.status).toBe(200);
  });

  it('logout kills the session immediately, even for a copied access cookie', async () => {
    const res = await login();
    const out = await request(app).post('/api/auth/logout').set('Cookie', jar(res));
    expect(out.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(res))).status).toBe(401);
  });

  it('changing the password signs out other devices', async () => {
    const [a, b] = [await login(), await login()];
    await request(app).put('/api/auth/password').set('Cookie', jar(a)).set('X-CSRF-Token', cookieMap(a).bank_csrf)
      .send({ currentPassword: person.password, newPassword: 'Another1Pass' });
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(a))).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(b))).status).toBe(401);
    expect((await login(person.email, 'Another1Pass')).status).toBe(200);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    for (let i = 0; i < 5; i += 1) await login(person.email, 'Wrong1Password');
    const locked = await login();
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses disabled accounts', async () => {
    await Customer.updateOne({ email: person.email }, { isActive: false });
    expect((await login()).status).toBe(403);
  });

  it('records audit events', async () => {
    await login();
    await login(person.email, 'Wrong1Password');
    const actions = (await AuditLog.find().lean()).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['REGISTER', 'LOGIN_SUCCESS', 'LOGIN_FAILED']));
  });
});

describe('refresh token rotation', () => {
  beforeEach(register);

  it('rotates tokens and revokes every session when an old token is replayed', async () => {
    const first = await login();
    const old = cookieMap(first);
    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', jar(first)).set('X-CSRF-Token', old.bank_csrf);
    expect(rotated.status).toBe(200);
    expect(cookieMap(rotated).bank_rt).not.toBe(old.bank_rt);
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(rotated))).status).toBe(200);

    // Pretend the rotation happened a minute ago, so the replay is outside the grace window.
    await Session.updateMany({ revokedAt: { $ne: null } }, { revokedAt: new Date(Date.now() - 60_000) });
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', `bank_rt=${old.bank_rt}`).set('X-CSRF-Token', old.bank_csrf);
    expect(replay.status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(rotated))).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'TOKEN_REUSE_DETECTED' })).toBe(1);
  });

  it('reports an expired access token as TOKEN_EXPIRED, and a refresh then restores access', async () => {
    const res = await login();
    const { sid, sub } = jwt.decode(cookieMap(res).bank_at);
    const expired = jwt.sign({ sid }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: sub, audience: 'customer', issuer: 'northwind-bank', expiresIn: -5 });
    const stale = `bank_at=${expired}; bank_rt=${cookieMap(res).bank_rt}; bank_csrf=${cookieMap(res).bank_csrf}`;

    const denied = await request(app).get('/api/auth/me').set('Cookie', stale);
    expect([denied.status, denied.body.code]).toEqual([401, 'TOKEN_EXPIRED']); // the client's cue to refresh

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', stale).set('X-CSRF-Token', cookieMap(res).bank_csrf);
    expect(refreshed.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', jar(refreshed))).status).toBe(200);
  });

  it('keeps the access cookie as long as the refresh cookie', async () => {
    const res = await login();
    const expiry = (name) => new Date(/Expires=([^;]+)/i.exec(setCookieLine(res, name))[1]).getTime();
    expect(Math.abs(expiry('bank_at') - expiry('bank_rt'))).toBeLessThan(2000);
  });

  it('needs the CSRF header and a valid refresh cookie', async () => {
    const res = await login();
    expect((await request(app).post('/api/auth/refresh').set('Cookie', jar(res))).status).toBe(403);
    expect((await request(app).post('/api/auth/refresh').set('X-CSRF-Token', 'x')).status).toBe(401);
  });
});

describe('admin realm and RBAC', () => {
  const makeAdmin = async (role, email = `${role}@northwind.test`) =>
    Admin.create({ name: 'Test Admin', email, role, passwordHash: await hashPassword('AdminPass1234') });
  const adminLogin = (email, password = 'AdminPass1234') => request(app).post('/api/admin/auth/login').send({ email, password });

  it('signs admins in through their own endpoint and cookies', async () => {
    await makeAdmin('superadmin');
    const res = await adminLogin('superadmin@northwind.test');
    expect(res.status).toBe(200);
    expect(setCookieLine(res, 'bank_admin_at')).toMatch(/HttpOnly/i);
    expect((await request(app).get('/api/admin/auth/me').set('Cookie', jar(res))).status).toBe(200);
  });

  it('does not let customers sign in as admins or use customer tokens as admin tokens', async () => {
    await register();
    expect((await adminLogin(person.email, person.password)).status).toBe(401);
    const customerSession = await login();
    const forged = `bank_admin_at=${cookieMap(customerSession).bank_at}`;
    expect((await request(app).get('/api/admin/auth/me').set('Cookie', forged)).status).toBe(401);
  });

  it('has no admin registration route', async () => {
    expect((await request(app).post('/api/admin/auth/register').send(person)).status).toBe(404);
  });

  it('enforces role permissions', async () => {
    await makeAdmin('kyc_officer'); await makeAdmin('operations');
    const hit = (res) => request(rbacApp).post('/api/test/freeze').set('Cookie', jar(res)).set('X-CSRF-Token', cookieMap(res).bank_admin_csrf);
    expect((await hit(await adminLogin('kyc_officer@northwind.test'))).status).toBe(403);
    expect((await hit(await adminLogin('operations@northwind.test'))).status).toBe(200);
    expect((await request(rbacApp).post('/api/test/freeze')).status).toBe(401);
  });

  it('deactivating an admin cuts off an existing session', async () => {
    const admin = await makeAdmin('operations');
    const res = await adminLogin(admin.email);
    await Admin.updateOne({ _id: admin._id }, { isActive: false });
    expect((await request(app).get('/api/admin/auth/me').set('Cookie', jar(res))).status).toBe(401);
  });
});

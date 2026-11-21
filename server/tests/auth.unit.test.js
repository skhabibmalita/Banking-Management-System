import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { csrfTokenFor, hashToken, safeEqual, signAccessToken, verifyAccessToken } from '../utils/tokens.js';
import { registerSchema, loginSchema, changePasswordSchema } from '../validators/auth.validators.js';
import { requirePermission } from '../middleware/auth.js';
import originGuard from '../middleware/originGuard.js';
import { make } from '../middleware/rateLimiters.js';
import errorHandler from '../middleware/errorHandler.js';
import { setSessionCookies } from '../utils/cookies.js';
import { REALMS } from '../config/realms.js';

describe('passwords', () => {
  it('hashes with a unique salt and verifies', async () => {
    const [a, b] = await Promise.all([hashPassword('Passw0rdOK1'), hashPassword('Passw0rdOK1')]);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Passw0rdOK1');
    expect(await verifyPassword('Passw0rdOK1', a)).toBe(true);
    expect(await verifyPassword('wrong-pass1', a)).toBe(false);
  });
});

describe('tokens', () => {
  const args = { userId: '65f000000000000000000001', sessionId: '65f000000000000000000002', audience: 'customer' };

  it('signs and verifies an access token', () => {
    const payload = verifyAccessToken(signAccessToken(args), 'customer');
    expect(payload).toMatchObject({ sub: args.userId, sid: args.sessionId, aud: 'customer', iss: 'northwind-bank' });
  });

  it('rejects the wrong audience (customer token as admin)', () => {
    expect(() => verifyAccessToken(signAccessToken(args), 'admin')).toThrow();
  });

  it('rejects tampered, unsigned and expired tokens', () => {
    const good = signAccessToken(args);
    const [h, p, s] = good.split('.');
    expect(() => verifyAccessToken(`${h}.${p}.${s.slice(0, -2)}xx`, 'customer')).toThrow();
    const unsigned = jwt.sign({ sid: args.sessionId }, '', { algorithm: 'none', subject: args.userId, audience: 'customer', issuer: 'northwind-bank' });
    expect(() => verifyAccessToken(unsigned, 'customer')).toThrow();
    const expired = jwt.sign({ sid: args.sessionId }, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: args.userId, audience: 'customer', issuer: 'northwind-bank', expiresIn: -10 });
    expect(() => verifyAccessToken(expired, 'customer')).toThrow();
  });

  it('derives stable, session-specific CSRF tokens', () => {
    expect(csrfTokenFor('a')).toBe(csrfTokenFor('a'));
    expect(csrfTokenFor('a')).not.toBe(csrfTokenFor('b'));
  });

  it('hashes refresh tokens and compares safely', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
    expect(safeEqual('x', 'x')).toBe(true);
    expect(safeEqual('x', 'y')).toBe(false);
    expect(safeEqual(undefined, 'y')).toBe(false);
  });
});

describe('auth validators', () => {
  const valid = { name: ' Aarav Mehta ', email: ' Aarav@Example.COM ', phone: '+91 98765 43210', dob: '1998-04-12', address: '14 Lake View Road, Pune', password: 'Passw0rdOK1' };

  it('normalises a valid registration', () => {
    const out = registerSchema.parse(valid);
    expect(out.email).toBe('aarav@example.com');
    expect(out.name).toBe('Aarav Mehta');
    expect(out.dob).toBeInstanceOf(Date);
  });

  it('rejects weak or oversized passwords, minors, and extra junk', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'password' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'short1' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'a1'.repeat(40) }).success).toBe(false);
    const minor = new Date(); minor.setFullYear(minor.getFullYear() - 16);
    expect(registerSchema.safeParse({ ...valid, dob: minor.toISOString() }).success).toBe(false);
    expect('isAdmin' in registerSchema.parse({ ...valid, isAdmin: true })).toBe(false);
  });

  it('lowercases login email and requires a password', () => {
    expect(loginSchema.parse({ email: 'A@B.CO', password: 'x' }).email).toBe('a@b.co');
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });

  it('requires a different new password', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'Passw0rdOK1', newPassword: 'Passw0rdOK1' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'Passw0rdOK1', newPassword: 'Another1Pass' }).success).toBe(true);
  });
});

describe('middleware', () => {
  it('requirePermission allows, forbids and demands sign-in', () => {
    const run = (admin) => { let err; requirePermission('accounts:freeze')({ admin }, {}, (e) => { err = e; }); return err; };
    expect(run({ role: 'operations' })).toBeUndefined();
    expect(run({ role: 'kyc_officer' }).status).toBe(403);
    expect(run(undefined).status).toBe(401);
  });

  it('originGuard blocks foreign origins on unsafe methods only', async () => {
    const app = express();
    app.use(originGuard);
    app.all('/x', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    expect((await request(app).post('/x').set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await request(app).post('/x').set('Origin', 'http://localhost:5173')).status).toBe(200);
    expect((await request(app).post('/x')).status).toBe(200);
    expect((await request(app).get('/x').set('Origin', 'https://evil.example')).status).toBe(200);
  });

  it('rate limiter answers 429 after the limit', async () => {
    const app = express();
    app.use(make({ windowMs: 60_000, limit: 2, message: 'slow down' }));
    app.get('/x', (req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    await request(app).get('/x'); await request(app).get('/x');
    const res = await request(app).get('/x');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});

describe('session cookies', () => {
  it('keeps the access cookie for the whole session, so an expired token is reported rather than vanishing', () => {
    const calls = [];
    const res = { cookie: (name, value, opts) => calls.push({ name, value, opts }) };
    const refreshExpires = new Date(Date.now() + 7 * 86_400_000);
    setSessionCookies(res, REALMS.customer, { accessToken: 'a.b.c', refreshToken: 'r', refreshExpires, sessionId: '65f000000000000000000002' });
    const access = calls.find((c) => c.name === 'bank_at').opts;
    expect(access.expires).toEqual(refreshExpires);
    expect(access.maxAge).toBeUndefined();
    expect(access.httpOnly).toBe(true);
    expect(calls.find((c) => c.name === 'bank_rt').opts.path).toBe('/api/auth');
    expect(calls.find((c) => c.name === 'bank_csrf').opts.httpOnly).toBe(false);
  });
});

describe('login rate limiting', () => {
  it('counts only failed attempts when skipSuccessfulRequests is on', async () => {
    const app = express();
    app.use(make({ windowMs: 60_000, limit: 2, message: 'slow down', skipSuccessfulRequests: true }));
    app.post('/login', (req, res) => res.status(req.query.ok ? 200 : 401).json({}));
    app.use(errorHandler);
    for (let i = 0; i < 5; i += 1) expect((await request(app).post('/login?ok=1')).status).toBe(200);
    expect((await request(app).post('/login')).status).toBe(401);
    expect((await request(app).post('/login')).status).toBe(401);
    expect((await request(app).post('/login')).status).toBe(429);
  });
});

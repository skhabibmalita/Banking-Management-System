import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../config/db.js';
import { Admin } from '../../models/index.js';
import { hashPassword } from '../../utils/password.js';

export const cookieMap = (res) => Object.fromEntries((res.headers['set-cookie'] || []).map((c) => c.split(';')[0].split('=')));
export const jar = (res) => Object.entries(cookieMap(res)).map(([k, v]) => `${k}=${v}`).join('; ');

export async function startTestDb(name) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDB(replSet.getUri(name));
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return { stop: async () => { await disconnectDB(); await replSet.stop(); } };
}

let counter = 0;
// Registers a customer and returns what a test needs to act as them.
export async function signUp(app, overrides = {}) {
  counter += 1;
  const body = {
    name: 'Aarav Mehta', email: `user${counter}@example.com`, phone: '+91 98765 43210',
    dob: '1998-04-12', address: '14 Lake View Road, Pune', password: 'Passw0rdOK1', ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.data.user.id, email: body.email, cookie: jar(res), csrf: cookieMap(res).bank_csrf };
}

// Adds the session cookie and CSRF header to a supertest request.
export const as = (req, who) => req.set('Cookie', who.cookie).set('X-CSRF-Token', who.csrf);

let adminCounter = 0;
export const ADMIN_PASSWORD = 'AdminPass1234';

// Creates an admin directly in the database (there is no public admin signup) and signs them in.
export async function adminSignIn(app, role, extra = {}) {
  adminCounter += 1;
  const email = `${role}${adminCounter}@northwind.test`;
  const admin = await Admin.create({ name: `Test ${role} ${adminCounter}`, email, role, passwordHash: await hashPassword(ADMIN_PASSWORD), ...extra });
  const res = await request(app).post('/api/admin/auth/login').send({ email, password: ADMIN_PASSWORD });
  if (res.status !== 200) throw new Error(`adminSignIn failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: admin.id, email, role, cookie: jar(res), csrf: cookieMap(res).bank_admin_csrf };
}

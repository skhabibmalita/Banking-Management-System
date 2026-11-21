// Development-only demo data.
//   npm run seed          fills an EMPTY database
//   npm run seed:reset    wipes everything first (asks nothing, so be sure)
// Refuses to run in production, and refuses non-local databases unless SEED_ALLOW_REMOTE=true.
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { parseArgs } from 'node:util';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Customer, Admin } from '../models/index.js';
import { uploadRoot } from '../utils/storage.js';
import { seedDemo } from './seedData.js';
import { ACCOUNTS, ADMINS, DEMO_ADMIN_PASSWORD, DEMO_CUSTOMER_PASSWORD, PEOPLE } from './demoPlan.js';

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

function refuse(msg) {
  console.error(`\nSeed refused: ${msg}\n`);
  process.exit(1);
}

if (env.isProd) refuse('NODE_ENV is production.');

const hosts = env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\//, '').replace(/^[^@/]*@/, '').split('/')[0].split(',').map((h) => h.split(':')[0]);
const local = hosts.every((h) => ['localhost', '127.0.0.1', '::1', 'mongo', 'host.docker.internal'].includes(h));
if (!local && process.env.SEED_ALLOW_REMOTE !== 'true') {
  refuse(`MONGODB_URI points at a non-local database (${hosts.join(', ')}). Set SEED_ALLOW_REMOTE=true if you really mean it.`);
}

try {
  await connectDB();
  const existing = (await Customer.countDocuments()) + (await Admin.countDocuments());
  if (existing > 0 && !values.reset) refuse('the database already has data. Run `npm run seed:reset` to wipe it first.');

  if (values.reset) {
    for (const model of Object.values(mongoose.models)) await model.collection.deleteMany({}); // raw access: ledger and audit models are append-only
    await fs.rm(path.join(uploadRoot, 'kyc'), { recursive: true, force: true });
    console.log('Existing data wiped.');
  }

  const { summary, accountNumberOf } = await seedDemo({ log: (m) => console.log(`  ${m}`) });
  console.log('\nDemo data ready:', summary);

  console.log(`\nCUSTOMER sign-in  (password for all: ${DEMO_CUSTOMER_PASSWORD})`);
  for (const p of PEOPLE) console.log(`  ${p.email.padEnd(30)} KYC ${p.kyc.padEnd(8)} ${p.accounts.map((t) => `${t} ${accountNumberOf(`${p.key}:${t}`)}`).join(', ')}`);
  console.log(`\nADMIN sign-in at /admin/login  (password for all: ${DEMO_ADMIN_PASSWORD})`);
  for (const a of ADMINS) console.log(`  ${a.email.padEnd(30)} ${a.role}`);
  console.log('\nThese credentials are for local demos only. Never reuse them anywhere real.\n');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}

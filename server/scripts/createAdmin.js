// Creates an admin account. There is no public admin registration, so this is how the first admin exists.
//   npm run admin:create -- --name "Neel Sharma" --email neel@northwind.test --role superadmin
// Password comes from the ADMIN_PASSWORD env var (12+ chars), or a random one is generated and printed once.
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { connectDB, disconnectDB } from '../config/db.js';
import { ROLES } from '../config/rbac.js';
import { Admin } from '../models/index.js';
import { hashPassword } from '../utils/password.js';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', default: 'superadmin' },
  },
});

const input = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
}).safeParse(values);

if (!input.success) {
  console.error('Usage: npm run admin:create -- --name "Full Name" --email you@example.com [--role superadmin|kyc_officer|operations|auditor]');
  console.error(input.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
const generated = !password;
if (generated) password = crypto.randomBytes(12).toString('base64url');
if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  // Generated passwords can occasionally lack a digit; regenerate until valid.
  if (!generated) { console.error('ADMIN_PASSWORD must be 12+ characters with letters and numbers.'); process.exit(1); }
  do { password = crypto.randomBytes(12).toString('base64url'); } while (!/[A-Za-z]/.test(password) || !/\d/.test(password));
}

try {
  await connectDB();
  const admin = await Admin.create({ ...input.data, passwordHash: await hashPassword(password) });
  console.log(`Admin created: ${admin.email} (${admin.role})`);
  if (generated) console.log(`Temporary password (shown once, change it after first sign-in): ${password}`);
} catch (err) {
  console.error(err.code === 11000 ? 'An admin with that email already exists.' : err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}

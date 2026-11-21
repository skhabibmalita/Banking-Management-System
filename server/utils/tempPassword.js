import crypto from 'node:crypto';

// A random temporary password for a newly created or reset admin. Shown once, never stored in plain text.
export function generateTempPassword() {
  let pw;
  do { pw = crypto.randomBytes(12).toString('base64url'); } while (!/[A-Za-z]/.test(pw) || !/\d/.test(pw));
  return pw; // 16 characters
}

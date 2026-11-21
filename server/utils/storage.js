import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

// Private storage outside any web-served folder. Files are never served statically; they are only
// returned by authorised endpoints. Names are random, so user input never reaches the file system path.
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const uploadRoot = path.resolve(serverRoot, env.UPLOAD_DIR);

export async function saveKycFile(customerId, buffer, ext) {
  const relative = path.join('kyc', String(customerId), `${crypto.randomUUID()}.${ext}`);
  const full = resolveStoragePath(relative);
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, buffer, { flag: 'wx', mode: 0o600 });
  return relative;
}

export const deleteStoredFile = (relative) => fs.rm(resolveStoragePath(relative), { force: true });

// Refuses any path that would escape the upload folder.
export function resolveStoragePath(relative) {
  const full = path.resolve(uploadRoot, relative);
  if (full !== uploadRoot && !full.startsWith(uploadRoot + path.sep)) throw new Error('Invalid storage path');
  return full;
}

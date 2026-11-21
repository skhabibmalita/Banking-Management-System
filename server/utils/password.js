import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

const COST = env.isTest ? 4 : 12; // low cost only in tests, to keep them fast

export const hashPassword = (plain) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', COST);
export const burnTime = (plain) => bcrypt.compare(plain, DUMMY_HASH);

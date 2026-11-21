// The demo world, as plain data. No database access here, so it is easy to read and to test.
import { luhnCheckDigit } from '../utils/accountNumber.js';

export const DEMO_CUSTOMER_PASSWORD = 'Customer2026!';
export const DEMO_ADMIN_PASSWORD = 'AdminDemo2026!';

export const ADMINS = [
  { key: 'neel', name: 'Neel Sharma', email: 'neel.sharma@northwind.test', role: 'superadmin' },
  { key: 'farah', name: 'Farah Khan', email: 'farah.khan@northwind.test', role: 'kyc_officer' },
  { key: 'sam', name: 'Sam Dsouza', email: 'sam.dsouza@northwind.test', role: 'operations' },
  { key: 'leena', name: 'Leena Pillai', email: 'leena.pillai@northwind.test', role: 'auditor' },
];

// kyc: verified | pending | rejected. doc: the KYC document on file (if any).
export const PEOPLE = [
  { key: 'aarav', name: 'Aarav Mehta', email: 'aarav.mehta@example.com', phone: '+91 98765 43210', dob: '1998-04-12', address: '14 Lake View Road, Pune, Maharashtra 411001', kyc: 'verified', joinedAgo: 200, accounts: ['savings', 'current', 'salary'] },
  { key: 'priya', name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+91 98450 11223', dob: '1996-09-03', address: '221 MG Road, Bengaluru, Karnataka 560001', kyc: 'verified', joinedAgo: 190, accounts: ['savings', 'current'] },
  { key: 'rohan', name: 'Rohan Kapoor', email: 'rohan.kapoor@example.com', phone: '+91 99100 55667', dob: '1994-01-27', address: '8 Civil Lines, New Delhi 110054', kyc: 'pending', joinedAgo: 4, accounts: ['savings'], doc: { type: 'pan', status: 'pending', ago: 2 } },
  { key: 'meera', name: 'Meera Iyer', email: 'meera.iyer@example.com', phone: '+91 98400 77889', dob: '1999-06-18', address: '5 Beach Road, Chennai, Tamil Nadu 600041', kyc: 'rejected', rejectReason: 'The photo of the document is too blurry to read. Please upload a clear copy.', joinedAgo: 15, accounts: ['savings'], doc: { type: 'passport', status: 'rejected', ago: 9 } },
  { key: 'kabir', name: 'Kabir Singh', email: 'kabir.singh@example.com', phone: '+91 97000 12121', dob: '2000-11-09', address: '90 Model Town, Ludhiana, Punjab 141002', kyc: 'pending', joinedAgo: 1, accounts: [] },
  { key: 'ananya', name: 'Ananya Rao', email: 'ananya.rao@example.com', phone: '+91 98860 33445', dob: '1997-02-21', address: '33 Jubilee Hills, Hyderabad, Telangana 500033', kyc: 'verified', joinedAgo: 170, accounts: ['savings', 'salary'] },
  { key: 'vikram', name: 'Vikram Shah', email: 'vikram.shah@example.com', phone: '+91 98250 99001', dob: '1990-08-30', address: '12 Ellis Bridge, Ahmedabad, Gujarat 380006', kyc: 'verified', joinedAgo: 160, accounts: ['current'] },
  { key: 'isha', name: 'Isha Gupta', email: 'isha.gupta@example.com', phone: '+91 98110 24680', dob: '1995-12-05', address: '77 Sector 15, Gurugram, Haryana 122001', kyc: 'verified', joinedAgo: 150, accounts: ['savings'] },
  { key: 'dev', name: 'Dev Patel', email: 'dev.patel@example.com', phone: '+91 98790 13579', dob: '1993-03-14', address: '4 Alkapuri, Vadodara, Gujarat 390007', kyc: 'pending', joinedAgo: 6, accounts: ['savings'], doc: { type: 'passport', status: 'pending', ago: 1 } },
  { key: 'neha', name: 'Neha Joshi', email: 'neha.joshi@example.com', phone: '+91 98220 86420', dob: '1998-10-22', address: '19 Koregaon Park, Pune, Maharashtra 411001', kyc: 'verified', joinedAgo: 140, accounts: ['savings', 'current'] },
];

// Fixed, readable account numbers (with valid Luhn check digits) so the README can list them.
const numberFor = (n) => { const body = `4021883${String(n).padStart(2, '0')}`; return `${body}${luhnCheckDigit(body)}`; };

export const ACCOUNTS = (() => {
  const list = [];
  let n = 0;
  for (const p of PEOPLE) for (const type of p.accounts) { n += 1; list.push({ key: `${p.key}:${type}`, person: p.key, type, number: numberFor(n) }); }
  return list;
})();
export const accountNumberOf = (key) => ACCOUNTS.find((a) => a.key === key)?.number;

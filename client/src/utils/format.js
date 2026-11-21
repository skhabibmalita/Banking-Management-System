// All money values are integers in minor units (paise). Never use floats for balances.
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export const inr = (minor = 0) => inrFmt.format(minor / 100);
export const toMinor = (rupees) => Math.round(Number(rupees) * 100);
export const dateTime = (d) =>
  new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const dateOnly = (d) => new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' });
export const maskAccount = (n = '') => `•••• ${String(n).slice(-4)}`;
export const initials = (name = '') =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const cx = (...c) => c.filter(Boolean).join(' ');

export const DOC_TYPES = { aadhaar: 'Aadhaar card', pan: 'PAN card', passport: 'Passport', driving_licence: 'Driving licence' };
export const docTypeLabel = (code) => DOC_TYPES[code] || code;

// Same check-digit rule as the server (Luhn), so typos are caught before a transfer is sent.
export function isValidAccountNumber(value) {
  const s = String(value);
  if (!/^\d{10}$/.test(s)) return false;
  let sum = 0;
  [...s.slice(0, 9)].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  });
  return (10 - (sum % 10)) % 10 === Number(s[9]);
}

// Saves a Blob (PDF, CSV) to the user's device.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

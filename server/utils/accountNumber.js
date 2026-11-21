import crypto from 'node:crypto';

// Account numbers are 10 digits: a leading 4, eight random digits, and a Luhn check digit.
// The check digit catches most typing mistakes before a transfer is attempted.
export function luhnCheckDigit(payload) {
  let sum = 0;
  // Walk right to left; the payload sits left of the check digit, so its last digit is doubled.
  [...String(payload)].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  });
  return (10 - (sum % 10)) % 10;
}

export function isValidAccountNumber(value) {
  const s = String(value);
  return /^\d{10}$/.test(s) && luhnCheckDigit(s.slice(0, 9)) === Number(s[9]);
}

export function generateAccountNumber() {
  const payload = `4${String(crypto.randomInt(0, 100_000_000)).padStart(8, '0')}`;
  return `${payload}${luhnCheckDigit(payload)}`;
}

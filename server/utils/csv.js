// CSV output for reports. Cells that start with = + - @ (or tab/CR) are prefixed with an apostrophe,
// so a malicious customer name like =HYPERLINK(...) cannot run as a formula when opened in Excel.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const toCsv = (columns, rows) =>
  `${[columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n')}\r\n`;

// Integer paise to "1234.56" without floating-point maths.
export const rupees = (paise) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;

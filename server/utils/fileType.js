// Identifies a file from its first bytes. The browser-declared MIME type and the file extension
// are never trusted: a renamed .exe has neither the PDF nor the image signature.
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png', ext: 'png',
    test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const hit = SIGNATURES.find((s) => s.test(buffer));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

// Display-only: strips paths and control characters from a user-supplied file name.
export function cleanFileName(name = '') {
  const base = String(name).split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 200) || 'document';
}

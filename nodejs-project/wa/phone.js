// Normalisasi nomor telepon internasional (port dari ~/bot config.js).
// "+62 812..." / "62..." / "0812..." -> digit saja, leading 0 jadi 62.
export function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

export function normalizePhone(v) {
  let d = digitsOnly(v);
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  if (!d.startsWith('62')) d = '62' + d;
  return d;
}

export function isValidPhone(v) {
  const d = normalizePhone(v);
  return d.length >= 10 && d.length <= 15 ? d : null;
}

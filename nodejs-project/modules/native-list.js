// Daftar dependency yang menandakan modul BERAT/native.
// Aturan (revisi ACC user): modul yang memakai ini TETAP boleh dipasang,
// tapi bridge wajib mengembalikan warnings agar aplikasi menampilkan
// peringatan ke user. Inti daemon sendiri tidak memakai satupun dari ini.
export const NATIVE_DEP_HINTS = [
  'sharp',
  'fluent-ffmpeg',
  'ffmpeg',
  'node-webpmux',
  'canvas',
  'puppeteer',
  'puppeteer-core',
  'better-sqlite3',
  'sqlite3',
  '@napi-rs/canvas',
  'jimp',
];

export function findHeavyDeps(depNames) {
  const names = (depNames || []).map((d) => String(d).toLowerCase());
  return NATIVE_DEP_HINTS.filter((h) => names.some((n) => n === h || n.startsWith(h + '/')));
}

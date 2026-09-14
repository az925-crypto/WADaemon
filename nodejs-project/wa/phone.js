// Normalisasi nomor telepon (port dari ~/bot config.js + kenyamanan lokal).
// Aturan: digit saja; leading 0 dianggap Indonesia (0 -> 62).
// Nomor internasional lain (60..., 1..., 212...) dibiarkan apa adanya.
// "+62 812..." / "62..." / "0812..." -> 62812... ; "6012..." tetap 6012....
export function digitsOnly(v) {
  return String(v || '').replace(/\D/g, '');
}

export function normalizePhone(v) {
  let d = digitsOnly(v);
  if (!d) return '';
  // "00..." = prefix panggilan internasional -> buang nol-nya saja.
  if (d.startsWith('00')) return d.replace(/^0+/, '');
  // Satu "0" di depan = trunk lokal Indonesia -> ganti 62.
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

export function isValidPhone(v) {
  const d = normalizePhone(v);
  return d.length >= 10 && d.length <= 15 ? d : null;
}

const ALLOWED_JID_SERVERS = ['s.whatsapp.net', 'g.us', 'lid'];

// Resolve tujuan kirim jadi JID valid, atau null bila ditolak.
// - Tanpa @: nomor internasional (isValidPhone) -> <digit>@s.whatsapp.net.
// - Dengan @: server wajib allowlist. g.us (ID grup, bukan nomor HP)
//   dipertahankan apa adanya; s.whatsapp.net/lid wajib digit 10-15
//   (karakter asing seperti huruf di user part = tolak, bukan di-strip
//   diam-diam agar tidak terkirim ke nomor yang salah).
export function resolveJid(to) {
  const raw = String(to || '').trim();
  if (!raw) return null;
  if (!raw.includes('@')) {
    const valid = isValidPhone(raw);
    return valid ? `${valid}@s.whatsapp.net` : null;
  }
  const at = raw.lastIndexOf('@');
  const userRaw = raw.slice(0, at);
  const server = raw.slice(at + 1).toLowerCase();
  if (!ALLOWED_JID_SERVERS.includes(server)) return null;
  if (server === 'g.us') {
    return userRaw.trim() ? `${userRaw.trim()}@g.us` : null;
  }
  if (!/^\+?[0-9\s\-()]+$/.test(userRaw)) return null;
  // Normalisasi sama seperti jalur tanpa @ (0 lokal -> 62, 00 -> strip).
  const user = normalizePhone(userRaw);
  if (user.length < 10 || user.length > 15) return null;
  return `${user}@${server}`;
}

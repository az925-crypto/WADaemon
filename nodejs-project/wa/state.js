// Status koneksi terpusat. Satu-satunya penulis status adalah wa/connection.js
// lewat setter di bawah; bridge/server.js hanya membaca via snapshot().
const S = {
  status: 'unpaired', // unpaired | pairing | connected | disconnected | logged_out
  code: null,
  phoneNumber: null,
  lastConnectedAt: null,
  lastError: null,
  waiters: new Set(),
};

export function snapshot() {
  return {
    status: S.status,
    code: S.code,
    phoneNumber: S.phoneNumber,
    lastConnectedAt: S.lastConnectedAt,
    lastError: S.lastError,
  };
}

export function setStatus(patch) {
  Object.assign(S, patch);
  if (patch.status && patch.status !== 'pairing') S.code = patch.code ?? null;
  for (const w of S.waiters) {
    try { w(snapshot()); } catch {}
  }
}

// Tunggu hingga kode pairing tersedia (dipakai POST /pair agar sesuai PRD:
// response langsung berisi { code }). Timeout -> null.
export function waitForCode(timeoutMs = 15000) {
  if (S.code) return Promise.resolve(S.code);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      S.waiters.delete(onChange);
      resolve(S.code);
    }, timeoutMs);
    function onChange(snap) {
      if (snap.code) {
        clearTimeout(timer);
        S.waiters.delete(onChange);
        resolve(snap.code);
      }
    }
    S.waiters.add(onChange);
  });
}

export function reset() {
  S.status = 'unpaired';
  S.code = null;
  S.phoneNumber = null;
  S.lastConnectedAt = null;
  S.lastError = null;
}

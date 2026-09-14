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
  const prev = S.status;
  // Pairing tanpa field code = tidak ada kode (bukan kode lama dipertahankan).
  if (patch.status === 'pairing' && !('code' in patch)) patch.code = null;
  Object.assign(S, patch);
  if (patch.status && patch.status !== 'pairing') S.code = patch.code ?? null;
  if (patch.status && patch.status !== prev) {
    addLog('bridge', `status: ${prev} -> ${patch.status}` +
      (patch.phoneNumber ? ` (${patch.phoneNumber})` : '') +
      (patch.lastError ? ` | ${String(patch.lastError).slice(0, 160)}` : ''));
  } else if (patch.lastError) {
    addLog('bridge', `error: ${String(patch.lastError).slice(0, 200)}`);
  }
  for (const w of S.waiters) {
    try { w(snapshot()); } catch {}
  }
}

// Tunggu hasil pairing: kode BARU, atau status final yang membuat kode
// tidak akan datang (connected/logged_out) agar POST /pair tidak gantung
// 20 dtk lalu 504 palsu saat sesi sebenarnya sudah valid.
export function waitForPairResult(timeoutMs = 20000) {
  const cur = snapshot();
  if (cur.code) return Promise.resolve({ type: 'code', code: cur.code });
  if (cur.status === 'connected') return Promise.resolve({ type: 'connected' });
  if (cur.status === 'logged_out') return Promise.resolve({ type: 'logged_out' });
  // Logout menyalip sebelum wait dimulai (reset saat requestPair in-flight).
  if (cur.status === 'unpaired') return Promise.resolve({ type: 'reset' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ type: 'timeout' });
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      S.waiters.delete(onChange);
    }
    function onChange(snap) {
      if (snap.code) {
        cleanup();
        resolve({ type: 'code', code: snap.code });
      } else if (snap.status === 'connected') {
        cleanup();
        resolve({ type: 'connected' });
      } else if (snap.status === 'logged_out') {
        cleanup();
        resolve({ type: 'logged_out' });
      } else if (snap.status === 'unpaired') {
        // Sesi direset (logout) saat menunggu -> batal cepat, bukan 20 dtk.
        cleanup();
        resolve({ type: 'reset' });
      }
    }
    S.waiters.add(onChange);
  });
}

// Dipanggil di awal POST /pair agar waitForPairResult tidak langsung resolve
// kode basi dari percobaan sebelumnya.
export function clearCode() {
  S.code = null;
}

// Ring buffer log ringan (maks 200) untuk tab Log di aplikasi.
// Disimpan di memori saja; hilang saat app restart (sesuai sifat daemon).
const LOGS = [];
const LOG_MAX = 200;

export function addLog(src, msg) {
  LOGS.push({ t: Date.now(), src: String(src || 'bridge'), msg: String(msg || '').slice(0, 300) });
  if (LOGS.length > LOG_MAX) LOGS.splice(0, LOGS.length - LOG_MAX);
}

export function getLogs(limit = 100) {
  return LOGS.slice(-Math.max(1, Math.min(limit, LOG_MAX)));
}

export function reset() {
  S.status = 'unpaired';
  S.code = null;
  S.phoneNumber = null;
  S.lastConnectedAt = null;
  S.lastError = null;
  addLog('bridge', 'status: logout -> unpaired (sesi dihapus)');
  for (const w of S.waiters) {
    try { w(snapshot()); } catch {}
  }
}

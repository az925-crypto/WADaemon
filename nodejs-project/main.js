import fs from 'node:fs';
import path from 'node:path';
import { createServer } from './bridge/server.js';
import { createCore } from './wa/connection.js';

// Env (diisi Kotlin saat start; default agar bisa jalan di Termux untuk tes):
//   WA_SESSION_DIR  default ./wa-session   (wajib di luar nodejs-project di APK)
//   WA_MODULES_DIR  default ./modules
//   BRIDGE_PORT     default 3939  (hanya didengar di 127.0.0.1, lihat listen di bawah)
const PORT = parseInt(process.env.BRIDGE_PORT || '3939', 10) || 3939;
const SESSION_DIR = process.env.WA_SESSION_DIR || path.resolve('./wa-session');
const MODULES_DIR = process.env.WA_MODULES_DIR || path.resolve('./modules');

let pendingPhone = null;
let core = null;

const ctx = {
  get core() { return core; },
  setPendingPhone(p) { pendingPhone = p; },
  async ensureCore() {
    if (core) return core;
    await fs.promises.mkdir(SESSION_DIR, { recursive: true });
    await fs.promises.mkdir(MODULES_DIR, { recursive: true });
    core = await createCore({ sessionDir: SESSION_DIR, getPhoneNumber: () => pendingPhone });
    return core;
  },
  resetCore() { core = null; pendingPhone = null; },
  async clearSession() {
    try {
      const files = await fs.promises.readdir(SESSION_DIR);
      await Promise.all(files.map((f) => fs.promises.rm(path.join(SESSION_DIR, f), { recursive: true, force: true })));
    } catch {}
  },
  sessionDir: SESSION_DIR,
  modulesDir: MODULES_DIR,
};

const server = createServer(ctx);
// Loopback saja, sesuai PRD: tidak boleh diakses device lain di jaringan.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listen 127.0.0.1:${PORT} session=${SESSION_DIR} modules=${MODULES_DIR}`);
});

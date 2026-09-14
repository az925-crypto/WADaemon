import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from './bridge/server.js';
import { createCore } from './wa/connection.js';
import { addLog, getLogs } from './wa/state.js';
import { resolveJid } from './wa/phone.js';
import { listModules } from './modules/loader.js';

// Env (diisi Kotlin saat start; default agar bisa jalan di Termux untuk tes):
//   WA_SESSION_DIR  default ./wa-session   (wajib di luar nodejs-project di APK)
//   WA_MODULES_DIR  default ./modules
//   BRIDGE_PORT     default 3939  (hanya didengar di 127.0.0.1, lihat listen di bawah)
const PORT = parseInt(process.env.BRIDGE_PORT || '3939', 10) || 3939;
const SESSION_DIR = process.env.WA_SESSION_DIR || path.resolve('./wa-session');
const MODULES_DIR = process.env.WA_MODULES_DIR || path.resolve('./modules');

// Auth bridge: token acak per boot, disimpan mode 0600 di filesDir sejajar
// wa-session. Loopback dipakai bersama semua app di device, jadi bind saja
// tidak cukup — tiap request wajib header X-Bridge-Token (lihat server.js).
// Kotlin membaca file yang sama (WaApi.init).
const BRIDGE_TOKEN = crypto.randomBytes(32).toString('hex');
const TOKEN_PATH = path.join(path.dirname(SESSION_DIR), 'bridge.token');

let pendingPhone = null;
let core = null;
// Pembuatan core yang sedang berjalan dibagi ke semua pemanggil (auto-connect
// vs /pair pertama) agar tidak ada dua socket bocor.
let corePromise = null;
let stopAfterCreate = false;
const bootTime = Date.now();
let forwarded = 0;
// Cache handler modul (kode di-cache ESM; cek enabled tetap fresh via
// getEnabled() agar toggle on/off langsung berlaku tanpa restart).
const handlerCache = new Map(); // id -> { handler } | { error }
// Cache daftar modul 3 dtk agar chat ramai tidak readdirSync tiap pesan.
// Di-invalidate di /modules/reload (dipanggil Kotlin tiap toggle/tambah).
let modCache = { at: 0, list: [] };

function getEnabled() {
  const now = Date.now();
  if (now - modCache.at > 3000) {
    try {
      modCache = { at: now, list: listModules(MODULES_DIR) };
    } catch {
      return [];
    }
  }
  // Modul perintah spesifik dulu, catch-all (commands=[]) terakhir agar
  // tidak men-starve modul spesifik (urutan readdir tak tentu).
  return modCache.list
    .filter((m) => m.enabled)
    .sort((a, b) => (b.commands?.length || 0) - (a.commands?.length || 0));
}

function clearModCache() {
  modCache = { at: 0, list: [] };
}

function extractText(msg) {
  let m = msg.message || {};
  // Bungkus sekali-pakai: ephemeral / view-once.
  m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;
  return m.conversation
    || m.extendedTextMessage?.text
    || m.imageMessage?.caption
    || m.videoMessage?.caption
    || m.documentMessage?.caption
    || m.buttonsResponseMessage?.selectedDisplayText
    || m.listResponseMessage?.title
    || '';
}

async function getHandler(id) {
  if (handlerCache.has(id)) return handlerCache.get(id);
  const entry = {};
  try {
    const modUrl = pathToFileURL(path.join(MODULES_DIR, id, 'index.js')).href;
    const mod = await import(modUrl);
    const fn = mod.default || mod.onMessage || mod.handle;
    entry.handler = typeof fn === 'function' ? fn : null;
  } catch (e) {
    entry.error = e;
    entry.handler = null;
    addLog('modul', `${id}: gagal dimuat (${String(e?.message || e).slice(0, 120)})`);
  }
  handlerCache.set(id, entry);
  return entry;
}

async function handleIncoming(sock, data) {
  const { messages, type } = data || {};
  if (type !== 'notify' || !Array.isArray(messages)) return;
  const enabled = getEnabled();
  if (!enabled.length) return;
  for (const msg of messages) {
    try {
      if (!msg?.message || msg.key?.fromMe) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;
      const text = extractText(msg).trim();
      if (!text) continue;
      const chatId = msg.key?.remoteJid || '';
      const senderJid = msg.key?.participant || msg.key?.remoteJid || '';
      const first = text.split(/\s+/)[0];
      for (const mod of enabled) {
        if (mod.commands?.length && !mod.commands.includes(first)) continue;
        const { handler } = await getHandler(mod.id);
        if (!handler) continue;
        // API least-privilege: modul hanya dapat kirim teks ke chat ini,
        // TANPA objek sock mentah (tidak bisa logout/utak-atik sesi).
        const api = {
          chatId,
          text,
          senderJid,
          isGroup: chatId.endsWith('@g.us'),
          moduleId: mod.id,
          send: (t) => sock.sendMessage(chatId, { text: String(t) }),
          reply: (t) => sock.sendMessage(chatId, { text: String(t) }, { quoted: msg }),
        };
        try {
          await handler(api);
          forwarded++;
        } catch (e) {
          console.error(`[modules] ${mod.id} error:`, e?.message || e);
          addLog('modul', `${mod.id}: error (${String(e?.message || e).slice(0, 120)})`);
        }
        break; // satu pesan ditangani satu modul pertama yang cocok
      }
    } catch {}
  }
}

const ctx = {
  token: BRIDGE_TOKEN,
  get core() { return core; },
  setPendingPhone(p) { pendingPhone = p; },
  async ensureCore() {
    if (core) return core;
    if (corePromise) return corePromise;
    corePromise = (async () => {
      await fs.promises.mkdir(SESSION_DIR, { recursive: true });
      await fs.promises.mkdir(MODULES_DIR, { recursive: true });
      const c = await createCore({
        sessionDir: SESSION_DIR,
        getPhoneNumber: () => pendingPhone,
        onMessage: handleIncoming,
      });
      if (stopAfterCreate) {
        stopAfterCreate = false;
        try { c.stop(); } catch {}
        return core;
      }
      if (!core) core = c;
      else { try { c.stop(); } catch {} }
      return core;
    })();
    try {
      return await corePromise;
    } finally {
      corePromise = null;
    }
  },
  get creating() { return corePromise !== null; },
  resetCore() {
    if (corePromise) stopAfterCreate = true;
    try { core?.stop(); } catch {}
    core = null; pendingPhone = null; forwarded = 0; handlerCache.clear(); clearModCache();
  },
  reloadModules() {
    clearModCache();
    handlerCache.clear();
    return listModules(MODULES_DIR);
  },
  async clearSession() {
    try {
      const files = await fs.promises.readdir(SESSION_DIR);
      await Promise.all(files.map((f) => fs.promises.rm(path.join(SESSION_DIR, f), { recursive: true, force: true })));
    } catch {}
  },
  sessionDir: SESSION_DIR,
  modulesDir: MODULES_DIR,
  stats() {
    let modulesActive = 0;
    try { modulesActive = listModules(MODULES_DIR).filter((m) => m.enabled).length; } catch {}
    return { forwarded, modulesActive, uptimeSec: Math.floor((Date.now() - bootTime) / 1000) };
  },
  async sendMessage(to, text) {
    const sock = core?.getSock?.();
    if (!sock) throw new Error('Belum terhubung ke WhatsApp.');
    if (!text || !String(text).trim()) throw new Error('Pesan kosong.');
    const jid = resolveJid(to);
    if (!jid) throw new Error('Tujuan tidak valid.');
    await sock.sendMessage(jid, { text: String(text) });
  },
  getLogs(limit) { return getLogs(limit || 100); },
};

const server = createServer(ctx);
// Loopback saja, sesuai PRD: tidak boleh diakses device lain di jaringan.
// Auth tetap wajib via X-Bridge-Token (loopback dipakai bersama se-device).
try {
  await fs.promises.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.promises.writeFile(TOKEN_PATH, BRIDGE_TOKEN, { mode: 0o600 });
  // mode hanya berlaku saat create; paksa 0600 tiap boot (file lama/restore).
  await fs.promises.chmod(TOKEN_PATH, 0o600).catch(() => {});
} catch (e) {
  console.error('[bridge] gagal tulis token:', e?.message || e);
}
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listen 127.0.0.1:${PORT} session=${SESSION_DIR} modules=${MODULES_DIR}`);
  addLog('bridge', `listen 127.0.0.1:${PORT}`);
  // Auto-connect (UC2): sesi tersimpan -> langsung konek tanpa tunggu /pair.
  fs.promises.readdir(SESSION_DIR).then(async (files) => {
    if (files.length && !core) {
      addLog('bridge', 'sesi tersimpan ditemukan, auto-connect...');
      try { await ctx.ensureCore(); } catch (e) {
        addLog('bridge', `auto-connect gagal: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
  }).catch(() => {});
});

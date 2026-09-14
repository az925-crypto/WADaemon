import http from 'node:http';
import { isValidPhone } from '../wa/phone.js';
import { snapshot, reset, setStatus, clearCode, getLogs, waitForPairResult } from '../wa/state.js';
import { listModules } from '../modules/loader.js';

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const BODY_MAX = 64 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    let tooLarge = false;
    req.on('data', (c) => {
      if (tooLarge) return;
      s += c;
      if (s.length > BODY_MAX) {
        tooLarge = true;
        try { req.destroy(); } catch {}
        reject(new Error('PAYLOAD_TOO_LARGE'));
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ctx: { token, core (dibuat lazy saat /pair pertama / auto-connect),
//        creating, ensureCore(), sessionDir, modulesDir, clearSession(),
//        stats(), sendMessage(), getLogs(), reloadModules() }
export function createServer(ctx) {
  // /pair ditahan satu per satu: konkuren menukar kode/nomor (last-writer-wins).
  let pairBusy = false;

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      // Loopback dipakai bersama semua app se-device -> token wajib di semua
      // endpoint (token acak per boot, file 0600 di filesDir, baca via WaApi).
      if (req.headers['x-bridge-token'] !== ctx.token) {
        return json(res, 401, { error: 'Unauthorized.' });
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        return json(res, 200, snapshot());
      }

      if (req.method === 'GET' && url.pathname === '/stats') {
        return json(res, 200, ctx.stats ? ctx.stats() : { forwarded: 0, modulesActive: 0, uptimeSec: 0 });
      }

      if (req.method === 'GET' && url.pathname === '/logs') {
        const raw = parseInt(url.searchParams.get('limit') || '100', 10);
        const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 200)) : 100;
        return json(res, 200, { logs: ctx.getLogs ? ctx.getLogs(limit) : getLogs(limit) });
      }

      if (req.method === 'GET' && url.pathname === '/modules') {
        return json(res, 200, { modules: listModules(ctx.modulesDir) });
      }

      if (req.method === 'POST' && url.pathname === '/modules/reload') {
        const modules = ctx.reloadModules ? ctx.reloadModules() : listModules(ctx.modulesDir);
        return json(res, 200, { ok: true, count: modules.length, modules });
      }

      if (req.method === 'POST' && url.pathname === '/send') {
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          if (e?.message === 'PAYLOAD_TOO_LARGE') return json(res, 413, { error: 'Body terlalu besar (maks 64KB).' });
          return json(res, 400, { error: 'Body bukan JSON valid.' });
        }
        const to = String(body.to || '').trim();
        const text = String(body.text || '');
        if (!to || !text) return json(res, 400, { error: 'Perlu { to, text }.' });
        try {
          await ctx.sendMessage(to, text);
          return json(res, 200, { ok: true });
        } catch (e) {
          return json(res, 400, { error: String(e?.message || e).slice(0, 300) });
        }
      }

      if (req.method === 'POST' && url.pathname === '/pair') {
        // Baca + validasi dulu; cek-and-set pairBusy TANPA await di antaranya
        // (JS single-threaded -> atomik, tidak ada TOCTOU antar request).
        let body;
        try {
          body = await readBody(req);
        } catch (e) {
          if (e?.message === 'PAYLOAD_TOO_LARGE') return json(res, 413, { error: 'Body terlalu besar (maks 64KB).' });
          return json(res, 400, { error: 'Body bukan JSON valid.' });
        }
        const phone = isValidPhone(body.phoneNumber);
        if (!phone) {
          return json(res, 400, { error: 'Nomor tidak valid. Pakai format internasional, contoh 0812..., 62..., atau +62....' });
        }
        // Sesi ini sudah terhubung dengan nomor yang sama -> tolak TANPA
        // efek samping (jangan end+reconnect sesi aktif).
        const snap0 = snapshot();
        if (snap0.status === 'connected' && snap0.phoneNumber === phone) {
          return json(res, 409, { error: 'Nomor ini sudah terhubung, tidak perlu pairing ulang.', status: 'connected' });
        }
        if (pairBusy) return json(res, 429, { error: 'Pairing sedang berjalan, tunggu selesai dulu.' });
        pairBusy = true;
        try {
          // Bersihkan kode basi dulu agar response tidak berisi kode lama.
          clearCode();
          setStatus({ status: 'pairing', phoneNumber: phone, code: null });
          ctx.setPendingPhone(phone);
          // Core baru sudah connect sekali dengan nomor ini -> jangan
          // di-end + connect ulang (double-connect + race status).
          // Pembuatan yang masih in-flight (auto-connect) dihitung TIDAK
          // fresh: pemanggil ini bergabung lalu requestPair ulang dengan
          // nomornya setelah pembuatan selesai.
          const fresh = !ctx.core && !ctx.creating;
          try {
            await ctx.ensureCore();
          } catch (e) {
            // Rollback: jangan tinggalkan status pairing basi.
            setStatus({ status: 'disconnected', code: null, lastError: String(e?.message || e).slice(0, 200) });
            return json(res, 500, { error: String(e?.message || e).slice(0, 300) });
          }
          if (!ctx.core) {
            // Logout menimpa pembuatan yang in-flight -> mulai lagi saja.
            setStatus({ status: 'unpaired', code: null });
            return json(res, 409, { error: 'Sesi direset saat pairing dimulai, coba lagi.' });
          }
          if (!fresh) await ctx.core.requestPair();
          const r = await waitForPairResult(20000);
          if (r.type === 'code') return json(res, 200, { code: r.code });
          if (r.type === 'connected') {
            return json(res, 409, { error: 'Sesi ini sudah terhubung, tidak perlu pairing ulang.', status: 'connected' });
          }
          if (r.type === 'logged_out') {
            return json(res, 409, { error: 'Sesi keluar (logged out). Hapus sesi lalu pairing ulang.', status: 'logged_out' });
          }
          if (r.type === 'reset') {
            return json(res, 409, { error: 'Sesi direset saat menunggu kode, coba lagi.' });
          }
          return json(res, 504, { error: 'Kode pairing tidak datang dalam 20 detik. Coba lagi.' });
        } finally {
          pairBusy = false;
        }
      }

      if (req.method === 'POST' && url.pathname === '/logout') {
        try { ctx.core?.stop(); } catch {}
        ctx.resetCore();
        reset();
        await ctx.clearSession();
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: 'Tidak dikenal.' });
    } catch (e) {
      return json(res, 500, { error: String(e?.message || e).slice(0, 300) });
    }
  });
}

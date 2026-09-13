import http from 'node:http';
import { isValidPhone } from '../wa/phone.js';
import { snapshot, waitForCode, reset, setStatus } from '../wa/state.js';
import { listModules } from '../modules/loader.js';

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!s) return resolve({});
      try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ctx: { core (dibuat lazy saat /pair pertama), ensureCore(), sessionDir,
//        modulesDir, clearSession() }
export function createServer(ctx) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (req.method === 'GET' && url.pathname === '/status') {
        return json(res, 200, snapshot());
      }

      if (req.method === 'GET' && url.pathname === '/modules') {
        return json(res, 200, { modules: listModules(ctx.modulesDir) });
      }

      if (req.method === 'POST' && url.pathname === '/modules/reload') {
        const modules = listModules(ctx.modulesDir);
        return json(res, 200, { ok: true, count: modules.length, modules });
      }

      if (req.method === 'POST' && url.pathname === '/pair') {
        let body;
        try { body = await readBody(req); } catch { return json(res, 400, { error: 'Body bukan JSON valid.' }); }
        const phone = isValidPhone(body.phoneNumber);
        if (!phone) {
          return json(res, 400, { error: 'Nomor tidak valid. Pakai format internasional, contoh 0812..., 62..., atau +62....' });
        }
        ctx.setPendingPhone(phone);
        await ctx.ensureCore();
        await ctx.core.requestPair();
        setStatus({ status: 'pairing', phoneNumber: phone });
        const code = await waitForCode(20000);
        if (!code) {
          return json(res, 504, { error: 'Kode pairing tidak datang dalam 20 detik. Coba lagi.' });
        }
        return json(res, 200, { code });
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

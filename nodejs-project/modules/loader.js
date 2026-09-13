import fs from 'node:fs';
import path from 'node:path';
import { findHeavyDeps } from './native-list.js';

// Loader modul MVP: daftar + validasi + peringatan. Eksekusi kode modul
// (sandbox/isolasi crash) masuk tahap M4 — file ini tidak me-require kode
// modul agar satu modul rusak tidak menjatuhkan bridge.
//
// Struktur per modul di WA_MODULES_DIR/<id>/ :
//   manifest.json { name, version, commands[], enabled, heavy? }
//   package.json  (opsional, dipakai untuk deteksi dep berat)
//   index.js      (diekssekusi mulai M4)
export function listModules(modulesDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(modulesDir, e.name);
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    } catch {
      out.push({
        id: e.name, name: e.name, version: '?', commands: [], enabled: false,
        warnings: ['Manifest tidak valid atau tidak ada, modul dilewati.'],
      });
      continue;
    }
    const warnings = [];
    let depNames = [];
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      depNames = Object.keys(pkg.dependencies || {});
    } catch {}
    const heavy = findHeavyDeps(depNames);
    if (heavy.length || manifest.heavy === true) {
      const what = heavy.length ? heavy.join(', ') : 'ditandai modul';
      warnings.push(
        `Modul memakai library berat/native (${what}). Tetap bisa dipasang dan dijalankan, ` +
        `tapi bisa menambah RAM/baterai atau gagal di sebagian device.`,
      );
    }
    out.push({
      id: e.name,
      name: String(manifest.name || e.name),
      version: String(manifest.version || '0.1'),
      commands: Array.isArray(manifest.commands) ? manifest.commands.map(String) : [],
      enabled: manifest.enabled !== false,
      warnings,
    });
  }
  return out;
}

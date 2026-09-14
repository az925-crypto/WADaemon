import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhone, isValidPhone, resolveJid } from '../wa/phone.js';
import { setStatus, snapshot, clearCode, reset, waitForPairResult } from '../wa/state.js';
import { findHeavyDeps } from '../modules/native-list.js';
import { listModules } from '../modules/loader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(here, '..'));

// 1. Normalisasi nomor (edge PRD: +62 vs 62 vs 0)
assert.equal(normalizePhone('081234567890'), '6281234567890');
assert.equal(normalizePhone('6281234567890'), '6281234567890');
assert.equal(normalizePhone('+62 812-3456-7890'), '6281234567890');
assert.equal(isValidPhone('081234567890'), '6281234567890');
assert.equal(isValidPhone('abc'), null);
assert.equal(isValidPhone('123'), null);

// 1b. Nomor internasional tidak dipaksa jadi 62; leading 0 = Indonesia
assert.equal(normalizePhone('60123456789'), '60123456789');
assert.equal(normalizePhone('+1 202-555-0123'), '12025550123');
assert.equal(isValidPhone('60123456789'), '60123456789');
assert.equal(normalizePhone('006281234567890'), '6281234567890');

// 1c. Kode basi dibersihkan di awal /pair
reset();
setStatus({ status: 'pairing', code: 'LAMA1234', phoneNumber: '6281' });
clearCode();
assert.equal(snapshot().code, null);

// 1d. digitsOnly(0 angka) -> '' (falsy), bukan '62'
assert.equal(normalizePhone(0), '');
assert.equal(isValidPhone(0), null);

// 1e. waitForPairResult: kode langsung, connected langsung, pairing-tanpa-code -> null
reset();
setStatus({ status: 'pairing', code: 'ABC123', phoneNumber: '6281' });
assert.equal((await waitForPairResult(1000)).type, 'code');
reset();
setStatus({ status: 'connected', phoneNumber: '6281' });
assert.equal((await waitForPairResult(1000)).type, 'connected');
reset();
setStatus({ status: 'pairing', phoneNumber: '6281' });
assert.equal(snapshot().code, null);

// 1f. resolveJid: digit, @ valid, tolak asing/tanpa-izinkan
assert.equal(resolveJid('081234567890'), '6281234567890@s.whatsapp.net');
assert.equal(resolveJid('60123456789'), '60123456789@s.whatsapp.net');
assert.equal(resolveJid('120363012345-678901@g.us'), '120363012345-678901@g.us');
assert.equal(resolveJid('abc6281234567890@s.whatsapp.net'), null);
assert.equal(resolveJid('6281@s.whatsapp.net'), null);
assert.equal(resolveJid('x@y.com'), null);
assert.equal(resolveJid(''), null);
// @-path dinormalisasi sama (0 lokal -> 62)
assert.equal(resolveJid('081234567890@s.whatsapp.net'), '6281234567890@s.whatsapp.net');

// 1g. reset saat menunggu -> batal cepat (bukan gantung 20 dtk)
reset();
setStatus({ status: 'pairing', phoneNumber: '6281', code: null });
const pending = waitForPairResult(5000);
reset();
assert.equal((await pending).type, 'reset');

// 2. Deteksi dep berat/native
assert.deepEqual(findHeavyDeps(['sharp', 'pino']), ['sharp']);
assert.deepEqual(findHeavyDeps(['pino']), []);
assert.deepEqual(findHeavyDeps(['fluent-ffmpeg', 'baileys']), ['fluent-ffmpeg']);

// 3. Loader: manifest rusak + modul berat memberi warnings, tetap terdaftar
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wamod-'));
fs.mkdirSync(path.join(tmp, 'menu'));
fs.writeFileSync(path.join(tmp, 'menu', 'manifest.json'), JSON.stringify({
  name: 'Menu dan Perintah', version: '1.2', commands: ['.menu', '.ping'], enabled: true,
}));
fs.mkdirSync(path.join(tmp, 'stiker'));
fs.writeFileSync(path.join(tmp, 'stiker', 'manifest.json'), JSON.stringify({
  name: 'Stiker', version: '0.9', commands: ['.stiker'], enabled: true,
}));
fs.writeFileSync(path.join(tmp, 'stiker', 'package.json'), JSON.stringify({
  dependencies: { sharp: '^0.30.0' },
}));
fs.mkdirSync(path.join(tmp, 'rusak')); // tanpa manifest

const mods = listModules(tmp);
assert.equal(mods.length, 3);
const menu = mods.find((m) => m.id === 'menu');
assert.equal(menu.warnings.length, 0);
assert.equal(menu.enabled, true);
const stiker = mods.find((m) => m.id === 'stiker');
assert.equal(stiker.warnings.length, 1);
assert.match(stiker.warnings[0], /Tetap bisa dipasang/);
const rusak = mods.find((m) => m.id === 'rusak');
assert.equal(rusak.enabled, false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ALL TESTS PASS');

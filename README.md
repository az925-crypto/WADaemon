# WADaemon

Daemon konektivitas WhatsApp on-device (`com.zaaaam.wadaemon`).

- Baileys jalan di Node yang di-embed (nodejs-mobile), tanpa Termux/VPS.
- Pairing pakai nomor telepon + kode 8 digit (tanpa QR).
- Modul bot lain (game, AI, dsb) konsumsi WADaemon lewat local HTTP bridge
  `127.0.0.1:3939` — daemon tidak berisi fitur bot spesifik.

## Aturan build (wajib)

- Build/test berat (Gradle) **hanya di GitHub Action**, bukan di HP.
- Tiap tag `v*` membangun APK release dan mengunggahnya ke GitHub Release.
- UI final menunggu persetujuan mockup HTML (`mockup/`) via Telegram.

## Status

M1 (JNI + Node embed), M2 (pairing nomor + auto-reconnect + logout),
M3 (foreground service + notif persistent + UI status 4 tab),
M4 (loader + eksekusi modul + bridge kirim/terima) — implementasi selesai,
menunggu uji device fisik + CI hijau.

Bridge `127.0.0.1:3939` (auth header `X-Bridge-Token`, token per boot di
`filesDir/bridge.token`): `POST /pair`, `GET /status`, `POST /logout`,
`GET /stats`, `GET /logs`, `GET /modules`, `POST /modules/reload`,
`POST /send`. Modul: `filesDir/modules/<id>/{manifest.json,index.js}`,
handler `export default async ({ chatId, text, send, reply }) => {...}`.

## Dokumen

- `docs/CATATAN_NATIVE_LIB.md` — batasan lib Node native (mis. wa-sticker-formatter).

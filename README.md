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

Skeleton awal (M0): project Android minimal + workflow release.
`MainActivity` saat ini placeholder — UI asli mengikuti mockup yang di-approve.

## Dokumen

- `docs/CATATAN_NATIVE_LIB.md` — batasan lib Node native (mis. wa-sticker-formatter).

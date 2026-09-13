# Catatan lib Node native — WADaemon

Keputusan (revisi atas permintaan user): **modul boleh memakai library apa
pun, termasuk yang berat atau membawa binding native** (contoh:
wa-sticker-formatter via sharp/ffmpeg). Syaratnya: saat pasang, aplikasi
wajib menampilkan **peringatan** (berat, bisa gagal di sebagian device,
bisa menambah RAM/baterai), tapi instalasi tetap dilanjutkan.

Inti daemon sendiri tetap pure-JS agar selalu ringan dan stabil.

## Contoh konkret: wa-sticker-formatter (tidak bisa di daemon)

Dependensinya (cek npm 2026):
- `sharp ^0.30` — native C++ (libvips), wajib cross-compile NDK per ABI.
  Hampir pasti gagal di nodejs-mobile.
- `fluent-ffmpeg ^2.1.2` — butuh binary `ffmpeg` terpisah (tidak ada bawaan Android).
- `node-webpmux ^3.1.0` — native juga.

## Pola pengganti (pilih satu per fitur)

1. **Konversi di Kotlin native** (prioritas untuk stiker/gambar):
   Android sudah punya Bitmap/WebP bawaan — crop/resize di Kotlin,
   kirim byte hasilnya ke Node lewat bridge. Tanpa `sharp`/`ffmpeg`.
2. **Modul luar** — proses berat jalan di proses terpisah,
   hasilnya dikirim lewat bridge `127.0.0.1:3939`.
3. **Lib pure-JS** — cari pengganti tanpa native (fitur terbatas, tapi jalan).

## Aturan cepat

Kalau sebuah lib Node membawa `sharp` / `ffmpeg` / `canvas` / `puppeteer`
/ `better-sqlite3` (atau sejenisnya), anggap TIDAK bisa di daemon —
langsung ambil jalur Kotlin native atau modul luar.

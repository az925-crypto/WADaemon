# Fitur penuh WADaemon (revisi scope — modul dikelola di dalam app)

PRD awal (§26) bilang modul bot terpisah di luar app. Atas permintaan user,
manajemen modul masuk ke dalam aplikasi. Modul boleh memakai library apa
pun (termasuk berat/native) — aplikasi cukup menampilkan peringatan saat
pasang, instalasi tetap jalan.

## Aturan global
- Tanpa emoji di mana pun di aplikasi (teks, ikon, notifikasi, log).

## 1. Dashboard (tab Beranda)
- Kartu status koneksi WA: unpaired / pairing / connected / disconnected + error spesifik
- Pairing: input nomor (normalisasi +62 otomatis), kode 8-digit + countdown 60 dtk + salin
- Statistik: pesan diteruskan, modul aktif, uptime bridge
- Ringkasan modul + aksi cepat (pairing baru / putuskan sesi + dialog konfirmasi)

## 2. Modul (tab Modul) — BARU, di luar PRD awal
- Daftar modul: nama, versi, perintah (mis. `.menu .help .ping`), toggle on/off
- Tambah modul: dari file `.js`, dari URL (git/raw), atau dari template bawaan
- Detail modul: deskripsi, daftar perintah, konfigurasi sederhana, log per modul, hapus
- Model MVP: 1 modul = 1 file JS + manifest (nama, versi, perintah, enabled),
  disimpan di `filesDir/modules` (BUKAN di `nodejs-project`, ikut aturan sesi §15)

## 3. Log (tab Log)
- Log bridge + log per modul, filter per sumber, salin/hapus

## 4. Pengaturan (tab Pengaturan)
- Izin notifikasi (Android 13+), bebas optimasi baterai, tentang aplikasi

## Batasan yang tetap berlaku
- 1 nomor WA per instalasi; 1 instance Node per proses (crash modul = restart app)

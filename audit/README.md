# Catatan audit

Semua laporan audit repo FS Inspection, urut tanggal. Setiap ronde menambah satu
berkas baru; temuan lama tidak dihapus supaya keputusan bisa ditelusuri.

| Berkas | Rentang | Isi utama |
|---|---|---|
| [`AUDIT-2026-10-24.md`](AUDIT-2026-10-24.md) | ronde 1–5 | audit awal menyeluruh, tombol mati, tema gelap, mapping kolom sheet, perbaikan Repair, uji data sheet ↔ web pertama |
| [`AUDIT-2026-10-27.md`](AUDIT-2026-10-27.md) | ronde 6 | UI 6 rute × 3 lebar layar, kepatuhan layout, penyimpangan kecil |
| [`AUDIT-2026-10-28.md`](AUDIT-2026-10-28.md) | ronde 7 | sinkron satu pintu, rev berbasis isi, keseragaman kartu per baris |
| [`AUDIT-2026-10-30.md`](AUDIT-2026-10-30.md) | ronde 8–11 | performa 1.9.14, kebenaran deployment 1.9.15, Pengaturan 1.9.16, Peta Minggu Service 1.9.17 (§14), **kebenaran data sheet ↔ web 1.9.18 (§15)** dan **HM reset meter 1.9.19 (§16)** |

## Cara membaca

- Angka pada tabel selalu disertai asal datanya: sheet asli (CSV ekspor),
  deployment Apps Script, atau hitungan pustaka web.
- Setiap bagian `§x.y` biasanya berisi: masalahnya → perbaikannya → hasil uji.
- Setiap rilis ditutup dengan daftar regresi yang dijalankan dan catatan apakah
  perlu **Deploy ▸ New version** di Apps Script.

## Menjalankan ulang pembuktian

Perintah lengkap ada di [`../tools/README.md`](../tools/README.md). Ringkasnya:
server tiruan Apps Script (`tools/mockapi.mjs`) + Vite, lalu
`BASE=… EP=… node tools/<alat>.mjs`. Untuk memeriksa deployment produksi
(hanya aksi baca): `EP=<url exec> node tools/livedeploy.mjs`.

# Perkakas uji

Semua skrip di folder ini dipakai untuk mengaudit dashboard FS Inspection secara
otomatis (data sheet ↔ web, kebenaran angka, ketahanan, tampilan). Butuh **Node 20+**.

Sebagian besar alat memakai **server tiruan Apps Script** (`tools/mockapi.mjs`)
yang menjalankan `apps-script/Code.gs` asli di atas ekspor CSV sheet, plus **Vite**
sebagai dev server yang diarahkan ke server tiruan itu.

## 1. Menyiapkan lingkungan

```bash
npm ci
npm i -D playwright-core
npx playwright-core install chromium
sudo npx playwright-core install-deps chromium   # sekali saja (libnspr4, libcups, dll.)

# terminal 1 — server tiruan Apps Script (:8111)
DATA_DIR=data MASTER_DIR=data SVC_DIR=data2 DI_CSV=data/Data_Inspeksi.csv \
  MASTER=1 TESTHOOK=1 PORT=8111 node tools/mockapi.mjs

# terminal 2 — Vite diarahkan ke server tiruan (:5199)
VITE_APPS_SCRIPT_URL=http://127.0.0.1:8111/exec npx vite --port 5199 --host 0.0.0.0
```

`data/` dan `data2/` berisi ekspor CSV sheet asli (tidak di-commit, lihat
`.gitignore`). Cara mengambilnya: buka sheet → `File ▸ Download ▸ CSV`, atau
lewat gviz:

```
https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&sheet=<NAMA TAB>
```

Isi `data/` yang dipakai:
`Data_Inspeksi.csv`, `Monitor_Kasie_FS.csv` (tb_service2),
`Data_Service_Engine.csv` (tb_service1), `mesin.csv`, `irrigator.csv`.
`data2/` memuat salinan dua sheet service untuk uji yang menulis baris.

## 2. Alat yang dipakai rutin (suite regresi)

Urutan aman: jalankan `dataquality` lebih dulu (ia memuat ulang mock lewat
`GET /__reset`, jadi sisa mutasi uji lain tidak ikut terukur).

| Alat | Menjalankan | Yang diperiksa |
|---|---|---|
| `dataquality.mjs` | `node tools/dataquality.mjs` | kecocokan sheet ↔ web: riwayat, master, log service, status per unit (7 cek) |
| `apicheck.mjs` | `node tools/apicheck.mjs` | protokol API: `unchanged` hemat, ukuran payload, revisi isi |
| `livedata.mjs` | `node tools/livedata.mjs` | jalur “Repair” mengubah sel sheet seperti yang dijanjikan UI |
| `e2echeck.mjs` | `node tools/e2echeck.mjs` | tulis inspeksi web → sheet, clientId anti-dobel, pembersihan baris uji |
| `refreshtest.mjs` | `node tools/refreshtest.mjs` | sinkron hanya saat muat halaman & tombol Sinkron; menganggur/tab aktif tidak menarik data |
| `synctest.mjs` | `node tools/synctest.mjs` | Sinkron mengikuti suntingan sheet di semua skenario |
| `mastertest.mjs` | `node tools/mastertest.mjs` | master live menang atas snapshot, status otoritatif sheet |
| `hmreset.mjs` | `BASE=… EP=… node tools/hmreset.mjs` | HM lebih kecil (meter diganti) boleh dicatat & jadwal pakai angka baru |
| `svcquality.mjs` | `BASE=… EP=… node tools/svcquality.mjs` | baris ganda tb_service2 dibuang, volume per bulan = baris unik |
| `svcdeep.mjs` | `BASE=… EP=… node tools/svcdeep.mjs` | parser service vs hitungan bebas: volume bulanan, realisasi peta, HM janggal |
| `svckpi.mjs` | `BASE=… EP=… node tools/svckpi.mjs` | kartu KPI Service: klik divisi/unit memfilter & membuka detail |
| `svccharts.mjs` | `BASE=… EP=… node tools/svccharts.mjs` | grafik service: klik batang/chip menyaring tabel |
| `petaminggu.mjs` | `BASE=… EP=… node tools/petaminggu.mjs` | Peta Minggu Service (rencana vs realisasi, total/divisi/jenis) |
| `stabilitycheck.mjs` | `node tools/stabilitycheck.mjs` | muat ulang 5×: memori tidak merangkak naik |
| `themetest.mjs` | `node tools/themetest.mjs` | tidak ada sisa tema gelap, kontras & aksen logo |
| `layoutcheck.mjs` | `node tools/layoutcheck.mjs` | tinggi kartu seragam per baris, grafik mengisi kotak |
| `livedeploy.mjs` | `EP=<url deployment> node tools/livedeploy.mjs` | **deployment produksi**, hanya aksi baca (ping/master/history/svcread/audit) |

Catatan `BASE`/`EP`:

- `BASE` = alamat web uji (default `http://127.0.0.1:5199`).
- `EP` = alamat `…/exec` Apps Script (mock `:8111/exec` atau deployment asli).
- `svcquality`/`petaminggu` punya default `:5199`; `svckpi`/`svccharts` **wajib**
  diberi `BASE`.

Contoh satu rangkaian penuh:

```bash
export BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec
node tools/dataquality.mjs && node tools/svcdeep.mjs && node tools/petaminggu.mjs \
  && node tools/hmreset.mjs && node tools/stabilitycheck.mjs
```

## 3. Server tiruan & hook uji

`mockapi.mjs` = Apps Script Web App palsu (POST/GET `?action=…`, CORS aktif).
Dengan `MASTER=1` sheet `Mesin`, `Irrigator`, `Monitor Kasie FS`, dan
`Data Service Engine` ikut tersedia. Dengan `TESTHOOK=1` tersedia hook:

| Hook | Guna |
|---|---|
| `GET /__set?sheet=…&kode=…&col=…&val=…` | meniru pengguna menyunting satu sel sheet |
| `GET /__get?sheet=…&kode=…&col=…` | membaca satu sel untuk pemeriksaan |
| `GET /__reset` | memuat ulang semua sheet dari CSV (bersihkan sisa mutasi) |

`mock.gs.mjs` = lapisan tiruan layanan Google (SpreadsheetApp, Utilities, Cache,
Lock, UrlFetch) yang dipakai `mockapi.mjs`.

## 4. Arsip (`tools/arsip/`)

38 skrip audit lama (ronde 1–7) yang sudah tidak dipakai rutin: `audit2`,
`clicksweep`, `datacheck`, `e2e`, `perf`, `perfcheck`, `masterlive`, `masterui`,
`syncui`, `svcprobe`, `svcmock`, dan sejenisnya. Disimpan agar jejak audit tetap
bisa dijalankan ulang; path-nya sudah disesuaikan (`HERE/../..`). Sebagian
memerlukan `audit-shots/` (folder hasil, tidak di-commit). Jalankan dari root:

```bash
node tools/arsip/clicksweep.mjs      # mis. klik semua tombol di 5 rute
```

## 5. Berkas hasil

Beberapa alat menulis hasil ke `audit-shots/` (di-ignore git):

- `audit-shots/dataquality.json` — rincian temuan + hasil kecocokan
  (`node tools/dataquality.mjs`).
- tangkapan layar dari skrip di `tools/arsip/`.

Berkas sementara lain (`perf-last.json`, `tools/seed-cache.json`) juga
di-ignore. `tools/svc-fixture.json` **di-commit** karena dipakai uji service
sebagai data acuan tetap.

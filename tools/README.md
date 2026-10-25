# Perkakas uji

Skrip ini dipakai untuk mengaudit dashboard secara otomatis. Butuh **Node 20+**.

```bash
# sekali saja (di root repo)
npm i -D playwright-core
npx playwright install chromium     # atau pakai Chrome yang sudah ada
# bila playwright-core dipasang di folder lain:
export PW_DIR=/path/ke/node_modules
export CHROME=/path/ke/chrome

# 1. uji backend Apps Script tanpa deployment
#    butuh ekspor CSV sheet "Data Inspeksi" (gviz / File ▸ Download ▸ CSV)
export DI_CSV=/path/ke/data-inspeksi.csv
node tools/mock-test.mjs

# 2. audit layout mobile (butuh server statis docs/ di :8099)
node tools/audit2.mjs

# 3. klik semua tombol di 5 rute, laporkan error JS & tombol mati
node tools/clicksweep.mjs

# 4. bandingkan angka di layar dengan data mentah
node tools/mkseseed.mjs && node tools/datacheck.mjs

# 5. uji end-to-end sinkron + kirim inspeksi (server tiruan Apps Script di :8111)
node tools/mockapi.mjs &
node tools/e2e.mjs

# 6. uji ubah & hapus sesi inspeksi (tab Riwayat) — jalankan mockapi dulu
node tools/mockapi.mjs &
node tools/edittest.mjs && node tools/syncedit.mjs && node tools/scrolllock.mjs

# 7. uji pop-up Distribusi Skor (klik batang Mesin & Irrigator)
node tools/mkseseed.mjs && node tools/buckettest.mjs && node tools/bucketnav.mjs
```

- `mock.gs.mjs` — tiruan `SpreadsheetApp`, `Utilities`, `LockService`, `DriveApp`,
  `CacheService`, `ContentService`; menjalankan **isi `apps-script/Code.gs` apa adanya** di `node:vm`.
- `mockapi.mjs` — membungkus mock di atas menjadi HTTP server agar bisa diuji dari browser.
- `mock-test.mjs` — 18 pemeriksaan: idempotensi submit, revisi, urutan waktu, kompresi lossless.
- `audit2.mjs` / `clicksweep.mjs` / `datacheck.mjs` — audit UI di 320/360/390/414 px.
- `scrolllock.mjs` — memastikan halaman selalu bisa digeser (scroll body tidak tertinggal terkunci
  setelah pop-up dibuka/ditutup atau saat pindah tab).

### Modul Service Engine (v1.6.0)

```bash
# 1. server tiruan Apps Script (svcread/svcrecord) + data asli 131 unit / 215 pencatatan
SVC_FIXTURE=tools/svc-fixture.json node tools/svcmock.mjs 8112
# 2. aplikasi statis
python3 -m http.server 8099 --bind 0.0.0.0 --directory docs
# 3. uji pop-up Catat Service → simpan → sheet tiruan → data ditarik ulang
PW_DIR=$PWD/node_modules EP=http://127.0.0.1:8112/exec node tools/svce2e.mjs   # 14 pemeriksaan
node tools/svcprobe.mjs      # tangkapan layar + hitung baris tabel di 390 px & 1440 px
```

```bash
node tools/svccharts.mjs     # 6 panel analitik service (HP + desktop), 12 pemeriksaan
```

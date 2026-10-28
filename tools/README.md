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

### Audit data ASLI spreadsheet ↔ web (v1.9.0)

```bash
# 1. ambil ekspor CSV asli (butuh akses baca ke spreadsheet)
SS_T=1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o   # Update ZPAS637
SS_S=1WbGTdC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4   # Draft Dashboard
mkdir -p data
curl -s "https://docs.google.com/spreadsheets/d/$SS_T/gviz/tq?tqx=out:csv&sheet=Data%20Inspeksi"      -o data/Data_Inspeksi.csv
curl -s "https://docs.google.com/spreadsheets/d/$SS_T/gviz/tq?tqx=out:csv&sheet=Data%20Service%20Engine" -o data/Data_Service_Engine.csv
curl -s "https://docs.google.com/spreadsheets/d/$SS_T/gviz/tq?tqx=out:csv&sheet=Monitor%20Kasie%20FS"    -o data/Monitor_Kasie_FS.csv
curl -s "https://docs.google.com/spreadsheets/d/$SS_S/gviz/tq?tqx=out:csv&sheet=Mesin"      -o data/src_Mesin.csv
curl -s "https://docs.google.com/spreadsheets/d/$SS_S/gviz/tq?tqx=out:csv&sheet=Irrigator"  -o data/src_Irrigator.csv
cp data/src_Mesin.csv data/mesin.csv
cp data/src_Irrigator.csv data/irrigator.csv
cp data/Data_Inspeksi.csv data/di.csv          # dipakai mock.gs.mjs

# 2. audit seluruh jalur data tanpa menyentuh spreadsheet
node tools/livedata.mjs     # 30 cek: audit/repair, history, master, jalur tulis, service
```

`livedata.mjs` menjalankan **isi `apps-script/Code.gs` apa adanya** (lewat `mock.gs.mjs`)
di atas lima CSV di atas, lalu membandingkan apa yang dilihat web dengan isi sheet.

### Audit UI dengan data asli (butuh Chromium)

```bash
npm i -D playwright-core && npx playwright install chromium

# server tiruan Apps Script berisi data asli + dev server
MASTER=1 DATA_DIR=$PWD/data SVC_DIR=$PWD/data PORT=8111 node tools/mockapi.mjs &
VITE_APPS_SCRIPT_URL=http://127.0.0.1:8111/exec npx vite --port 5199 &

node tools/liveuicheck.mjs
```

`liveuicheck.mjs` memeriksa **6 rute × 3 lebar layar (320/390/1280)**: error JS,
luber horizontal, target sentuh, klik-sweep tombol mati, dan mencetak angka KPI
untuk dibandingkan dengan hitungan langsung dari CSV. Tangkapan layar disimpan
di `audit-shots/` (tidak di-commit).

### Uji cache master (v1.9.1)

```bash
node tools/cachetest.mjs        # butuh mockapi :8111 + vite :5199
```

Memastikan cache master di `localStorage` dari bundel lama (tanpa `v`) atau versi
skema lain **dibuang** sehingga status unit tidak lagi tertahan di nilai basi,
chip sidebar memberi peringatan “tekan Sinkron” saat data >30 menit, dan
`DEM0074` konsisten `Rusak` dengan sheet master.

### Uji “Sinkron benar-benar menarik ulang” (v1.9.2)

```bash
MASTER=1 TESTHOOK=1 PORT=8111 node tools/mockapi.mjs &
VITE_APPS_SCRIPT_URL=http://127.0.0.1:8111/exec npx vite --port 5199 &

node tools/revtest.mjs   # sidik jari (rev) berbasis ISI sheet, bukan mtime file
node tools/synctest.mjs  # ubah status di sheet → tekan Sinkron → layar ikut berubah
```

`revtest.mjs` membuktikan mengubah satu sel Status/Kondisi mengubah `rev` walau
`DriveApp.getLastUpdated()` gagal. `synctest.mjs` menguji alur nyata di browser:
status unit diubah lewat `GET /__set` (meniru suntingan manual di Google Sheets,
hanya aktif bila `TESTHOOK=1`), lalu tombol Sinkron ditekan dan Data Unit harus
mengikuti sheet. Keduanya GAGAL pada kode v1.9.1 ke bawah.

### Uji arah web → sheet (v1.9.3)

```bash
node tools/tulistest.mjs    # tanpa server: syncmaster + aturan Rusak ⇒ Kritis
```

Memastikan `syncmaster` menulis ulang A/B/C, skor, dan KONDISI ke sheet master,
menegakkan **Status “Rusak” ⇒ KONDISI “Kritis”** (termasuk unit tanpa riwayat
inspeksi), idempoten, dan tidak menyentuh unit berstatus lain. `tools/synctest.mjs`
juga sudah memeriksa hasil tulis ini lewat hook `GET /__get`.

### Uji tema terang (v1.9.5)

```bash
node tools/themetest.mjs      # butuh mockapi :8111 + vite :5199
```

Memeriksa langsung di browser: `color-scheme` dokumen, latar body, **tidak ada
permukaan gelap** (`rgb` gelap) atau bayangan hitam pekat di 6 rute + 2 modal,
serta kartu notifikasi untuk status sukses/gagal selalu berlatar terang dengan
teks terbaca.

## `layoutcheck.mjs` — komposisi grafik vs kartu

`node tools/layoutcheck.mjs` — membuka Dashboard/Riwayat/Service lalu melaporkan
per grafik: ukuran kontainer, tinggi kartu, sisa ruang atas/bawah di dalam kartu,
dan ruang kosong di area grafik (beda kontainer vs `svg`). Dipakai untuk memastikan
grafik mengisi kartunya tanpa kolaps dan tanpa meluber. Butuh Vite di `:5199`.

## `shot.mjs` — tangkapan layar per rute

`ROUTES=dashboard,service TAG=layout W=1440 H=1000 node tools/shot.mjs` — satu
tangkapan satu-halaman penuh per rute ke `audit-shots/<tag>-<rute>-<W>.png`,
sekaligus mencetak jumlah error JavaScript. Untuk tampilan HP pakai `W=390 H=844`
dan `TAG=layoutm`.


## `rowcheck.mjs` — kesimetrisan kartu

`node tools/rowcheck.mjs` — mencetak ukuran tiap `.card` dikelompokkan per baris
grid di Dashboard/Riwayat/Service. Semua kartu dalam satu baris harus bertinggi
sama (grid `items-stretch`); yang menyesuaikan adalah grafik di dalamnya.

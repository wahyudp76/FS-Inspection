# FS Inspection — Dashboard Inspeksi Mesin & Irrigator

Dashboard inspeksi berkala untuk aset **unit mesin** dan **unit irrigator**.
Checklist komponen, input inspeksi langsung dari web, dan hasilnya otomatis
masuk ke Google Sheets **“Update ZPAS637” ▸ sheet `Data Inspeksi`**.

> **Data master** diambil dari spreadsheet *Draft Dashboard*:
> sheet `Mesin` (**tb_mesin** — 151 unit, 46 komponen) dan
> sheet `Irrigator` (**tb_irrigator** — 123 unit, 29 komponen).
>
> Kolom **`Category`** sudah **dihapus** dari kedua sheet (versi 1.3.0+), jadi
> kolom itu tidak lagi muncul di dashboard maupun di checklist inspeksi.

---

## ✨ Fitur

| Modul | Isi |
|---|---|
| **Dashboard** | 6 KPI, tren inspeksi (harian/mingguan/bulanan), donut status unit, bar komponen bermasalah, radar kondisi per sistem, kondisi per wilayah, distribusi skor, aktivitas petugas, unit prioritas perbaikan, inspeksi terbaru |
| **Inspeksi** | Pilih unit → checklist per kelompok komponen (A / B / C) → catatan → kirim. Ada “tandai semua A/B/C” per kelompok, progres realtime, skor otomatis, perbandingan dengan inspeksi sebelumnya |
| **Data Unit** | Tabel master 274 unit, filter tipe/wilayah/status, pencarian, urut skor, detail per komponen + riwayat, ekspor CSV |
| **Riwayat** | Semua sesi inspeksi, filter petugas/tipe/kata kunci, expand detail komponen, tren & komposisi temuan, ekspor CSV |
| **Pengaturan** | Endpoint Apps Script, uji koneksi, tarik data dari sheet, kirim antrean lokal, mode demo |

Arti nilai komponen:

| Nilai | Arti | Skor |
|---|---|---|
| **A** | Baik / normal, layak operasi | 100 |
| **B** | Perlu perhatian — ada gejala, pantau/perbaikan ringan | 60 |
| **C** | Rusak — tidak berfungsi, harus diperbaiki | 0 |

**Skor kondisi unit** = `(A×100 + B×60 + C×0) ÷ total komponen`
→ `≥90 Baik` · `70–89 Perlu Perhatian` · `<70 Kritis`.

> **Aturan status:** unit dengan `Status = Rusak` **selalu** dinilai **Kritis**,
> berapa pun skor komponennya. Berlaku di dashboard, di sheet `Data Inspeksi`,
> dan pada kolom `KONDISI` di sheet Mesin/Irrigator.

---

## 🧱 Teknologi

- **React 18 + Vite 5** — SPA statis, tanpa server
- **Tailwind CSS** — tema gelap, responsif (mobile friendly)
- **Recharts** — grafik interaktif (area, bar, donut, radar, composed)
- **Google Apps Script Web App** — satu-satunya backend, menulis ke spreadsheet
- **GitHub Pages** — hosting gratis + domain kustom

Tidak ada API key di browser. Endpoint Apps Script berjalan atas nama pemilik
spreadsheet dan akses dibatasi ke sheet yang ditentukan.

---

## 🚀 Menjalankan lokal

```bash
npm install
npm run dev          # http://localhost:5173
```

Produksi:

```bash
npm run build         # hasil di folder dist/
npm run preview       # cek hasil build
```

Perbarui snapshot data master dari Google Sheets (opsional):

```bash
npm run sync          # membaca tb_mesin & tb_irrigator → src/data/assets.json
```

---

## 🔌 Menyambungkan ke Google Sheets (wajib untuk menyimpan hasil)

### 1. Pasang Apps Script

1. Buka spreadsheet **Update ZPAS637**
   → menu **Extensions ▸ Apps Script**.
2. Hapus isi `Code.gs`, tempel seluruh isi
   [`apps-script/Code.gs`](apps-script/Code.gs), lalu **Save**.
3. Jalankan fungsi **`setup`** sekali (Run ▸ setup) → izinkan akses.
   Sheet `Data Inspeksi` dibuat dengan header rapi (92 kolom) dan format tabel.
4. **Deploy ▸ New deployment ▸ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Salin URL yang berakhiran `/exec`.

> Setiap kali `Code.gs` diubah: **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version**,
> agar URL `/exec` memakai kode terbaru.

### 2. Hubungkan dashboard

**Cara A — tanpa build ulang (paling praktis):**
buka dashboard ▸ **Pengaturan** ▸ tempel URL `/exec` ▸ **Simpan** ▸ **Uji Koneksi**.
Endpoint tersimpan di `localStorage` browser.

**Cara B — default untuk semua perangkat:**
buat file `.env` di root:

```env
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXXXXX/exec
```

lalu `npm run build`. Untuk GitHub Pages, isi juga **Repository secret**
`VITE_APPS_SCRIPT_URL` (Settings ▸ Secrets and variables ▸ Actions) —
workflow deploy sudah memakainya.

### 3. Mode tanpa koneksi

Bila endpoint belum diatur, inspeksi tetap bisa dilakukan: data masuk
**antrean lokal** browser (`localStorage`). Setelah endpoint diisi, tekan
**Sinkron** (atau *Kirim antrean lokal* di Pengaturan) untuk mengirim semuanya
ke sheet.

---

## 🌱 Inspeksi awal & sinkron balik ke master

Dua fungsi di `apps-script/Code.gs` (tersedia juga di menu **FS Inspection** pada spreadsheet):

| Menu | Fungsi | Kegunaan |
|---|---|---|
| **2. Isi inspeksi awal dari master** | `backfillDariMaster()` | Menyalin kondisi tb_mesin (151) & tb_irrigator (123) menjadi **274 baris** di sheet `Data Inspeksi`, tanggal **5 Maret 2026**, petugas `Inspeksi Awal (Master)`. Aman dijalankan berulang — baris dengan ID `FSI-INIT-…` dilewati. |
| **3. Sinkronkan hasil terakhir ke sheet Mesin & Irrigator** | `syncLatestToMaster()` | Mengambil inspeksi **terbaru per unit** dari `Data Inspeksi`, lalu menulis nilai **A/B/C ke kolom komponen** master + 9 kolom ringkasan. |
| **Pasang jadwal otomatis harian** | `installTriggers()` | Menjalankan `syncLatestToMaster` otomatis tiap hari (±01.00 WIB). |
| **Hapus jadwal otomatis** | `removeTriggers()` | Mematikan trigger harian. |

### Apa yang ditulis ke sheet Mesin & Irrigator

`syncLatestToMaster()` melakukan **dua hal** untuk setiap unit yang punya inspeksi:

1. **Menimpa kolom komponen** yang sudah ada (`Accu`, `Klem Accu`, `Radiator`, `Turbin`, …)
   dengan nilai **A/B/C dari inspeksi terbaru** — termasuk unit yang kolom komponennya
   masih kosong di master (mis. `SPC0018`: 44 kolom kosong → terisi setelah inspeksi).
   Unit yang belum pernah diinspeksi **tidak diubah**.
2. Menambahkan/mengisi **9 kolom ringkasan** di kanan tabel.

Kolom ringkasan diletakkan **setelah kolom terakhir** (kolom identitas asli tidak diubah):

```
TGL INSPEKSI TERAKHIR | JAM | SKOR | KONDISI | A | B | C | PETUGAS | TEMUAN (B/C)
```

- `KONDISI` diberi warna otomatis: hijau *Baik*, kuning *Perlu Perhatian*, merah *Kritis*.
- `TEMUAN (B/C)` berisi daftar komponen bermasalah, contoh `Radiator:B · Mesin:C`.
- Baris yang belum pernah diinspeksi dibiarkan kosong, jadi mudah difilter.

Sinkronisasi bisa dijalankan dengan empat cara:

1. **Otomatis (default)** — setiap kali inspeksi dikirim dari dashboard, aplikasi
   langsung memanggil action `syncmaster`. Bisa dimatikan di **Pengaturan**.
2. **Manual dari dashboard** — **Pengaturan ▸ Sinkron ke sheet Mesin & Irrigator**.
   Hasilnya ditampilkan, mis. `Mesin: 1/151 unit diperbarui, 46 sel komponen terisi`.
3. **Dari spreadsheet** — menu **FS Inspection ▸ Sinkronkan hasil terakhir…**.
4. **Terjadwal (server)** — `installTriggers()` menjalankan `syncLatestToMaster` tiap hari ±01.00 WIB,
   langsung di Google, tanpa perlu ada yang membuka dashboard.

Selain itu dashboard punya **auto-refresh**: menarik ulang isi sheet `Data Inspeksi` setiap
5 menit dan saat tab kembali aktif (Pengaturan ▸ Sinkronisasi Otomatis).

### Urutan pemasangan (sekali saja)

1. Tempel ulang `apps-script/Code.gs` ke editor Apps Script → **Save**.
2. Jalankan **`setup`** → izinkan akses.
3. Jalankan **`backfillDariMaster`** → 274 baris inspeksi awal masuk (5 Mar 2026).
4. Jalankan **`syncLatestToMaster`** → kolom ringkasan muncul di sheet Mesin & Irrigator.
5. **Deploy ▸ Manage deployments ▸ New version** (agar endpoint dashboard ikut versi baru).
6. Opsional: **`installTriggers`** untuk sinkron otomatis harian.

## 📄 Skema sheet `Data Inspeksi`

Dibuat otomatis oleh Apps Script. Satu baris = satu sesi inspeksi.

| Kelompok | Kolom |
|---|---|
| Identitas | `ID Inspeksi`, `Tanggal`, `Timestamp`, `Tipe Aset`, `Kode Unit`, `Wilayah`, `Jenis Unit`, `Spesifikasi`, `Status Unit`, `Petugas` |
| Rekap | `A`, `B`, `C`, `Total`, `Skor`, `Kondisi` |
| Komponen mesin (46) | `Accu`, `Kabel Accu`, … `Chasis`, `Ban`, `Pintu` |
| Komponen irrigator (29) | `Turbin`, `As Turbin`, … `PE`, `Helically` |
| Catatan | `Catatan` |

Kolom komponen yang tidak berlaku untuk tipe aset dibiarkan kosong, sehingga
satu sheet bisa memuat mesin & irrigator sekaligus (mudah difilter pivot).

API yang tersedia pada Web App:

| Action | Fungsi |
|---|---|
| `ping` | cek koneksi + jumlah baris |
| `history` | ambil semua baris (dipakai dashboard) |
| `submit` | tulis satu sesi inspeksi |
| `setup` | siapkan/perbaiki header sheet |
| `syncmaster` | tulis hasil terakhir ke sheet Mesin & Irrigator |
| `backfill` | isi inspeksi awal dari master (payload: `{tanggal}`) |

---

## 📦 Deploy ke GitHub Pages

Ada dua mode. Repo ini sudah disiapkan untuk **keduanya**.

### Mode A — Deploy from a branch (folder `docs/`) ✅ sedang dipakai

1. **Settings ▸ Pages ▸ Build and deployment**
   - **Source: Deploy from a branch**
   - **Branch: `main`** · **Folder: `/docs`** → **Save**
2. URL: `https://wahyudp76.github.io/FS-Inspection/`

Setiap kali kode di `src/` diubah, perbarui bundle statisnya:

```bash
npm run build:pages     # build ke folder docs/ + .nojekyll
git add docs && git commit -m "build: perbarui dashboard" && git push
```

atau sekali jalan:

```bash
bash scripts/publish-pages.sh
```

> Folder `docs/` berisi **hasil build** (HTML+JS+CSS siap saji), bukan source.
> `.nojekyll` disertakan agar aset tidak diproses Jekyll.

### Mode B — GitHub Actions (otomatis penuh)

1. **Settings ▸ Pages ▸ Source: GitHub Actions**
2. Push ke `main`, atau jalankan manual
   **Actions ▸ Deploy Dashboard to GitHub Pages ▸ Run workflow**.
3. Workflow `.github/workflows/deploy.yml` akan build & deploy sendiri, dan bisa
   memakai secret `VITE_APPS_SCRIPT_URL` untuk mengisi endpoint otomatis.

> Jangan mencampur: bila Source = *Deploy from a branch*, workflow Actions tidak
> dijalankan otomatis (sudah disetel `workflow_dispatch` saja agar tidak gagal).

### Domain kustom

1. Tambahkan domain di **Settings ▸ Pages ▸ Custom domain**.
2. Buat `public/CNAME` **dan** `docs/CNAME` berisi satu baris domain, contoh:

   ```
   inspection.domainanda.com
   ```

   (`docs/CNAME` wajib ada karena yang disajikan adalah isi folder `docs/`)
3. DNS di registrar:

   | Tipe | Nama | Nilai |
   |---|---|---|
   | CNAME | `inspection` (subdomain) | `wahyudp76.github.io` |
   | A | `@` (domain utama) | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |

4. Centang **Enforce HTTPS** (sertifikat otomatis, ±10 menit).

> Aplikasi memakai *hash routing* (`/#/inspeksi`), jadi tidak perlu konfigurasi
> rewrite/404 di hosting apa pun.

## 🗂 Struktur proyek

```
.
├── apps-script/
│   └── Code.gs               # backend Google Apps Script (paste ke editor)
├── scripts/
│   ├── build-data.mjs        # tarik tb_mesin & tb_irrigator → assets.json
│   └── publish-pages.sh      # build docs/ + commit + push
├── docs/                     # hasil build untuk GitHub Pages (branch mode)
├── public/
│   └── assets-snapshot.json  # snapshot data master
├── src/
│   ├── components/
│   │   ├── charts.jsx        # semua grafik Recharts
│   │   ├── icons.jsx         # ikon SVG inline
│   │   ├── Shell.jsx         # sidebar + topbar
│   │   └── ui.jsx            # Card, KPI, Pill, Bar, ScoreRing, Toast…
│   ├── data/assets.json      # data master (hasil npm run sync)
│   ├── lib/
│   │   ├── analytics.js      # skor, agregasi, tren, periode
│   │   ├── api.js            # komunikasi Apps Script + antrean lokal
│   │   ├── config.js         # endpoint, grade A/B/C, sheet tujuan
│   │   └── demo.js           # generator data demo
│   ├── pages/
│   │   ├── Dashboard.jsx  ├── Inspect.jsx  ├── Units.jsx
│   │   └── History.jsx    └── Settings.jsx
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
└── .github/workflows/deploy.yml
```

---

## 🧪 Perkakas uji (`tools/`)

Semua uji jalan tanpa deployment (memakai `tools/mock.gs.mjs`, grid sheet tiruan dari CSV asli).

| Perintah | Yang diuji |
|---|---|
| `node tools/assetcheck.mjs` | master `assets.json` ↔ sheet `Mesin`/`Irrigator` (komponen, ringkasan, status) |
| `node tools/apicheck.mjs` | API `history` ↔ baris sheet `Data Inspeksi` (275 record, kompresi, `rev`) |
| `node tools/datafix.mjs` | aksi `audit` & `repair` Code.gs: deteksi → perbaikan → bersih → idempoten |
| `node tools/mastertest.mjs` | unit test `src/lib/master.js` (merge inspeksi baru, Rusak ⇒ Kritis, kode asing) |
| `node tools/kualitas.mjs` | badge “catatan kualitas data” di halaman Service |
| `node tools/datafixui.mjs` | kartu “Kualitas Data Sheet” di Pengaturan (butuh `PORT=8113 MASTER=1 node tools/mockapi.mjs`) |
| `node tools/svcrumus.mjs` | penulisan “Catat Service” ke tb_service2: pemisah rumus (`;` vs `,`), nilai D/E/F, `svcrepair` |
| `node tools/perf.mjs` | ukuran bundel + metrik muat Dashboard/Service (`LIVE=1` untuk membandingkan versi live) |
| `node tools/logo.mjs` | 47 cek ikon/PWA (desktop & HP) |

Data masukan uji dibaca dari `$DATA_DIR` (default `/home/user/data`): `di.csv`, `mesin.csv`, `irrigator.csv`.

## 🧪 Catatan operasional

- **Skor master** dihitung dari kolom komponen pada spreadsheet sumber (kondisi
  terakhir yang dicatat), sedangkan **skor riwayat** berasal dari sesi inspeksi
  di dashboard. Keduanya ditampilkan terpisah agar tidak tertukar.
- Nilai selain A/B/C pada sumber diabaikan (dianggap belum dinilai).
- Kolom `Category` pada sheet Mesin & Irrigator **sudah dihapus** (v1.3.0).
  Bila sheet `Data Inspeksi` lama masih menyisakan kolom `Category`, jalankan
  menu **FS Inspection ▸ 4. Bersihkan kolom Category lama** sekali.
- Mode **Demo** (Pengaturan) mengisi grafik dengan ±90 sesi contoh tanpa
  menyentuh Google Sheets — berguna untuk presentasi sebelum data terkumpul.
- Data inspeksi disimpan permanen di Google Sheets; `localStorage` hanya cache
  dan antrean.

---

© 2026 — FS Inspection · Inspeksi Engine & Service


---

## Logo & ikon PWA

Mark: **perisai + centang** di atas squircle gradien cyan → biru — perisai = unit terjamin sudah diperiksa, centang = hasil inspeksi. Huruf/teks tidak dipakai agar tetap tajam dari 16 px sampai 512 px.

| Berkas | Fungsi |
|---|---|
| `public/favicon.svg` | favicon SVG (ubin teal, dari logo resmi) |
| `public/favicon.ico` | favicon 16/32/48 px (browser lama, bookmark) |
| `public/icons/favicon-{16,32,48}.png` | favicon PNG |
| `public/icons/icon-{72,96,144,192,256,384,512}.png` | ikon "any" — Android/Chrome/desktop install, taskbar |
| `public/icons/maskable-{192,512}.png` | ikon **maskable** Android (aman untuk mask bulat/squircle) |
| `public/apple-touch-icon.png` | iOS/iPadOS home screen (180 px, full-bleed) |
| `public/manifest.webmanifest` | nama, tema `#05080f`, `display: standalone`, shortcut **Tambah Inspeksi** & **Riwayat** |
| `public/sw.js` | service worker: navigasi network-first, aset cache-first, offline shell |

Membuat ulang seluruh ikon setelah logo diubah:

```bash
npm i -D playwright-core          # sekali saja
node scripts/make-icons.mjs       # butuh CHROME_PATH bila Chromium tak standar
```

**Memasang sebagai aplikasi:** Chrome/Edge desktop → ikon *Install* di address bar · Android → *Add to Home screen* · iPhone/iPad (Safari) → *Share ▸ Add to Home Screen*.

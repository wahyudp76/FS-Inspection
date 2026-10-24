# PANDUAN — dari nol sampai dashboard online

Checklist singkat. Detail lengkap ada di [`README.md`](README.md).

---

## Pasang sebagai aplikasi (PWA)

- **Android (Chrome)**: menu ⋮ ▸ **Add to Home screen / Instal aplikasi**.
- **iPhone/iPad (Safari)**: **Share** ▸ **Add to Home Screen**.
- **Desktop (Chrome/Edge)**: klik ikon **Install** di kanan address bar.

Setelah dipasang, aplikasi terbuka tanpa address bar, ikonnya memakai logo FS Inspection, dan shell tetap terbuka saat sinyal buruk (data inspeksi tetap butuh koneksi ke Apps Script).

## Tampilan di HP

- **Unit Prioritas Perbaikan** (Dashboard) memakai daftar kartu di layar < 640 px: kode, tipe, status, wilayah/spesifikasi, sebaran A/B/C, skor, dan tombol **Inspeksi** semuanya terlihat tanpa geser ke samping.
- Tabel lebar (Data Unit, Pengaturan) tetap berupa tabel, tapi bisa **digeser ke samping** di dalam kotaknya.

## Navigasi

- **Header atas membeku (freeze)** — judul halaman, tombol **+ Tambah Inspeksi**, **Sinkron**, dan **Buka Sheet** tetap terlihat saat halaman digulir ke bawah; muncul bayangan halus sebagai penanda.
- **Tombol ↑ (kembali ke atas)** muncul otomatis di kanan bawah setelah halaman digulir lebih dari ±320 px; sekali klik halaman meluncur kembali ke paling atas.

## Notifikasi

Notifikasi di bawah layar (hasil sinkron, simpan inspeksi, error) **hilang otomatis**: 4 detik untuk berhasil/informasi, 7 detik untuk error. Arahkan kursor ke notifikasi untuk menahan agar tidak hilang, atau klik **×** untuk menutup langsung.

## Bagian 1 · Siapkan spreadsheet tujuan (5 menit)

1. Buka **Update ZPAS637**
   https://docs.google.com/spreadsheets/d/1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o
2. Menu **Extensions ▸ Apps Script**.
3. Hapus semua isi `Code.gs`, **tempel seluruh isi** file
   `apps-script/Code.gs` dari repo ini → **Save** (ikon disket).
4. Pilih fungsi **`setup`** pada dropdown → **Run** → **Review permissions**
   → pilih akun → *Advanced* → *Go to project (unsafe)* → **Allow**.
   → Sheet **`Data Inspeksi`** terbuat dengan 92 kolom header.
5. **Deploy ▸ New deployment** → ikon gerigi → **Web app**
   - Description: `FS Inspection API`
   - **Execute as: Me**
   - **Who has access: Anyone**
   - **Deploy** → salin URL yang diakhiri **`/exec`**.

> Simpan URL itu. Bentuknya:
> `https://script.google.com/macros/s/AKfycb……………………/exec`

**Penting:** setiap kali kode Apps Script diubah →
**Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**

---

## Bagian 1b · Isi inspeksi awal + sinkron balik ke master (2 menit)

Setelah `setup` berhasil, di editor Apps Script yang sama jalankan berurutan:

1. **`backfillDariMaster`** → menyalin kondisi tb_mesin & tb_irrigator
   menjadi **274 baris** di sheet `Data Inspeksi`, semua bertanggal **2026-03-05**,
   petugas `Inspeksi Awal (Master)`. (Aman diulang; tidak akan duplikat.)
2. **`syncLatestToMaster`** → menambahkan 9 kolom ringkasan di kanan tabel
   sheet **Mesin** dan **Irrigator**:
   `TGL INSPEKSI TERAKHIR · JAM · SKOR · KONDISI · A · B · C · PETUGAS · TEMUAN (B/C)`
3. (opsional) **`installTriggers`** → sinkron otomatis tiap hari ±01.00 WIB.
4. **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.**

Selanjutnya cukup dari menu **FS Inspection** di spreadsheet (muncul setelah reload),
atau tombol **Pengaturan ▸ Sinkron ke sheet Mesin & Irrigator** di dashboard.

> Butuh tanggal lain? Jalankan dari editor dengan parameter:
> `backfillDariMaster('2026-03-05')` atau lewat API
> `{"action":"backfill","payload":{"tanggal":"2026-03-05"}}`.

## Bagian 2 · Coba dulu di lokal / preview (2 menit)

```bash
npm install
npm run dev      # buka http://localhost:5173
```

1. Buka menu **Pengaturan** → tempel URL `/exec` → **Simpan** → **Uji Koneksi**.
   Harus muncul: `Terhubung · sheet "Data Inspeksi" · 0 baris data inspeksi`.
2. Menu **Inspeksi** → pilih unit (mis. `SPC0095`) → isi nama petugas →
   nilai komponen (A/B/C) → **Kirim Inspeksi**.
3. Buka Google Sheets → sheet `Data Inspeksi` → baris baru muncul.
4. Balik ke dashboard → **Sinkron** → grafik tren & KPI terisi.

---

## Bagian 2b · Saat input inspeksi baru — sinkron ke sheet "Mesin"

Ada tiga cara; **cara 1 sudah aktif secara default**.

| # | Cara | Kapan dipakai |
|---|---|---|
| **1** | **Otomatis** — setiap tekan **Kirim Inspeksi**, dashboard langsung memanggil `syncmaster` sehingga kolom inspeksi terakhir di sheet Mesin/Irrigator ikut diperbarui. Layar hasil menampilkan `Mesin: 151/151 · Irrigator: 123/123 unit diperbarui`. | pemakaian sehari-hari |
| **2** | **Tombol di dashboard** — **Pengaturan ▸ Sinkron ke sheet Mesin & Irrigator** (memproses semua unit sekaligus). | setelah input massal / koreksi manual |
| **3** | **Menu spreadsheet** — reload spreadsheet → menu **FS Inspection ▸ 3. Sinkronkan hasil terakhir ke sheet Mesin & Irrigator**. | tanpa membuka dashboard |
| **4** | **Terjadwal (server)** — jalankan sekali `installTriggers` di Apps Script → tiap hari ±01.00 WIB `syncLatestToMaster` menulis hasil terbaru ke sheet Mesin/Irrigator, tanpa perlu ada yang membuka web. | jaring pengaman |

Mematikan/menyalakan cara 1: **Pengaturan ▸ Sinkronisasi Otomatis ▸ "Sinkron otomatis ke sheet Mesin & Irrigator"**.

### Bedanya trigger vs web

| | Arah | Kapan |
|---|---|---|
| **Trigger harian** (`installTriggers`) | `Data Inspeksi` → sheet **Mesin/Irrigator** | tiap hari ±01.00 WIB, jalan di server Google (web tidak perlu dibuka) |
| **Auto-refresh web** | sheet `Data Inspeksi` → **dashboard** | setiap **5 menit** + saat tab kembali aktif (bisa dimatikan di Pengaturan) |

Jadi trigger **tidak** memperbarui tampilan web — web selalu menarik data sendiri dari sheet
`Data Inspeksi` (saat dibuka, setiap 5 menit, saat tab aktif kembali, atau lewat tombol **Sinkron**).

> Syarat: endpoint `/exec` sudah diisi **dan** deployment memakai **versi terbaru**
> (`Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version`). Kalau inspeksi
> tersimpan sebagai antrean lokal (offline), sinkron master otomatis dilewati —
> kirim antrean dulu lewat **Pengaturan ▸ Kirim antrean lokal**.

## Bagian 3 · Push ke GitHub

```bash
git remote add origin https://github.com/wahyudp76/FS-Inspection.git
git branch -M main
git push -u origin main --force
```

> `--force` dipakai karena repo GitHub baru berisi 1 commit README;
> riwayat dari workspace ini akan menggantikannya.
> Kalau tidak ingin menimpa: `git pull --rebase origin main` dulu, lalu `git push`.

---

## Bagian 4 · Aktifkan GitHub Pages (mode branch `docs/`)

1. Repo → **Settings ▸ Pages**
   - **Source: Deploy from a branch**
   - **Branch: `main`** → **Folder: `/docs`** → **Save**
2. Tunggu ±1 menit → buka `https://wahyudp76.github.io/FS-Inspection/`

Sudah terpasang di repo: folder `docs/` berisi hasil build terbaru + `.nojekyll`.

**Setiap kali kode diubah**, jalankan salah satu:

```bash
npm run build:pages && git add docs && git commit -m "build: perbarui dashboard" && git push
# atau
bash scripts/publish-pages.sh
```

> Endpoint Apps Script **tidak** dibaca dari secret di mode ini (secret hanya
> dipakai workflow Actions). Jadi isi endpoint lewat menu **Pengaturan** di
> dashboard, atau lewat `VITE_APPS_SCRIPT_URL` di file `.env` **sebelum**
> `npm run build:pages`.

### Kalau ingin otomatis (tanpa build manual)

Ganti **Settings ▸ Pages ▸ Source** menjadi **GitHub Actions**, lalu jalankan
**Actions ▸ Deploy Dashboard to GitHub Pages ▸ Run workflow**. Di mode itu,
secret `VITE_APPS_SCRIPT_URL` bisa dipakai untuk mengisi endpoint otomatis.

## Bagian 5 · Pasang domain sendiri

1. **Settings ▸ Pages ▸ Custom domain** → isi domain, mis. `inspeksi.domainanda.com` → **Save**.
2. Tambah file `public/CNAME` **dan** `docs/CNAME` berisi satu baris:
   ```
   inspeksi.domainanda.com
   ```
   lalu commit & push (agar CNAME tidak hilang setiap deploy). `docs/CNAME`
   wajib karena GitHub Pages menyajikan isi folder `docs/`.
3. Di penyedia domain, tambahkan DNS:

   | Tipe | Nama/Host | Nilai | TTL |
   |---|---|---|---|
   | CNAME | `inspeksi` | `wahyudp76.github.io` | 3600 |
   | A | `@` | `185.199.108.153` | 3600 |
   | A | `@` | `185.199.109.153` | 3600 |
   | A | `@` | `185.199.110.153` | 3600 |
   | A | `@` | `185.199.111.153` | 3600 |

   *(baris A hanya jika memakai domain utama tanpa subdomain; ganti juga
   isi `public/CNAME` menjadi `domainanda.com`)*
4. Tunggu propagasi DNS (5–60 menit) → centang **Enforce HTTPS**.

---

## Bagian 6 · Kebiasaan pemakaian

| Rutin | Aksi |
|---|---|
| Harian | Petugas klik tombol **+ Tambah Inspeksi** di header (dari halaman mana pun) → **pop-up Tambah Inspeksi** muncul: pilih **Mesin/Irrigator**, cari & pilih unit, **data pendukung tampil otomatis** (divisi, spesifikasi, power/pompa atau nozzle, status, jumlah komponen, sebaran A/B/C, inspeksi terakhir) → **Mulai Inspeksi** membuka checklist di pop-up yang sama. Alternatif: buka menu **Inspeksi** → pilih **Divisi** & **Jenis Engine/Irrigator** (bisa banyak sekaligus) atau cari kode → daftar unit tampil **20 per halaman** (navigasi « ‹ › »), urut **jenis lalu nomor** (default; bisa diganti: *nomor terkecil*, *skor terendah/tertinggi*) → isi checklist → kirim |
| Mingguan | **Sinkron** di dashboard untuk menarik data terbaru dari sheet |
| Bulanan | Dashboard → filter periode **Bulanan** → baca tren & unit prioritas |
| Perubahan master aset | Edit sheet *Draft Dashboard* → `npm run sync` → commit → push |
| Tambah komponen baru | Tambah di `KOMPONEN_MESIN`/`KOMPONEN_IRRIGATOR` (Code.gs) **dan** grup di `src/data` → `npm run sync` |

**Tips lapangan:** form inspeksi bisa dipakai dari HP. Bila sinyal jelek,
hasil tetap tersimpan di antrean lokal browser; setelah online → **Sinkron**.

---

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| **Kolom komponen (Accu, Klem Accu, …) di sheet Mesin kosong** | Dua sebab: ① Unit itu memang belum pernah diinspeksi lewat dashboard → jalankan **`syncLatestToMaster`** (versi ≥1.2.0) yang kini **menulis A/B/C ke kolom komponen**. ② Endpoint masih deployment lama → update `Version: New version`. Cek hasil: muncul `… , N sel komponen terisi`. |
| **Inspeksi masuk ke "Data Inspeksi", tapi sheet Mesin/Irrigator tidak berubah** | ① Deployment Apps Script masih **versi lama** (belum punya `syncmaster`). Perbaiki: **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**. Cek di **Pengaturan ▸ Uji Koneksi** — harus muncul `versi 1.3.0`. ② Atau jalankan **`syncLatestToMaster`** langsung dari editor Apps Script (paling cepat, tanpa menunggu deploy). ③ Pastikan kolom ringkasan sudah pernah dibuat — kalau belum, fungsi itu juga yang membuatnya. |
| Sheet `Data Inspeksi` masih kosong | Kode hanya **disimpan**, belum **dijalankan**. Jalankan fungsi `backfillDariMaster` di editor (Run ▸ pilih fungsi), atau dari dashboard ▸ Pengaturan ▸ **Isi inspeksi awal**. Cek dengan fungsi `cekStatus`. |
| `Respon server bukan JSON` | Deployment belum "Anyone", atau URL bukan `/exec`. |
| Data tidak muncul di dashboard | Tekan **Sinkron**; pastikan endpoint terisi. |
| Grafik kosong padahal sudah inspeksi | Sama seperti di atas, atau inspeksi masih di **antrean lokal** (Pengaturan ▸ Kirim antrean lokal). |
| Skor unit di master beda dengan riwayat | Master = kondisi terakhir di sheet sumber; riwayat = sesi inspeksi dashboard. Unit berstatus **Rusak** selalu **Kritis**. |
| Ingin grafik terisi untuk presentasi | Pengaturan ▸ **Mode Demo** (data contoh, tidak dikirim ke sheet). |
| Masih ada kolom `Category` di `Data Inspeksi` | Kolom itu sudah dihapus dari master (v1.3.0). Jalankan menu **FS Inspection ▸ 4. Bersihkan kolom Category lama**, lalu **Deploy ▸ New version**. |
| Komponen jadi 46 (mesin) / 29 (irrigator) | Benar — kolom `Category` sudah dihapus dari sheet Mesin & Irrigator. Klik **Sinkron** di dashboard agar data master dimuat ulang. |

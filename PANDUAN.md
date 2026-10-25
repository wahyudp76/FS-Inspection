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
- **Data Unit** dan **Riwayat** juga memakai daftar kartu di HP: kode, tipe, status/kondisi, wilayah & spesifikasi, skor, sebaran A/B/C, petugas, tanggal, dan tombol aksi tampil semua tanpa geser ke samping. Kartu Riwayat bisa dibuka (ikon ⌄) untuk melihat rincian komponen.
- Di layar lebar (≥ 640 px) tetap berupa tabel; tabel lebar di *Pengaturan* masih bisa digeser di dalam kotaknya.
- Semua tombol penting di HP berukuran minimal **36–40 px** (Laporkan kalau ada yang masih terasa kecil).
- **Mode landscape / layar pendek**: menu samping (drawer) kini punya area gulir sendiri, jadi seluruh menu + kartu *Google Sheets* + link sheet tetap bisa dijangkau; header sidebar dirapatkan otomatis pada tinggi layar ≤ 520 px.

## Distribusi Skor (Mesin vs Irrigator)

Kartu **Distribusi Skor** di Dashboard kini memisahkan **Mesin (engine)** dan **Irrigator**
sebagai dua batang berdampingan pada tiap rentang skor (90-100, 80-89, 70-79, 50-69, <50).

- **Klik/ketuk sebuah batang** → terbuka pop-up berisi:
  - jumlah unit, porsi terhadap total tipe tersebut, rata-rata skor, jumlah unit **Kritis** dan **Perlu perhatian**;
  - **analisa naratif** kategori tersebut (mis. *"6 unit Mesin (4% dari seluruh mesin) berada di rentang 80-89 — perlu perhatian; fokus pada …"*);
  - sebaran status (Terpasang/Standby/Rusak) dan wilayah terbanyak;
  - komponen paling bermasalah (B/C) pada rentang itu;
  - **daftar unit** pada rentang tersebut (skor terendah lebih dulu) dengan tombol **Inspeksi**.
- **Klik kode unit** (mis. `DEC0004`) → **detail unit langsung terbuka di atas pop-up**, berisi skor,
  sebaran A/B/C, keterangan master, dan checklist komponen per sistem. Menutup detail (✕ atau Esc)
  mengembalikan Anda ke daftar di halaman yang sama — **tidak berpindah tab**.
- Daftar unit memakai **paging: 10 unit per halaman** (bisa diubah ke 25/50), lengkap dengan penunjuk
  *"menampilkan 1–10"* dan tombol **‹ Sebelumnya / Berikutnya ›** — jadi pop-up tidak perlu digulir panjang.
- Di HP, batang grafik kecil sulit ditekan — tersedia **tombol per rentang** (Mesin / Irrigator) tepat di bawah grafik.
- Pop-up bisa ditutup dengan tombol **Tutup**, tombol **✕**, tombol **Esc**, atau mengetuk area gelap di luar kartu.

## Navigasi

- **Header atas membeku (freeze)** — judul halaman, tombol **+ Tambah Inspeksi**, **Sinkron**, dan **Buka Sheet** tetap terlihat saat halaman digulir ke bawah; muncul bayangan halus sebagai penanda.
- **Tombol ↑ (kembali ke atas)** muncul otomatis di kanan bawah setelah halaman digulir lebih dari ±320 px; sekali klik halaman meluncur kembali ke paling atas.

## Halaman tidak bisa digeser (sudah diperbaiki)

Bila halaman terasa "beku" dan tidak mau digeser ke bawah — biasanya setelah membuka pop-up
(detail unit, ubah inspeksi, tambah inspeksi, atau analisa distribusi skor) — itu karena scroll
halaman tertinggal terkunci. Sejak perbaikan ini:

- kunci scroll hanya aktif **selama pop-up benar-benar terbuka**, dan otomatis dilepas saat ditutup;
- dua pop-up bertumpuk (mis. analisa + detail unit) memakai penghitung, jadi menutup yang atas
  tidak membuka kunci terlalu cepat;
- berpindah tab saat pop-up masih terbuka juga otomatis melepas kunci.

Kalau suatu saat masih terasa terkunci, cukup muat ulang halaman (tombol ↻ browser).

## Service Engine — perawatan rutin musim kemarau (v1.6)

Tab baru **Service Engine** (menu samping) memantau perawatan engine: ganti oli, ganti air
radiator, dan pekerjaan rutin lain setiap **250 HM**.

### Dari mana datanya?

| Tabel | Sheet | Isi | Dipakai untuk |
|---|---|---|---|
| `tb_service1` | **Data Service Engine** (A3:W134) | hasil rumus: service terakhir, HM, rerata HM/hari, tgl & HM service berikutnya, **warning date**, minggu service tiap bulan | **resume evaluasi** (engine mana yang belum diservice, sudah lewat warning date, jatuh tempo) |
| `tb_service2` | **Monitor Kasie FS** (A2:H217) | input kasie: Posisi, No, Tanggal, Month, Bulan Service, Minggu Service, Kode Mesin, HM Service | **tempat pencatatan** dari web |

Rumus yang ditiru dashboard (sama dengan sheet):

- `Rerata HM/hari` = rata-rata `tb_635[HM Berjalan]` per kode unit.
- `Tgl Next Service` = service terakhir + `ROUNDUP(250 / rerata HM/hari)` hari.
- `Next HM Service` = HM terakhir + 250.
- `Warning Date` = `TODAY() − Tgl Next Service` → **positif = sudah lewat**.

### Kategori status

| Status | Arti |
|---|---|
| **Lewat jadwal** | `Warning Date` > 0 — sudah melewati tanggal service berikutnya |
| **Jatuh tempo** | 0 s/d −7 hari lagi |
| **Aman** | masih > 7 hari |
| **Data HM kurang** | sudah pernah diservice tetapi rerata HM/hari kosong di sheet, jadi jadwal belum bisa dihitung |
| **Belum pernah service** | tidak ada baris di `tb_service2` (kolom `Real Service Terakhir` kosong) |

### Yang ada di tab Service Engine

1. **KPI**: total engine, lewat jadwal, jatuh tempo, belum service, service bulan ini, cakupan service.
   Kartu *Lewat Jadwal / Jatuh Tempo / Belum Service* bisa diklik untuk menyaring tabel.
2. **Grafik**: komposisi status (donut, klik untuk filter), status per posisi (FM3/FM4/PG2/OP2),
   volume service per bulan dari `tb_service2`.
3. **Perlu Perhatian**: tab *Lewat / Jatuh tempo / Belum service / Data HM kurang*, urut paling mendesak,
   10 per halaman. Klik satu baris → detail engine.
4. **Tabel Evaluasi Service Engine**: semua 131 engine dengan kolom service terakhir, HM, next service,
   next HM, sisa/telat hari, status, minggu service per bulan, catatan. Filter posisi/jenis/status,
   pencarian, urutan (paling telat / jadwal terdekat / HM terbesar / kode), paging 10/20/50, ekspor CSV.
5. **Riwayat Pencatatan Service**: seluruh baris `tb_service2` (terbaru dulu), dengan kenaikan HM antar
   service. Kenaikan **> 1.000 HM** atau negatif diberi tanda ⚠ — biasanya salah input HM di sheet.

### Mencatat service (masuk ke `tb_service2`)

Tombol **+ Catat Service** (header, juga di dalam tab) membuka pop-up:

1. Pilih **kode mesin** (daftar bisa dicari; yang paling mendesak muncul lebih dulu, lengkap dengan status).
2. **Tanggal service** (default hari ini) → **Bulan** dan **Minggu service** terisi otomatis
   (`Minggu = ROUNDUP(tanggal ÷ 7)`, sama dengan rumus kolom F sheet). **Minggu tidak dipilih manual**
   — begitu tanggal diubah, angkanya ikut menyesuaikan (mis. 22 Okt → Minggu 4).
3. Isi **HM service** (angka hour meter saat ini). Nilai harus lebih besar dari HM terakhir —
   dashboard menolak HM yang sama/kecil supaya tidak dobel.
4. Pratinjau **jadwal berikutnya** (HM +250 dan perkiraan tanggal dari rerata HM/hari) sebelum menyimpan.
5. **Simpan ke Sheet** → Apps Script menambah **satu baris** di akhir `tb_service2`
   (kolom A–H; `Month`, `Bulan Service`, `Minggu Service` diisi rumus), sheet menghitung ulang
   `tb_service1`, lalu dashboard menarik ulang data dan menampilkan jadwal baru.

Catatan penting:

- Baris **tidak dobel**: kode + tanggal + HM yang sama tidak ditulis dua kali (idempoten).
- Setelah menyimpan, jika `tb_service1` belum membaca baris baru, dashboard memberi peringatan
  *“rumus tb_service1 belum membacanya”* — biasanya rentang tabel `tb_service2` perlu diperluas.
- **Perlu Apps Script versi 1.6.0** (`svcread`, `svcrecord`) — lihat bagian *Pasang backend*.

## Urutan bagian di tab Riwayat

Urutan tetap dari atas ke bawah: kartu ringkasan (**Total Sesi**, **Unit Diinspeksi**, **Rata-rata Skor**,
**Temuan B/C**) → **Tren Inspeksi** & **Komposisi Temuan** (grafik, berdampingan di layar lebar) →
**Daftar Inspeksi** (tabel/kartu sesi) di **paling bawah**. Halaman tetap bisa digeser penuh sampai
ke daftar; tombol **kembali ke atas** tersedia di pojok kanan bawah.

## Kecepatan & ketepatan sinkron (v1.4.0)

- **Sinkron pertama** mengunduh seluruh riwayat (± 115 KB untuk 275 sesi — turun dari ± 300 KB karena kolom komponen dikirim sebagai satu kode ringkas).
- **Sinkron berikutnya** hanya menanyakan *sidik jari* sheet (revisi). Bila sheet tidak berubah, server membalas **± 70 byte** — praktis seketika, hemat kuota.
- **Tidak ada data dobel**: setiap kiriman membawa `clientId`; bila jaringan putus di tengah jalan lalu dikirim ulang, Apps Script mengenali ID itu dan **tidak menambah baris kedua**.
- **Waktu sekarang standar ISO +07:00** (`2026-10-24T08:05:00+07:00`), sehingga urutan "inspeksi terakhir" benar di semua browser (termasuk Safari/iPhone) dan tidak lagi terbalik antara jam 09:xx dan 10:xx.
- Angka "inspeksi terakhir" per unit dihitung dari **waktu**, bukan urutan baris sheet — menyisipkan baris manual di sheet tidak lagi mengacak hasil.

## Tombol Sinkron

Tombol **Sinkron** (ikon ↻ di header, atau ↻ pada kartu *Google Sheets* di menu samping) selalu memberi umpan balik:

- **Endpoint belum diisi** → muncul notifikasi *"Endpoint Apps Script belum diatur. Buka menu Pengaturan ▸ Koneksi sheet"*.
- **Endpoint terisi** → ikon berputar, lalu notifikasi **berhasil** atau **gagal** (beserta pesan errornya) dan waktu sinkron terakhir diperbarui.
- Di HP, tombol header berukuran 44×44 px agar mudah ditekan dan tidak salah tekan dengan tombol sebelahnya.

## Ubah & hapus hasil inspeksi (tab Riwayat)

Setiap baris di tab **Riwayat** punya dua tombol: **✎ Ubah** dan **🗑 Hapus** (di HP muncul di setiap kartu,
di desktop pada kolom **Aksi**).

- **Ubah** → pop-up berisi Petugas, Tanggal, Catatan, dan nilai **A/B/C tiap komponen**. Skor & kondisi
  dihitung ulang otomatis saat disimpan (server juga menghitung ulang, jadi tidak mungkin beda).
  Tombol **Simpan perubahan** baru aktif bila ada yang berubah.
- **Hapus** → dialog konfirmasi (menyebut kode unit, tanggal, dan petugas) sebelum baris dihapus dari sheet.
  Penghapusan **tidak bisa dibatalkan**.
- Kedua aksi menulis langsung ke sheet **Data Inspeksi** (aksi `update` / `delete`, butuh Apps Script v1.5.0),
  lalu **otomatis menyinkronkan ke sheet Mesin & Irrigator** (`syncmaster`) dan menarik ulang riwayat —
  daftar di layar langsung ikut berubah tanpa perlu menekan **Sinkron**.
  Matikan bila tidak diinginkan di **Pengaturan ▸ Sinkron otomatis ke sheet Mesin & Irrigator**.
- Sesi yang masih di **antrean lokal** (belum terkirim ke sheet) atau data **Mode Demo** tidak bisa
  diubah/dihapus — muncul notifikasi penjelasan.

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
| **Inspeksi masuk ke "Data Inspeksi", tapi sheet Mesin/Irrigator tidak berubah** | ① Deployment Apps Script masih **versi lama** (belum punya `syncmaster`). Perbaiki: **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**. Cek di **Pengaturan ▸ Uji Koneksi** — harus muncul `versi 1.4.0`. ② Atau jalankan **`syncLatestToMaster`** langsung dari editor Apps Script (paling cepat, tanpa menunggu deploy). ③ Pastikan kolom ringkasan sudah pernah dibuat — kalau belum, fungsi itu juga yang membuatnya. |
| Sheet `Data Inspeksi` masih kosong | Kode hanya **disimpan**, belum **dijalankan**. Jalankan fungsi `backfillDariMaster` di editor (Run ▸ pilih fungsi), atau dari dashboard ▸ Pengaturan ▸ **Isi inspeksi awal**. Cek dengan fungsi `cekStatus`. |
| `Respon server bukan JSON` | Deployment belum "Anyone", atau URL bukan `/exec`. |
| Data tidak muncul di dashboard | Tekan **Sinkron**; pastikan endpoint terisi. |
| Grafik kosong padahal sudah inspeksi | Sama seperti di atas, atau inspeksi masih di **antrean lokal** (Pengaturan ▸ Kirim antrean lokal). |
| Skor unit di master beda dengan riwayat | Master = kondisi terakhir di sheet sumber; riwayat = sesi inspeksi dashboard. Unit berstatus **Rusak** selalu **Kritis** — sekarang bar skor & daftar **Unit Prioritas** ikut memakai aturan ini (unit Rusak tampil merah dan paling atas, walau skornya tinggi). |
| Baris dobel di `Data Inspeksi` setelah sinyal jelek | Seharusnya tidak terjadi lagi sejak v1.4.0 (ID unik per kiriman). Kalau masih ada sisa dobel dari versi lama, hapus manual baris yang `ID Inspeksi`-nya sama. |
| Sinkron terasa lambat | Cek **Pengaturan ▸ Uji Koneksi** — harus `versi 1.4.0`. Versi lama selalu mengunduh penuh ± 300 KB. |
| Ingin grafik terisi untuk presentasi | Pengaturan ▸ **Mode Demo** (data contoh, tidak dikirim ke sheet). |
| Tab **Service Engine** kosong / error “Endpoint Apps Script belum diatur” | Modul service butuh endpoint + Apps Script **v1.6.0**. Tempel ulang `apps-script/Code.gs`, lalu **Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy**. Cek di **Pengaturan ▸ Uji Koneksi** — versi harus `1.6.0`. |
| Service tersimpan tapi jadwal tidak berubah | `tb_service1` belum membaca baris baru. Di sheet **Monitor Kasie FS**, pastikan tabel `tb_service2` mencakup baris terakhir (Table Design ▸ Resize Table), lalu klik **Tarik dari Sheet**. |
| Kolom `HM Service` kosong saat mencatat | HM wajib diisi manual (angka hour meter saat ini); dashboard sengaja tidak mengisinya otomatis supaya tidak tersimpan dobel. |
| Masih ada kolom `Category` di `Data Inspeksi` | Kolom itu sudah dihapus dari master (v1.3.0). Jalankan menu **FS Inspection ▸ 4. Bersihkan kolom Category lama**, lalu **Deploy ▸ New version**. |
| Komponen jadi 46 (mesin) / 29 (irrigator) | Benar — kolom `Category` sudah dihapus dari sheet Mesin & Irrigator. Klik **Sinkron** di dashboard agar data master dimuat ulang. |

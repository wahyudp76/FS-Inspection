# PANDUAN — dari nol sampai dashboard online

Checklist singkat. Detail lengkap ada di [`README.md`](README.md).

---

## Bagian 1 · Siapkan spreadsheet tujuan (5 menit)

1. Buka **Update ZPAS637**
   https://docs.google.com/spreadsheets/d/1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o
2. Menu **Extensions ▸ Apps Script**.
3. Hapus semua isi `Code.gs`, **tempel seluruh isi** file
   `apps-script/Code.gs` dari repo ini → **Save** (ikon disket).
4. Pilih fungsi **`setup`** pada dropdown → **Run** → **Review permissions**
   → pilih akun → *Advanced* → *Go to project (unsafe)* → **Allow**.
   → Sheet **`Data Inspeksi`** terbuat dengan 94 kolom header.
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

## Bagian 4 · Aktifkan GitHub Pages (2 menit)

1. Repo → **Settings ▸ Pages**
   - **Source: GitHub Actions**
2. Repo → **Settings ▸ Secrets and variables ▸ Actions ▸ New repository secret**
   - Name: `VITE_APPS_SCRIPT_URL`
   - Value: URL `/exec` dari Bagian 1
   (opsional — kalau dikosongkan, endpoint diisi manual lewat menu Pengaturan)
3. Push ke `main` (atau **Actions ▸ Deploy Dashboard to GitHub Pages ▸ Run workflow**).
4. Setelah ±1 menit: `https://wahyudp76.github.io/FS-Inspection/`

---

## Bagian 5 · Pasang domain sendiri

1. **Settings ▸ Pages ▸ Custom domain** → isi domain, mis. `inspeksi.domainanda.com` → **Save**.
2. Tambah file `public/CNAME` berisi satu baris:
   ```
   inspeksi.domainanda.com
   ```
   lalu commit & push (agar CNAME tidak hilang setiap deploy).
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
| Harian | Petugas buka dashboard → **Inspeksi** → pilih unit → isi checklist → kirim |
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
| `Respon server bukan JSON` | Deployment belum "Anyone", atau URL bukan `/exec` |
| Data tidak muncul di sheet | Kode diubah tapi belum **New version** pada deployment |
| Grafik kosong padahal sudah inspeksi | Tekan **Sinkron**; atau endpoint belum diisi |
| Skor unit di master beda dengan riwayat | Master = kondisi terakhir di sheet sumber; riwayat = sesi inspeksi dashboard |
| Ingin grafik terisi untuk presentasi | Pengaturan → **Mode Demo** (data contoh, tidak dikirim ke sheet) |
| `Category` muncul 2× | Kolom irrigator otomatis dinamai `Category (Irr)` |

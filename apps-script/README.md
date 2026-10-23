# Apps Script — FS Inspection API

Backend tunggal dashboard: menerima POST dari web dan menulis satu baris
inspeksi ke sheet **`Data Inspeksi`** pada spreadsheet **Update ZPAS637**.

## Langkah pasang

1. Buka spreadsheet **Update ZPAS637** → **Extensions ▸ Apps Script**.
2. Ganti isi `Code.gs` dengan file [`Code.gs`](Code.gs) ini → **Save**.
3. Run ▸ **`setup`** sekali, izinkan akses (membuat/menata header sheet).
4. **Deploy ▸ New deployment**
   - Type: **Web app**
   - Description: `FS Inspection API`
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Salin URL `https://script.google.com/macros/s/…/exec`.
6. Dashboard ▸ **Pengaturan** ▸ tempel URL ▸ **Uji Koneksi**.

## Setiap mengubah kode

**Deploy ▸ Manage deployments ▸ (ikon pensil) ▸ Version: New version ▸ Deploy.**
Tanpa ini, URL `/exec` masih menjalankan versi lama.

## Action yang didukung

| Action | Body | Hasil |
|---|---|---|
| `ping` | `{"action":"ping"}` | `{ok, sheet, records}` |
| `history` | `{"action":"history"}` | `{ok, records:[…]}` |
| `submit` | `{"action":"submit","payload":{…}}` | `{ok, record}` |
| `setup` | `{"action":"setup"}` | `{ok, columns}` |

Contoh payload `submit`:

```json
{
  "action": "submit",
  "payload": {
    "tipe": "Mesin",
    "kode": "SPC0095",
    "wilayah": "PG2",
    "unitJenis": "SPC",
    "spec": "Cummins 6BT5.9-C130-II",
    "statusUnit": "Rusak",
    "tanggal": "2026-10-23",
    "inspector": "Rahmat Hidayat",
    "catatan": "Radiator perlu pressure test",
    "komponen": { "Accu": "A", "Radiator": "B", "V Belt Altenator": "C" },
    "a": 44, "b": 2, "c": 1, "total": 47, "skor": 96.2,
    "kondisi": "Baik",
    "clientId": "FSI-1759…"
  }
}
```

## Catatan teknis

- Menambah komponen baru? Tambahkan namanya di `KOMPONEN_MESIN`/`KOMPONEN_IRRIGATOR`
  **dan** di `src/lib/analytics` pada dashboard (grup komponen). Script juga akan
  menambahkan kolom baru otomatis di header bila belum ada.
- Penulisan memakai `LockService` agar aman saat beberapa petugas mengirim bersamaan.
- `SpreadsheetApp.openById` dipakai supaya script bisa berdiri sendiri
  (tidak harus container-bound).

/**
 * Data layer untuk modul SERVICE ENGINE.
 *
 * Sumber (spreadsheet Update ZPAS637):
 *  - tb_service1  → sheet "Data Service Engine"  (hasil rumus: service terakhir, HM,
 *                   rerata HM/hari, tgl & HM service berikutnya, warning date,
 *                   minggu service tiap bulan)
 *  - tb_service2  → sheet "Monitor Kasie FS"     (input kasie: posisi, no, tanggal,
 *                   bulan, minggu, kode mesin, HM service)
 *
 * Baca: ekspor CSV publik (gviz) — cepat, tanpa perlu deploy ulang Apps Script.
 * Tulis: Apps Script `svcrecord` (menambah SATU baris di akhir tb_service2),
 *        lalu sheet menghitung ulang tb_service1 dengan rumusnya sendiri.
 */
import { getEndpoint, SERVICE_SHEET } from './config'
import { postApi, SERVICE_CACHE_V } from './api'
import { tsMs } from './time'

const LS_SERVICE = 'fsi:service-cache'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export const INTERVAL_HM = 250 // jarak service (HM) sesuai rumus sheet: F + 250
export const AMAN_HARI = 7 // ≤ 7 hari lagi = jatuh tempo
export const BATAS_DELTA_HM = 1000 // lonjakan HM per service di atas ini dianggap janggal
/* HM meter adalah angka yang MENEMPEL pada meter, bukan pada unit: meter yang
   sudah direpair bisa dipasang di unit lain dan HM-nya melanjutkan angka lama.
   Jadi lompatan HM (naik besar, atau turun) adalah KEJADIAN SAH — bukan salah
   ketik. Yang benar-benar mustahil hanya angka yang melebihi kanonik HM per
   jenis meter. Batas di bawah = kelipatan kanonik, bukan angka mati. */
export const BATAS_KANONIK_HM = 6 // > 6x HM khas meter sejenis → perlu dicek (typo ATAU meter repair)
export const BATAS_DELTA_METER = 50000 // beda HM dalam “kategori satu meter” saat meter diganti
/* toleransi ketepatan: interval 250 HM ± 10% masih dianggap "tepat waktu" */
export const TEPAT_MIN = 225
export const TEPAT_MAX = 275

/** Klasifikasi satu pencatatan terhadap target interval 250 HM. */
export const ketepatanHm = (delta) => {
  if (delta == null) return 'baru'
  if (delta < TEPAT_MIN) return 'awal'
  if (delta <= TEPAT_MAX) return 'tepat'
  return 'telat'
}

/* ember urgensi berdasarkan sisa hari menuju warning date */
export const URGENSI = [
  { id: 'lewat30', label: 'Lewat > 30 hr', color: '#9f1239', min: -9999, max: -30 },
  { id: 'lewat8', label: 'Lewat 8–30 hr', color: '#f43f5e', min: -30, max: -8 },
  { id: 'lewat7', label: 'Lewat ≤ 7 hr', color: '#fb7185', min: -8, max: -1 },
  { id: 'tempo', label: 'Tempo 0–7 hr', color: '#f59e0b', min: -1, max: 7 },
  { id: 'aman30', label: 'Aman 8–30 hr', color: '#84cc16', min: 7, max: 30 },
  { id: 'aman', label: 'Aman > 30 hr', color: '#22c55e', min: 30, max: 99999 },
]

export const emberUrgensi = (sisa) => {
  if (sisa == null) return null
  if (sisa < -30) return 'lewat30'
  if (sisa < -7) return 'lewat8'
  if (sisa <= -1 || sisa === 0) return 'lewat7'
  if (sisa <= 7) return 'tempo'
  if (sisa <= 30) return 'aman30'
  return 'aman'
}

/* ------------------------------- util ------------------------------- */

const pad = (n) => String(n).padStart(2, '0')

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Bangun {iso,y,m,d} hanya bila tanggalnya benar-benar ada di kalender.
 * Dulu “31/02/2026” atau “13/13/2026” diterima apa adanya sehingga web
 * menampilkan tanggal yang tidak pernah ada (dan pengelompokan bulan/minggu
 * ikut salah). Sekarang tanggal mustahil dianggap tidak terbaca → dilaporkan
 * sebagai `tanggal-rusak` di kualitas data.
 */
function tanggalSah(y, m, d) {
  if (!(y >= 1900 && y <= 2200)) return null
  if (!(m >= 1 && m <= 12)) return null
  if (!(d >= 1 && d <= 31)) return null
  const uji = new Date(Date.UTC(y, m - 1, d))
  if (uji.getUTCFullYear() !== y || uji.getUTCMonth() !== m - 1 || uji.getUTCDate() !== d) return null
  return { iso: `${y}-${pad(m)}-${pad(d)}`, y, m, d }
}

/** "24 Oktober 2026" / "24/10/2026" / "2026-10-24" → { iso, y, m, d } */
export function parseTanggal(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return tanggalSah(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return tanggalSah(+m[3], +m[2], +m[1])
  /* tanggal ketik manual dengan tahun 2 digit di sheet: "17/09/26" (= 17 Sep 2026).
     Sheet memakai format Indonesia (dd/mm), jadi urutannya hari dulu. */
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/)
  if (m) {
    const yy = +m[3]
    const y = yy >= 70 ? 1900 + yy : 2000 + yy
    return tanggalSah(y, +m[2], +m[1])
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) {
    const idx = BULAN.findIndex((b) => norm(b).startsWith(norm(m[2]).slice(0, 3)))
    if (idx >= 0) return tanggalSah(+m[3], idx + 1, +m[1])
  }
  return null
}

export const tanggalIso = (v) => parseTanggal(v)?.iso || ''
export const namaBulan = (m) => BULAN[m - 1] || ''
export const singkatBulan = (m) => BULAN_SHORT[m - 1] || ''

/** Minggu ke berapa dalam bulan — sama dengan rumus sheet `ROUNDUP(DAY(tgl)/7;0)`. */
export const mingguKe = (v) => {
  const t = parseTanggal(v)
  return t ? Math.ceil(t.d / 7) : null
}

const numOrNull = (v) => {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const selisihHari = (isoA, isoB) => {
  const a = tsMs(isoA)
  const b = tsMs(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86400000)
}

/* ------------------------------ fetch ------------------------------ */

const colIndex = (header, names) => {
  for (const n of names) {
    const i = header.findIndex((h) => norm(h) === norm(n))
    if (i >= 0) return i
  }
  for (const n of names) {
    const i = header.findIndex((h) => norm(h).startsWith(norm(n)))
    if (i >= 0) return i
  }
  return -1
}

/** tb_service1 → daftar unit + status evaluasi */
/** Kelompok HM yang menempel pada satu meter (beda < BATAS_DELTA_METER) —
 *  dipakai menentukan kanonik per meter dan per jenis unit. */
export function kelompokHm(nilai = []) {
  const urut = nilai.filter((v) => v != null && v > 0).sort((a, b) => a - b)
  const grup = []
  for (const v of urut) {
    const akhir = grup[grup.length - 1]
    if (akhir && v - akhir[akhir.length - 1] <= BATAS_DELTA_METER) akhir.push(v)
    else grup.push([v])
  }
  return grup
}

/** Kelompok HM dengan anggota terbanyak; bila seri pakai median terbesar. */
export function grupTerbanyak(nilai = []) {
  const grup = kelompokHm(nilai)
  let pilih = []
  for (const g of grup) {
    if (g.length > pilih.length) pilih = g
    else if (g.length === pilih.length && g.length && medianAngka(g) > medianAngka(pilih)) pilih = g
  }
  return pilih
}

const medianAngka = (arr) => {
  if (!arr.length) return null
  const a = [...arr].sort((x, y) => x - y)
  const t = a.length >> 1
  return a.length % 2 ? a[t] : (a[t - 1] + a[t]) / 2
}

/** Peta nilai HM → { ukuran, median } klaster meternya. Dipakai menilai apakah
 *  satu angka berdiri sendiri (menyendiri) atau bagian dari meter yang dipakai
 *  berulang. */
export function klasterHm(nilai = []) {
  const peta = new Map()
  for (const g of kelompokHm(nilai)) {
    const ukuran = g.length
    for (const v of g) peta.set(v, { ukuran, median: medianAngka(g) })
  }
  return peta
}

/** Deskripsi meter sebuah unit berdasarkan catatannya.
 *  meter   : HM terakhir (angka kontinu pada meter yang sedang terpasang)
 *  kanonik : HM khas meter-mirip; dipakai menilai “mustahil” & acuan jadwal
 *  jumlahMeter : berapa meter berbeda (kategori HM) — 2+ berarti pernah diganti */
export function profilMeter(arr = [], kanonikJenis = null) {
  const semua = arr.map((r) => r.hm).filter((h) => h != null && h > 0)
  const grup = kelompokHm(semua)
  /* kelompok TERBANYAK (bukan nilai terbesar): satu catatan salah ketik 623.031
     tidak boleh dianggap “meter utama” hanya karena angkanya paling besar. */
  const kanonik = medianAngka(grupTerbanyak(semua))
  const meterTerakhir = (() => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].hm != null && arr[i].hm > 0) return arr[i].hm
    return null
  })()
  const peta = klasterHm(semua)
  /* kanonik unit hanya dipercaya bila angkanya muncul >= 2 kali; kalau semua
     catatan unit ini berbeda-beda, pakai kanonik jenis meter */
  const kanonikUnitSah = kanonik != null && (peta.get(kanonik)?.ukuran || 0) >= 2 ? kanonik : null
  const dasar = Math.max(kanonikUnitSah || 0, kanonikJenis || 0) || null
  const perluCek = (h) => {
    if (h == null || h <= 0 || !dasar || dasar <= 0) return false
    if (h <= dasar * BATAS_KANONIK_HM) return false
    /* angka besar yang dipakai BERULANG = meter yang benar-benar terpasang
       (meter repair dengan HM meneruskan) → sah, bukan salah ketik */
    return (peta.get(h)?.ukuran || 0) <= 1
  }
  return { meter: meterTerakhir, kanonik, jumlahMeter: grup.length, perluCek, perluCekTerakhir: perluCek(meterTerakhir) }
}

/** Penundaan pengingat service.
 *  Dua sebab unit bisa DITUNDA:
 *   1. HM jelas belum masuk — perkiraan HM sekarang masih > TUNDA_MIN_HM di bawah
 *      batas (dulu satu-satunya sebab; jarang terjadi karena laju HM di sheet
 *      sebenarnya “laju yang dibutuhkan”, lihat catatan di bawah).
 *   2. Pengguna menunda secara sadar (delay reminder) — pengawas menekan
 *      “Tunda 7 hari” saat unit lewat jadwal; HM dicek lagi 7 hari kemudian.
 *      Ini yang dipakai sehari-hari untuk unit yang banyak standby.
 *
 *  PENTING soal laju: kolom “Rerata HM Perhari” di sheet tb_service1 dihitung
 *  sebagai 250 ÷ jumlah hari menuju jadwal (terbukti 112/112 unit, 2026-11-24),
 *  jadi itu laju YANG DIBUTUHKAN, bukan laju nyata. Memakainya untuk menebak HM
 *  membuat unit yang lewat tanggal selalu tampak “HM sudah masuk”. */
export const TUNDA_MIN_HM = 50 // sisa HM > ini → HM pasti belum masuk
export const TUNDA_MAKS_HARI = 120 // batas penundaan manual agar unit tidak hilang
export const TUNDA_HARI_BAWAAN = 7 // pilihan cepat “Tunda 7 hari”

/** Penundaan manual yang masih berlaku: { kode, sampaiIso, hariLagi, alasan, dicatatIso } */
export function tundaAktif(daftar = [], hariIni = todayIso()) {
  const peta = new Map()
  for (const t of daftar || []) {
    const kode = norm(t?.kode)
    if (!kode || !t?.sampaiIso) continue
    /* selisihHari(a,b) = b − a → sisa hari = sampaiIso − hariIni */
    const hariLagi = selisihHari(hariIni, t.sampaiIso)
    if (hariLagi == null || hariLagi <= 0) continue // penundaan sudah lewat
    /* bila satu unit ditunda berkali-kali, yang berlaku = tanggal terjauh */
    const lama = peta.get(kode)
    if (lama && lama.hariLagi >= hariLagi) continue
    peta.set(kode, {
      kode: String(t.kode).trim().toUpperCase(),
      sampaiIso: t.sampaiIso,
      hariLagi,
      alasan: String(t.alasan || '').trim(),
      dicatatIso: String(t.dicatatIso || '').trim(),
    })
  }
  return peta
}

const fmtRibu = (n) => new Intl.NumberFormat('id-ID').format(Math.round(n))

/** Hitung penundaan pengingat untuk satu unit.
 * @param unit    hasil lengkapiUnitDariLog (butuh hm, nextHm, warning, rerata, terakhirIso)
 * @param hariIni ISO tanggal acuan
 * @param opsi    { manual: Map hasil tundaAktif() }
 * @returns {null | {jenis, hmSekarang, sisaHm, sisaHari, tundaSampaiIso, hmPemicu, laju, alasan}}
 */
export function tundaService(unit, hariIni = todayIso(), opsi = {}) {
  if (!unit) return null
  let manual = opsi.manual instanceof Map ? opsi.manual.get(norm(unit.kode)) : null
  /* penundaan manual hanya berlaku sampai tanggalnya; peta boleh dibuat untuk
     tanggal lain (mis. halaman dibiarkan terbuka melewati tengah malam) */
  if (manual) {
    const sisa = selisihHari(hariIni, manual.sampaiIso)
    if (sisa == null || sisa <= 0) manual = null
    else manual = { ...manual, hariLagi: sisa }
  }

  /* --- sebab 1: penundaan manual yang masih berlaku --- */
  if (manual) {
    const laju = unit.rerata && unit.rerata > 0 ? unit.rerata : null
    const perkiraan = unit.hm != null && laju && unit.terakhirIso ? Math.round(unit.hm + laju * Math.max(0, selisihHari(unit.terakhirIso, hariIni) || 0)) : null
    /* HM hanya ditampilkan bila perkiraannya masih di bawah batas; kalau tidak,
       angka tebakan itu justru menyesatkan (lihat catatan laju di atas) */
    const sisaPerkiraan = unit.nextHm != null && perkiraan != null ? Math.round(unit.nextHm - perkiraan) : null
    const hmTampil = sisaPerkiraan != null && sisaPerkiraan > 0 ? perkiraan : null
    return {
      jenis: 'manual',
      hmSekarang: hmTampil,
      sisaHm: hmTampil != null ? sisaPerkiraan : null,
      sisaHari: manual.hariLagi,
      dibatasi: false,
      laju,
      tundaSampaiIso: manual.sampaiIso,
      hmPemicu: unit.nextHm != null ? Math.round(unit.nextHm - TUNDA_MIN_HM) : null,
      alasan: manual.alasan || `ditunda manual sampai ${manual.sampaiIso} — HM dicek lagi setelah itu`,
    }
  }

  /* --- sebab 2: HM jelas belum masuk (tebakan dari laju sheet) --- */
  if (unit.hm == null || unit.nextHm == null) return null
  if (!(unit.warning != null && unit.warning > 0)) return null
  const laju = unit.rerata && unit.rerata > 0 ? unit.rerata : null
  if (!laju) return null
  if (!unit.terakhirIso) return null
  /* selisihHari(a, b) = b − a (hari): umur = hariIni − terakhir */
  const umur = selisihHari(unit.terakhirIso, hariIni)
  if (umur == null) return null
  const hariSejak = Math.max(0, umur)
  const hmSekarang = Math.round(unit.hm + laju * hariSejak)
  const sisaHm = Math.round(unit.nextHm - hmSekarang)
  if (sisaHm <= TUNDA_MIN_HM) return null
  const sisaHari = Math.max(1, Math.round(sisaHm / laju))
  return {
    jenis: 'hm',
    hmSekarang,
    sisaHm,
    sisaHari,
    /* penundaan dibatasi TUNDA_MAKS_HARI — sisa hari di atas itu tidak dipakai */
    dibatasi: sisaHari > TUNDA_MAKS_HARI,
    laju,
    tundaSampaiIso: tambahHari(hariIni, Math.min(TUNDA_MAKS_HARI, sisaHari)),
    /* HM yang membuat pengingat berbunyi lagi */
    hmPemicu: Math.round(unit.nextHm - TUNDA_MIN_HM),
    alasan: `jadwal lewat ${unit.warning} hari, tetapi perkiraan HM sekarang ${fmtRibu(hmSekarang)} baru menuju ${fmtRibu(unit.nextHm)} (${fmtRibu(sisaHm)} HM lagi ≈ ${sisaHari} hari pada laju ${laju} HM/hari)`,
  }
}

/** Catatan penundaan dari sheet (tb_service3) → daftar tunda manual.
 *  Hanya baris yang sah yang dipakai: butuh kode unit + tanggal sampai + alasan. */
export function parseTunda(header = [], rows = []) {
  if (!rows.length) return []
  const ix = {
    kode: colIndex(header, ['Kode Unit', 'Kode Mesin']),
    sampai: colIndex(header, ['Tunda Sampai', 'Tunda Sampai (ISO)', 'Sampai']),
    alasan: colIndex(header, ['Alasan', 'Keterangan', 'Note']),
    posisi: colIndex(header, ['Posisi']),
    dicatat: colIndex(header, ['Dicatat', 'Tanggal Catat', 'Dicatat Pada']),
  }
  if (ix.kode < 0 || ix.sampai < 0) return []
  const out = []
  for (const r of rows) {
    const kode = String(r[ix.kode] ?? '').trim().toUpperCase()
    if (!kode) continue
    const sampaiIso = parseTanggal(r[ix.sampai])?.iso || ''
    if (!sampaiIso) continue
    out.push({
      kode,
      sampaiIso,
      alasan: String(r[ix.alasan] ?? '').trim(),
      posisi: String(r[ix.posisi] ?? '').trim().toUpperCase(),
      dicatatIso: parseTanggal(r[ix.dicatat])?.iso || '',
    })
  }
  return out
}

export function parseService1(header = [], rows = []) {
  if (!rows.length) return { units: [], header }
  const ix = {
    no: colIndex(header, ['NO', 'Service Engine 2026', 'NO.']),
    kode: colIndex(header, ['KODE UNIT']),
    jenis: colIndex(header, ['JENIS UNIT']),
    posisi: colIndex(header, ['POSISI UNIT']),
    terakhir: colIndex(header, ['Real Service Terakhir']),
    hm: colIndex(header, ['HM Service Terakhir']),
    rerata: colIndex(header, ['Rerata HM Perhari', 'Rerata HM Per Hari']),
    nextTgl: colIndex(header, ['Tgl Next Service']),
    nextHm: colIndex(header, ['Next HM Service']),
    warning: colIndex(header, ['Warning Date']),
    note: colIndex(header, ['NOTE', 'Catatan']),
  }
  /* Header sheet asli berupa "Januari Januari" (nama bulan dobel) → cocokkan dengan
     awalan nama bulan, lalu jatuh ke posisi baku (kolom ke-11 = Januari). */
  const cariKolomBulan = (b, i) => {
    const target = norm(b)
    let pos = header.findIndex((h) => norm(h) === target)
    if (pos < 0) pos = header.findIndex((h) => norm(h).startsWith(target))
    if (pos < 0) pos = header.findIndex((h) => norm(h).startsWith(target.slice(0, 3)) && norm(h).length <= target.length + 4)
    return pos >= 0 ? pos : 10 + i
  }
  const bulanIx = BULAN.map((b, i) => cariKolomBulan(b, i))

  const units = rows
    .map((r) => {
      const kode = String(r[ix.kode] ?? '').trim().toUpperCase()
      if (!kode) return null
      const terakhirRaw = String(r[ix.terakhir] ?? '').trim()
      const belum = !terakhirRaw || /belum/i.test(terakhirRaw)
      const tgl = parseTanggal(terakhirRaw)
      const nextRaw = String(r[ix.nextTgl] ?? '').trim()
      const next = parseTanggal(nextRaw)
      const warning = numOrNull(r[ix.warning])
      const hm = numOrNull(r[ix.hm])
      const rerata = numOrNull(r[ix.rerata])
      const mingguBulan = {}
      BULAN.forEach((b, i) => {
        const v = numOrNull(r[bulanIx[i]])
        if (v != null && v > 0) mingguBulan[b] = v
      })
      let status = 'aman'
      if (belum) status = 'belum'
      else if (warning == null || !next) status = 'tanpaJadwal'
      else if (warning > 0) status = 'terlambat'
      else if (warning >= -AMAN_HARI) status = 'segera'
      return {
        no: numOrNull(r[ix.no]),
        kode,
        jenis: String(r[ix.jenis] ?? '').trim().toUpperCase(),
        posisi: String(r[ix.posisi] ?? '').trim().toUpperCase(),
        terakhirRaw,
        terakhirIso: tgl?.iso || '',
        hm,
        rerata,
        nextRaw,
        nextIso: next?.iso || '',
        nextHm: numOrNull(r[ix.nextHm]),
        warning,
        sisaHari: warning == null ? null : -warning,
        mingguBulan,
        note: String(r[ix.note] ?? '').trim(),
        status,
      }
    })
    .filter(Boolean)

  /* ---- buang baris ganda: satu kode unit bisa muncul 2× di tb_service1.
     Yang dipakai baris dengan HM terbesar (atau tanggal service terbaru). ---- */
  const peta = new Map()
  for (const u of units) {
    const ada = peta.get(u.kode)
    if (!ada) {
      peta.set(u.kode, u)
      continue
    }
    const lebihBaru =
      (u.hm ?? -1) > (ada.hm ?? -1) ||
      ((u.hm ?? -1) === (ada.hm ?? -1) && (u.terakhirIso || '') > (ada.terakhirIso || ''))
    const pilih = lebihBaru ? u : ada
    pilih.duplikat = (ada.duplikat || 0) + (u.duplikat || 0) + 1
    peta.set(u.kode, pilih)
  }
  const unik = [...peta.values()]
  const duplikat = unik.reduce((a, u) => a + (u.duplikat || 0), 0)
  return { units: unik, header, duplikat, baris: units.length }
}

/**
 * LENGKAPI EVALUASI UNIT DARI tb_service2 (+ master).
 *
 * Masalah nyata: sheet `Data Service Engine` (tb_service1) berisi rumus milik
 * pengguna, dan isinya bisa kosong / terpotong (per 27 Okt 2026 hanya 2 dari
 * 151 unit). Seluruh halaman Service dulu bergantung pada sheet itu, sehingga
 * 149 unit hilang dari layar meski catatan servicenya ADA di tb_service2.
 *
 * Fungsi ini menurunkan evaluasi yang setara untuk unit yang tidak ada di
 * tb_service1 — memakai data yang memang tersedia:
 *   service terakhir  : catatan tb_service2 paling baru
 *   HM terakhir       : HM pada catatan itu
 *   rerata HM/hari    : median laju antar catatan unit tersebut (yang wajar)
 *   HM service berikut: HM terakhir + interval (250)
 *   tanggal berikut   : tanggal terakhir + sisa HM ÷ rerata
 *   warning           : selisih hari hari ini → tanggal berikut (negatif = masih ada waktu)
 * Unit master yang belum pernah service tetap dimunculkan dengan status `belum`.
 *
 * `sumber` menandai asal tiap unit: 'evaluasi' (tb_service1) atau 'log'.
 *
 * @returns {{units: Array, tambahan: number, dariLog: number, dariMaster: number}}
 */
export function lengkapiUnitDariLog(units = [], log = [], opts = {}) {
  const intervalHm = opts.intervalHm || INTERVAL_HM
  const master = Array.isArray(opts.master) ? opts.master : []
  const hariIni = opts.hariIni || todayIso()
  const sudah = new Set(units.map((u) => norm(u.kode)))
  const hasil = units.map((u) => ({ ...u, sumber: u.sumber || 'evaluasi' }))

  /* kelompokkan catatan per unit (kronologis naik) */
  const per = new Map()
  for (const r of log) {
    const k = norm(r.kode)
    if (!k) continue
    if (!per.has(k)) per.set(k, [])
    per.get(k).push(r)
  }
  for (const arr of per.values()) arr.sort((a, b) => (a.tanggalMs || 0) - (b.tanggalMs || 0))

  const median = (arr) => {
    if (!arr.length) return null
    const s = [...arr].sort((a, b) => a - b)
    const t = s.length >> 1
    return s.length % 2 ? s[t] : (s[t - 1] + s[t]) / 2
  }

  /* kanonik HM per jenis meter (diambil dari SELURUH log, bukan hanya unit lokal) */
  const hmJenis = new Map()
  for (const [kode, arr] of per) {
    const jenis = (kode || '').slice(0, 3)
    if (!hmJenis.has(jenis)) hmJenis.set(jenis, [])
    for (const r of arr) if (r.hm != null && r.hm > 0) hmJenis.get(jenis).push(r.hm)
  }
  const kanonikJenis = new Map()
  for (const [jenis, nilai] of hmJenis) {
    kanonikJenis.set(jenis, median(grupTerbanyak(nilai)))
  }
  const profilUnit = (kode, arr) => profilMeter(arr, kanonikJenis.get((kode || '').slice(0, 3)))

  let dariLog = 0
  for (const [k, arr] of per) {
    if (sudah.has(k)) continue
    const akhir = arr[arr.length - 1]
    const awal = arr[0]
    /* laju HM/hari dari pasangan catatan berurutan yang masuk akal */
    const laju = []
    for (let i = 1; i < arr.length; i++) {
      const hari = ((arr[i].tanggalMs || 0) - (arr[i - 1].tanggalMs || 0)) / 86400000
      const dHm = arr[i].hm != null && arr[i - 1].hm != null ? arr[i].hm - arr[i - 1].hm : null
      if (hari > 0 && dHm != null && dHm > 0 && dHm <= BATAS_DELTA_HM) laju.push(dHm / hari)
    }
    /* rerata HM/hari: pakai kolom “Rata-Rata Operating Time Harian” milik sheet
       bila ada (itu yang dipakai rumus tb_service1), kalau tidak hitung dari
       laju HM antar catatan unit tersebut */
    const rerataSheet = [...arr].reverse().map((r) => r.rerata).find((n) => n != null && n > 0) ?? null
    const rerata = rerataSheet ?? (laju.length ? Math.round(median(laju) * 10) / 10 : null)
    /* Acuan HM = angka meter yang sedang terpasang, APA ADANYA. Meter repair
       bisa ber-HM besar dan itu sah; meter baru mulai dari kecil juga sah.
       Bila angka terakhir perlu dicek, unit hanya DITANDAI (tidak diubah). */
    const prof = profilUnit(k, arr)
    const hmWajarTerakhir = [...arr].reverse().find((r) => r.hm != null && r.hm > 0) || null
    const hm = hmWajarTerakhir ? hmWajarTerakhir.hm : null
    const nextHm = hm != null ? hm + intervalHm : null
    /* tanggal service berikutnya: pakai isian sheet lebih dulu */
    const nextIsoSheet = [...arr].reverse().map((r) => r.nextIso).find(Boolean) || ''
    let nextIso = nextIsoSheet
    if (!nextIso && rerata && rerata > 0 && hm != null) {
      const sisaHari = Math.round((nextHm - hm) / rerata)
      nextIso = tambahHari(hmWajarTerakhir?.tanggal || akhir.tanggal, sisaHari)
    }
    const warning = nextIso ? -selisihHari(hariIni, nextIso) : null

    let status
    if (hm == null) status = 'belum'
    else if (warning == null) status = 'tanpaJadwal'
    else if (warning > 0) status = 'terlambat'
    else if (warning >= -AMAN_HARI) status = 'segera'
    else status = 'aman'

    hasil.push({
      no: null,
      kode: String(akhir.kode || k).toUpperCase(),
      jenis: String(akhir.kode || '').slice(0, 3).toUpperCase(),
      posisi: String(akhir.posisi || '').toUpperCase(),
      terakhirRaw: akhir.tanggal || '',
      terakhirIso: akhir.tanggal || '',
      hm,
      rerata,
      nextRaw: nextIso,
      nextIso,
      nextHm,
      warning,
      sisaHari: warning == null ? null : -warning,
      mingguBulan: {},
      note: harianCatatan(arr.length, awal, akhir),
      status,
      sumber: 'log',
      dariCatatan: arr.length,
    })
    dariLog++
  }

  /* unit master yang belum punya catatan service sama sekali */
  let dariMaster = 0
  const adaLog = new Set([...per.keys()])
  for (const m of master) {
    const kode = String(m?.kode || '').trim()
    const k = norm(kode)
    if (!k || sudah.has(k) || adaLog.has(k)) continue
    sudah.add(k)
    hasil.push({
      no: null,
      kode: kode.toUpperCase(),
      jenis: kode.slice(0, 3).toUpperCase(),
      /* posisi resmi hanya FM3/FM4/PG2/PG3/OP2 — wilayah master lain (mis.
         GUAVA/BANANA) tidak dipakai sebagai divisi agar filter tetap bersih */
      posisi: POSISI_DIKENAL.includes(String(m.wilayah || '').trim().toUpperCase())
        ? String(m.wilayah).trim().toUpperCase()
        : '',
      terakhirRaw: '',
      terakhirIso: '',
      hm: null,
      rerata: null,
      nextRaw: '',
      nextIso: '',
      nextHm: null,
      warning: null,
      sisaHari: null,
      mingguBulan: {},
      note: 'Belum pernah service',
      status: 'belum',
      sumber: 'log',
      dariCatatan: 0,
    })
    dariMaster++
  }

  /* ---- koreksi “meter HM diganti” untuk unit yang SUDAH ada di tb_service1 ----
     tb_service1 menghitung kolom HM Service Terakhir dengan MAX(), bukan catatan
     terakhir (terbukti pada data 8 Nov 2026: SPC0207 catatan terakhir 9411 tetapi
     tb_service1 menulis 88878). Selama HM selalu naik, MAX = catatan terakhir.
     Setelah hour meter rusak & diganti, angka HM turun dan MAX membuat web terus
     memakai angka LAMA — jadwal jadi jauh di masa depan padahal unit baru saja
     diservice. Aturan: bila catatan log TERBARU lebih kecil dari HM di
     tb_service1 dan tanggalnya tidak lebih tua, catatan log yang dipakai dan
     jadwalnya dihitung ulang dari angka baru. Nilai 0 dilewati (sel kosong yang
     terisi 0, bukan bukti reset). */
  let hmReset = 0
  let hmDikoreksi = 0
  for (const u of hasil) {
    /* tb_service1 memakai MAX(HM): satu salah ketik (mis. 71.610) membuat angka
       itu jadi “HM terakhir” selamanya. Bila catatan log terbaru unit tersebut
       jauh lebih kecil DAN nilai besar itu > 8× HM normal unit, pakai catatan
       log sebagai acuan supaya jadwal tidak meleset ratusan hari. */
    /* tb_service1 memakai MAX(HM): setelah meter diganti dengan meter ber-HM
       lebih kecil, kolom itu masih memuat angka meter LAMA. Acuan dipindah ke
       catatan terbaru hanya bila (a) angka sheet melebihi kanonik jenis meter
       berkali-kali (salah ketik), atau (b) catatan terbaru adalah meter lain
       yang lebih kecil (meter repair ber-HM rendah). Kebalikannya — meter repair
       ber-HM BESAR — dibiarkan: itu memang angka meter yang sekarang. */
    if (u.sumber !== 'log' && u.hm != null) {
      const arr0 = per.get(norm(u.kode))
      const prof0 = profilUnit(norm(u.kode), arr0 || [])
      const akhir0 = [...(arr0 || [])].reverse().find((r) => r.hm != null && r.hm > 0)
      /* hanya kasus meter diganti ke meter ber-HM LEBIH KECIL: kolom MAX di
         tb_service1 masih memuat angka meter lama. Lompatan ke angka besar
         dibiarkan (itu angka meter yang sekarang). */
      const meterLebihKecil = akhir0 != null && akhir0.hm < u.hm && u.hm - akhir0.hm > BATAS_DELTA_METER
      if (meterLebihKecil && akhir0 && akhir0.hm < u.hm) {
        const lama = u.hm
        u.hm = akhir0.hm
        u.terakhirIso = akhir0.tanggal || u.terakhirIso
        u.terakhirRaw = akhir0.tanggal || u.terakhirRaw
        u.nextHm = akhir0.hm + intervalHm
        u.hmDikoreksi = {
          dari: lama,
          ke: akhir0.hm,
          tanggal: akhir0.tanggal,
          alasan: 'tb_service1 memakai HM meter lama (MAX) — meter sudah diganti dengan meter ber-HM lebih rendah',
        }
        /* tanggal service berikutnya: pakai tanggal catatan wajar + laju HM/hari
           (kolom rerata sheet bila ada, kalau tidak median laju historis) */
        let laju0 = u.rerata != null && u.rerata > 0 ? u.rerata : null
        if (laju0 == null) {
          const arrLaju = []
          for (let i = 1; i < (arr0?.length || 0); i++) {
            const hari = ((arr0[i].tanggalMs || 0) - (arr0[i - 1].tanggalMs || 0)) / 86400000
            const d = arr0[i].hm != null && arr0[i - 1].hm != null ? arr0[i].hm - arr0[i - 1].hm : null
            if (hari > 0 && d != null && d > 0 && d <= BATAS_DELTA_HM) arrLaju.push(d / hari)
          }
          laju0 = arrLaju.length ? Math.round(median(arrLaju) * 10) / 10 : null
        }
        if (laju0 && laju0 > 0 && akhir0.tanggal) {
          const nextIso0 = tambahHari(akhir0.tanggal, Math.round((intervalHm - 0) / laju0))
          u.nextIso = nextIso0
          u.warning = -selisihHari(hariIni, nextIso0)
          u.status = u.warning > 0 ? 'terlambat' : u.warning >= -AMAN_HARI ? 'segera' : 'aman'
        }
        hmDikoreksi++
      }
    }
    if (u.sumber === 'log') continue
    const arr = per.get(norm(u.kode))
    if (!arr || !arr.length) continue
    const akhir = arr[arr.length - 1]
    if (akhir.hm == null || akhir.hm <= 0 || !akhir.tanggal) continue
    if (u.hm == null || akhir.hm >= u.hm) continue
    if (u.terakhirIso && akhir.tanggal < u.terakhirIso) continue

    const hmLama = u.hm
    u.hm = akhir.hm
    u.terakhirIso = akhir.tanggal
    u.terakhirRaw = akhir.tanggal
    u.nextHm = akhir.hm + intervalHm
    u.hmReset = { dari: hmLama, ke: akhir.hm, tanggal: akhir.tanggal, baris: akhir.baris }

    /* rerata HM/hari: pakai kolom sheet bila ada, kalau tidak median laju historis
       (pasangan yang masih wajar) sebagai perkiraan */
    let rerata = u.rerata != null && u.rerata > 0 ? u.rerata : null
    if (rerata == null) {
      const laju = []
      for (let i = 1; i < arr.length; i++) {
        const hari = ((arr[i].tanggalMs || 0) - (arr[i - 1].tanggalMs || 0)) / 86400000
        const dHm = arr[i].hm != null && arr[i - 1].hm != null ? arr[i].hm - arr[i - 1].hm : null
        if (hari > 0 && dHm != null && dHm > 0 && dHm <= BATAS_DELTA_HM) laju.push(dHm / hari)
      }
      rerata = laju.length ? Math.round(median(laju) * 10) / 10 : null
    }
    if (rerata) {
      u.rerata = rerata
      const sisaHari = Math.ceil(intervalHm / rerata)
      u.nextIso = tambahHari(akhir.tanggal, sisaHari)
      u.nextRaw = u.nextIso
      u.warning = selisihHari(hariIni, u.nextIso)
      u.sisaHari = -u.warning
      u.status = u.warning > 0 ? 'terlambat' : u.warning >= -AMAN_HARI ? 'segera' : 'aman'
    } else {
      u.rerata = null
      u.nextIso = ''
      u.nextRaw = ''
      u.warning = null
      u.sisaHari = null
      u.status = 'tanpaJadwal'
    }
    hmReset++
  }

  return { units: hasil, tambahan: dariLog + dariMaster, dariLog, dariMaster, hmReset, hmDikoreksi }
}

export const POSISI_DIKENAL = ['FM3', 'FM4', 'PG2', 'PG3', 'OP2']

const harianCatatan = (n, awal, akhir) =>
  n > 1 ? `${n} catatan service · sejak ${awal.tanggal}` : '1 catatan service'

/** tb_service2 → daftar pencatatan service (blok A:H) */
export function parseService2(header = [], rows = []) {
  if (!rows.length) return []
  const ix = {
    posisi: colIndex(header, ['Posisi']),
    no: colIndex(header, ['No']),
    tanggal: colIndex(header, ['Tanggal']),
    bulanNum: colIndex(header, ['Month']),
    bulan: colIndex(header, ['Bulan Service']),
    minggu: colIndex(header, ['Minggu Service']),
    kode: colIndex(header, ['Kode Mesin']),
    hm: colIndex(header, ['HM Service']),
    /* kolom bantu milik sheet (dikirim sejak Code.gs 1.9.0) */
    rerata: colIndex(header, ['Rata-Rata Operating Time Harian', 'Rata-rata Operating Time Harian']),
    nextTgl: colIndex(header, ['Next Service']),
  }
  const log = rows
    .map((r, i) => {
      const kode = String(r[ix.kode] ?? '').trim().toUpperCase()
      if (!kode) return null
      const tgl = parseTanggal(r[ix.tanggal])
      const hm = numOrNull(r[ix.hm])
      return {
        baris: i + 2,
        posisi: String(r[ix.posisi] ?? '').trim().toUpperCase(),
        no: numOrNull(r[ix.no]),
        tanggal: tgl?.iso || '',
        tanggalRaw: String(r[ix.tanggal] ?? '').trim(),
        tanggalMs: tsMs(tgl?.iso),
        bulanNum: tgl?.m || numOrNull(r[ix.bulanNum]),
        bulan: tgl ? namaBulan(tgl.m) : String(r[ix.bulan] ?? '').trim(),
        minggu: numOrNull(r[ix.minggu]) || mingguKe(tgl?.iso),
        kode,
        hm,
        rerata: numOrNull(r[ix.rerata]),
        nextIso: parseTanggal(r[ix.nextTgl])?.iso || '',
      }
    })
    .filter(Boolean)

  /* urut kronologis untuk menghitung selisih HM antar service unit yang sama */
  const asc = [...log].sort((a, b) => (a.tanggalMs - b.tanggalMs) || (a.no - b.no))

  /* median HM per unit: dasar menilai “wajar” — mesin tua memang bisa puluhan
     ribu jam, jadi batas mutlak saja tidak cukup. */
  const hmPerUnit = new Map()
  for (const r of asc) {
    if (r.hm == null || r.hm <= 0) continue
    if (!hmPerUnit.has(r.kode)) hmPerUnit.set(r.kode, [])
    hmPerUnit.get(r.kode).push(r.hm)
  }
  const medianDari = (arr) => {
    if (!arr.length) return null
    const a = [...arr].sort((x, y) => x - y)
    const t = a.length >> 1
    return a.length % 2 ? a[t] : (a[t - 1] + a[t]) / 2
  }
  /* Kanonik per JENIS meter (SPC/DEM/DED/…): HM khas meter-mirip. Dipakai menilai
     “mustahil” supaya unit yang meter repair-nya ber-HM 60.000 tidak dituduh
     salah hanya karena unit lain di jenis yang sama baru 6.000. */
  const hmPerJenis = new Map()
  for (const [kode, arr] of hmPerUnit) {
    const jenis = (kode || '').slice(0, 3)
    if (!hmPerJenis.has(jenis)) hmPerJenis.set(jenis, [])
    hmPerJenis.get(jenis).push(...arr)
  }
  const kanonikJenis = new Map()
  for (const [jenis, arr] of hmPerJenis) {
    const grup = grupTerbanyak(arr)
    kanonikJenis.set(jenis, medianDari(grup))
  }
  /* catatan per unit, urut kronologis (dipakai untuk profil meter) */
  const perUnit = new Map()
  for (const r of asc) {
    if (!perUnit.has(r.kode)) perUnit.set(r.kode, [])
    perUnit.get(r.kode).push(r)
  }
  const profilPerUnit = new Map()
  for (const [kode, arr] of perUnit) {
    profilPerUnit.set(kode, profilMeter(arr, kanonikJenis.get((kode || '').slice(0, 3))))
  }

  const prevHm = new Map()
  const meterSaatIni = new Map()
  for (const r of asc) {
    const prev = prevHm.get(r.kode)
    r.hmDelta = prev != null && r.hm != null ? r.hm - prev : null
    /* Salah ketik = angka melebihi kanonik jenis meter berkali-kali (mis. 623.031
       pada jenis SPC). Lompatan naik/turun yang masih di kisaran HM meter wajar
       BUKAN salah ketik: meter hasil repair bisa dipasang dan HM-nya melanjutkan. */
    const prof = profilPerUnit.get(r.kode) || {}
    /* “perlu dicek” = angka jauh di atas HM khas meter sejenis DAN menyendiri
       (tidak pernah muncul lagi) → bisa salah ketik digit, bisa juga meter hasil
       repair. Bukan vonis, hanya penanda untuk dicek ke mekanik/sheet. */
    r.hmPerluCek = r.hm != null && typeof prof.perluCek === 'function' && prof.perluCek(r.hm)
    /* Perpindahan meter: selisih HM melewati BATAS_DELTA_METER (atau turun) →
       meter berbeda (baru / hasil repair yang HM-nya meneruskan angka lama).
       Kejadian SAH: tetap ditampilkan, tapi dikecualikan dari penilaian interval
       dan tidak dipakai menghitung laju HM/hari. */
    r.hmGantiMeter = false
    if (r.hm != null && r.hm > 0) {
      const meterLama = meterSaatIni.get(r.kode)
      r.hmGantiMeter = meterLama != null && (r.hm - meterLama > BATAS_DELTA_METER || r.hm < meterLama)
      meterSaatIni.set(r.kode, r.hm)
    }
    /* “Janggal” = interval service yang tidak bisa dinilai, HANYA dari besaran
       selisih: HM turun (meter baru / reset) atau lonjakan > BATAS_DELTA_HM
       (meter hasil repair yang HM-nya meneruskan, atau salah ketik). Penanda
       “perlu dicek” adalah lapisan tambahan di atasnya. */
    r.hmAnomali = r.hmDelta != null && (r.hmDelta < 0 || r.hmDelta > BATAS_DELTA_HM)
    r.hmNol = r.hm === 0
    if (r.hm != null && r.hm > 0) prevHm.set(r.kode, r.hm)
  }
  /* ---- buang pencatatan GANDA di tb_service2 ----
     Sheet sering memuat baris yang sama dua kali (posisi + kode + tanggal + HM
     identik); bila dibiarkan, grafik volume/bulan dan hitungan “service bulan
     ini” membengkak (per 30 Okt 2026: 104 baris September, hanya 67 yang unik).
     Kunci: posisi|kode|tanggal|HM. Baris tanpa tanggal tidak digabung. */
  const kunciUnik = new Set()
  const bersih = []
  const contohGanda = []
  let ganda = 0
  for (const r of log) {
    if (!r.tanggal) { bersih.push(r); continue }
    const key = [r.posisi, r.kode, r.tanggal, r.hm == null ? '' : r.hm].join('|')
    if (kunciUnik.has(key)) {
      ganda++
      if (contohGanda.length < 4) contohGanda.push(`${r.kode} ${r.tanggal}${r.hm == null ? '' : ` @${r.hm}`}`)
      continue
    }
    kunciUnik.add(key)
    bersih.push(r)
  }
  /* jumlah ganda disimpan sebagai properti array agar bisa dilaporkan di UI */
  bersih.duplikat = ganda
  bersih.duplikatKunci = contohGanda

  /* urutan tampil: terbaru dulu */
  return bersih.sort((a, b) => (b.tanggalMs - a.tanggalMs) || (b.no - a.no))
}

/* ----------------------------- ringkasan ----------------------------- */

export function ringkasService(units = [], log = [], meta = {}) {
  const hitung = (id) => units.filter((u) => u.status === id).length
  const byStatus = {
    terlambat: hitung('terlambat'),
    segera: hitung('segera'),
    aman: hitung('aman'),
    tanpaJadwal: hitung('tanpaJadwal'),
    belum: hitung('belum'),
  }
  const sudahService = units.filter((u) => u.status !== 'belum').length
  const rerata = units.map((u) => u.rerata).filter((n) => n != null && n > 0)
  const posisi = [...new Set(units.map((u) => u.posisi).filter(Boolean))].sort()
  const jenis = [...new Set(units.map((u) => u.jenis).filter(Boolean))].sort()

  const perPosisi = posisi.map((p) => {
    const set = units.filter((u) => u.posisi === p)
    const n = (id) => set.filter((u) => u.status === id).length
    const total = set.length
    const belum = n('belum')
    const sudah = total - belum
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0)
    return {
      posisi: p,
      total,
      terlambat: n('terlambat'),
      segera: n('segera'),
      aman: n('aman'),
      tanpaJadwal: n('tanpaJadwal'),
      belum,
      sudah,
      belumPct: pct(belum),
      sudahPct: pct(sudah),
      terlambatPct: pct(n('terlambat')),
      /* bagian untuk bar 100% bertumpuk */
      beres: n('aman'),
    }
  })

  const perJenis = jenis.map((j) => {
    const set = units.filter((u) => u.jenis === j)
    return {
      jenis: j,
      total: set.length,
      terlambat: set.filter((u) => u.status === 'terlambat').length,
      belum: set.filter((u) => u.status === 'belum').length,
      aman: set.filter((u) => u.status === 'aman').length,
    }
  })

  /* daftar perhatian: urut paling telat dulu */
  const terlambat = units.filter((u) => u.status === 'terlambat').sort((a, b) => b.warning - a.warning)
  const segera = units.filter((u) => u.status === 'segera').sort((a, b) => a.sisaHari - b.sisaHari)
  const belum = units.filter((u) => u.status === 'belum').sort((a, b) => a.kode.localeCompare(b.kode))
  const tanpaJadwal = units
    .filter((u) => u.status === 'tanpaJadwal')
    .sort((a, b) => (b.hm || 0) - (a.hm || 0))
  const aman = units.filter((u) => u.status === 'aman').sort((a, b) => a.sisaHari - b.sisaHari)

  /* ---- tren service per bulan: volume, unit unik, ketepatan interval HM ---- */
  const mapBulan = new Map()
  for (const r of log) {
    if (!r.bulanNum) continue
    const key = r.bulanNum
    const cur =
      mapBulan.get(key) ||
      { bulanNum: key, label: singkatBulan(key), sesi: 0, unit: new Set(), tepat: 0, telat: 0, awal: 0, delta: [], baru: 0 }
    cur.sesi += 1
    cur.unit.add(r.kode)
    /* HM janggal (> 1.000 HM sekali service) tidak dipakai menghitung ketepatan */
    if (r.hmAnomali) cur.baru += 1
    else {
      const k = ketepatanHm(r.hmDelta)
      if (k === 'tepat') cur.tepat += 1
      else if (k === 'telat') cur.telat += 1
      else if (k === 'awal') cur.awal += 1
      if (r.hmDelta != null) cur.delta.push(r.hmDelta)
    }
    mapBulan.set(key, cur)
  }
  const perBulan = [...mapBulan.values()]
    .sort((a, b) => a.bulanNum - b.bulanNum)
    .map((b) => {
      const dinilai = b.tepat + b.telat + b.awal
      return {
        label: b.label,
        bulanNum: b.bulanNum,
        sesi: b.sesi,
        unit: b.unit.size,
        tepat: b.tepat,
        telat: b.telat,
        awal: b.awal,
        dinilai,
        tepatPct: dinilai ? Math.round((b.tepat / dinilai) * 100) : null,
        deltaRata: b.delta.length ? Math.round(b.delta.reduce((x, y) => x + y, 0) / b.delta.length) : null,
      }
    })

  const hmJanggal = log.filter((r) => r.hmAnomali).length
  const hmGantiMeterTotal = log.filter((r) => r.hmGantiMeter).length

  /* ---- ketepatan interval keseluruhan ---- */
  const dinilaiLog = log.filter((r) => !r.hmAnomali && r.hmDelta != null)
  const ketepatan = {
    dinilai: dinilaiLog.length,
    tepat: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'tepat').length,
    telat: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'telat').length,
    awal: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'awal').length,
    dikecualikan: hmJanggal,
  }
  ketepatan.pct = ketepatan.dinilai ? Math.round((ketepatan.tepat / ketepatan.dinilai) * 100) : 0
  /* sebaran selisih HM antar service (dibulatkan ke rentang 50 HM) */
  const ember = [
    { id: '<150', label: '< 150', min: 0, max: 150, color: '#0ea5e9' },
    { id: '150-199', label: '150–199', min: 150, max: 200, color: '#0d9488' },
    { id: '200-224', label: '200–224', min: 200, max: TEPAT_MIN, color: '#7dd3fc' },
    { id: '225-275', label: '225–275', min: TEPAT_MIN, max: TEPAT_MAX + 1, color: '#22c55e' },
    { id: '276-349', label: '276–349', min: TEPAT_MAX + 1, max: 350, color: '#fb7185' },
    { id: '350+', label: '≥ 350', min: 350, max: 1e9, color: '#f43f5e' },
  ]
  ketepatan.sebaran = ember.map((e) => ({
    ...e,
    jumlah: dinilaiLog.filter((r) => r.hmDelta >= e.min && r.hmDelta < e.max).length,
  }))
  ketepatan.rata = dinilaiLog.length
    ? Math.round(dinilaiLog.reduce((a, r) => a + r.hmDelta, 0) / dinilaiLog.length)
    : null

  /* ---- sebaran urgensi (sisa hari menuju warning date) ---- */
  const mapUrgensi = new Map()
  for (const u of units) {
    if (u.status === 'belum') continue
    if (u.sisaHari == null) continue
    const id = emberUrgensi(u.sisaHari)
    mapUrgensi.set(id, (mapUrgensi.get(id) || 0) + 1)
  }
  const urgensi = URGENSI.map((e) => ({ ...e, jumlah: mapUrgensi.get(e.id) || 0 }))

  /* ---- 10 engine paling terlambat ---- */
  const topTerlambat = terlambat.slice(0, 10).map((u) => ({ kode: u.kode, posisi: u.posisi, jenis: u.jenis, telat: u.warning, jadwal: u.nextIso }))

  const hariIni = new Date()
  const bulanIni = hariIni.getMonth() + 1
  const serviceBulanIni = log.filter((r) => r.bulanNum === bulanIni).length

  return {
    totalUnit: units.length,
    sudahService,
    belumService: byStatus.belum,
    terlambat: byStatus.terlambat,
    segera: byStatus.segera,
    aman: byStatus.aman,
    tanpaJadwal: byStatus.tanpaJadwal,
    byStatus,
    rerataHmHarian: rerata.length ? Math.round(rerata.reduce((a, b) => a + b, 0) / rerata.length) : null,
    posisi,
    jenis,
    perPosisi,
    perJenis,
    perBulan,
    ketepatan,
    urgensi,
    topTerlambat,
    totalPencatatan: log.length,
    serviceBulanIni,
    hmJanggal,
    hmGantiMeter: hmGantiMeterTotal,
    duplikat: meta.duplikat || 0,
    daftar: { terlambat, segera, belum, tanpaJadwal, aman },
    cakupan: units.length ? Math.round((sudahService / units.length) * 100) : 0,
  }
}

/** Riwayat service satu unit (dari tb_service2, terbaru dulu) */
/* ---------------------- analisa per bulan ---------------------- */

export const bulanKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`

/** Daftar bulan acuan: semua bulan yang ada di tb_service2 + bulan ini & bulan depan. */
export function daftarBulan(log = [], hariIni = new Date()) {
  const map = new Map()
  for (const r of log) {
    const iso = r.tanggal || ''
    if (iso.length < 7) continue
    const key = iso.slice(0, 7)
    map.set(key, (map.get(key) || 0) + 1)
  }
  const y = hariIni.getFullYear()
  const m = hariIni.getMonth() + 1
  const ini = bulanKey(y, m)
  const depan = m === 12 ? bulanKey(y + 1, 1) : bulanKey(y, m + 1)
  if (!map.has(ini)) map.set(ini, 0)
  if (!map.has(depan)) map.set(depan, 0)
  return [...map.entries()]
    .map(([key, jumlah]) => {
      const [yy, mm] = key.split('-').map(Number)
      return { value: key, label: `${namaBulan(mm)} ${yy}`, singkat: `${singkatBulan(mm)} ${String(yy).slice(2)}`, y: yy, m: mm, jumlah }
    })
    .sort((a, b) => (b.y - a.y) || (b.m - a.m))
}

/** Kohort aktivitas satu engine pada bulan acuan. */
export const KOHORT = [
  { id: 'servisIni', label: 'Service bulan ini', short: 'Servis', color: '#22c55e', cls: 'text-emerald-700 bg-emerald-500/12 border-emerald-500/35' },
  { id: 'servisLalu', label: 'Service bulan lalu', short: 'Bulan lalu', color: '#0d9488', cls: 'text-teal-700 bg-teal-600/12 border-teal-600/35' },
  { id: 'jadwalIni', label: 'Jadwal bulan ini, belum dikerjakan', short: 'Jadwal kini', color: '#f59e0b', cls: 'text-amber-700 bg-amber-500/12 border-amber-500/35' },
  { id: 'jadwalDepan', label: 'Jadwal bulan depan', short: 'Bulan depan', color: '#7c3aed', cls: 'text-violet-700 bg-violet-500/12 border-violet-500/35' },
  { id: 'lain', label: 'Di luar 3 kategori itu', short: 'Lainnya', color: '#64748b', cls: 'text-slate-700 bg-slate-500/12 border-slate-500/35' },
]
export const kohortMeta = (id) => KOHORT.find((k) => k.id === id) || KOHORT[4]

/**
 * Kelompokkan engine menurut aktivitas pada bulan acuan:
 *  - service dilakukan bulan ini / bulan lalu (dari tb_service2),
 *  - jadwal service jatuh bulan ini (belum dikerjakan) atau bulan depan (dari tb_service1).
 */
export function analisaBulan(units = [], log = [], acuanValue) {
  const [ay, am] = String(acuanValue || '').split('-').map(Number)
  const hariIni = new Date()
  const y = ay || hariIni.getFullYear()
  const m = am || hariIni.getMonth() + 1
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }
  const kIni = bulanKey(y, m)
  const kLalu = bulanKey(prev.y, prev.m)
  const kDepan = bulanKey(next.y, next.m)

  /* service per unit per bulan */
  const mapLog = new Map()
  for (const r of log) {
    const iso = r.tanggal || ''
    if (iso.length < 7) continue
    const key = iso.slice(0, 7)
    const cur = mapLog.get(r.kode) || {}
    const arr = cur[key] || []
    arr.push(iso)
    cur[key] = arr
    mapLog.set(r.kode, cur)
  }

  const perUnit = new Map()
  for (const u of units) {
    const bulan = mapLog.get(u.kode) || {}
    const ini = (bulan[kIni] || []).slice().sort()
    const lalu = (bulan[kLalu] || []).slice().sort()
    const nextIso = u.nextIso || ''
    const nextKey = nextIso.slice(0, 7)
    const jadwalIni = nextKey === kIni && u.status !== 'belum' ? nextIso : ''
    const jadwalDepan = nextKey === kDepan && u.status !== 'belum' ? nextIso : ''

    let kohort = 'lain'
    if (ini.length) kohort = 'servisIni'
    else if (lalu.length) kohort = 'servisLalu'
    else if (jadwalIni) kohort = 'jadwalIni'
    else if (jadwalDepan) kohort = 'jadwalDepan'

    perUnit.set(u.kode, {
      kohort,
      servisIni: ini.length,
      servisIniTerakhir: ini.length ? ini[ini.length - 1] : '',
      servisLalu: lalu.length,
      servisLaluTerakhir: lalu.length ? lalu[lalu.length - 1] : '',
      jadwalIni,
      jadwalDepan,
    })
  }

  const jumlah = { servisIni: 0, servisLalu: 0, jadwalIni: 0, jadwalDepan: 0, lain: 0 }
  for (const v of perUnit.values()) jumlah[v.kohort] += 1

  /* hitungan Jadwal TIDAK eksklusif: satu engine bisa diservice bulan ini sekaligus
     punya jadwal berikutnya di bulan depan — dua-duanya perlu terlihat. */
  const jadwalIniSemua = units.filter((u) => u.status !== 'belum' && (u.nextIso || '').slice(0, 7) === kIni)
  const jadwalDepanSemua = units.filter((u) => u.status !== 'belum' && (u.nextIso || '').slice(0, 7) === kDepan)
  const servisLaluSemua = units.filter((u) => (mapLog.get(u.kode)?.[kLalu] || []).length > 0)

  /* service yang benar-benar dilakukan pada tiap bulan (bukan per unit, tapi hitungan sesi) */
  const sesiIni = log.filter((r) => (r.tanggal || '').slice(0, 7) === kIni).length
  const sesiLalu = log.filter((r) => (r.tanggal || '').slice(0, 7) === kLalu).length

  const daftar = {}
  for (const k of KOHORT) daftar[k.id] = units.filter((u) => perUnit.get(u.kode)?.kohort === k.id)

  /* himpunan kode untuk menyaring tabel (termasuk dua himpunan jadwal non-eksklusif) */
  const sets = {}
  for (const k of KOHORT) sets[k.id] = new Set(daftar[k.id].map((u) => u.kode))
  sets.jadwalIniSemua = new Set(jadwalIniSemua.map((u) => u.kode))
  sets.jadwalDepanSemua = new Set(jadwalDepanSemua.map((u) => u.kode))
  sets.servisLaluSemua = new Set(servisLaluSemua.map((u) => u.kode))

  return {
    acuan: { value: kIni, label: `${namaBulan(m)} ${y}`, singkat: singkatBulan(m), y, m },
    lalu: { value: kLalu, label: `${namaBulan(prev.m)} ${prev.y}`, singkat: singkatBulan(prev.m) },
    depan: { value: kDepan, label: `${namaBulan(next.m)} ${next.y}`, singkat: singkatBulan(next.m) },
    perUnit,
    jumlah: {
      ...jumlah,
      jadwalIniSemua: jadwalIniSemua.length,
      jadwalDepanSemua: jadwalDepanSemua.length,
      servisLaluSemua: servisLaluSemua.length,
    },
    sesiIni,
    sesiLalu,
    daftar,
    sets,
  }
}

export const labelAktivitas = (info, analisa) => {
  if (!info || !analisa) return '—'
  switch (info.kohort) {
    case 'servisIni':
      return `Servis ${analisa.acuan.singkat}`
    case 'servisLalu':
      return `Servis ${analisa.lalu.singkat}`
    case 'jadwalIni':
      return `Jadwal ${analisa.acuan.singkat}`
    case 'jadwalDepan':
      return `Jadwal ${analisa.depan.singkat}`
    default:
      return '—'
  }
}

/* ================== analisa “kondisi per bulan” ==================
   Untuk filter bulan: status tiap engine dihitung ulang seolah-olah hari ini
   adalah akhir bulan acuan (atau hari ini bila bulan itu masih berjalan).
   Dasar: service terakhir (tb_service2) + jadwal berikutnya (tb_service1),
   sehingga “berapa yang lewat jadwal di bulan September” bisa dijawab.
   ================================================================= */

const keyBulanIso = (iso) => (iso || '').slice(0, 7)

/** ISO + n hari (aritmetika tanggal murni, tanpa geser zona waktu WIB) */
export const tambahHari = (iso, n) => {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + n * 86400000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export const akhirBulan = (acuanKey) => {
  const [y, m] = String(acuanKey).split('-').map(Number)
  if (!y || !m) return ''
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/** Titik acuan waktu untuk satu bulan: akhir bulan, dibatasi hari ini. */
export const refBulan = (acuanKey, hariIni = todayIso()) => {
  const akhir = akhirBulan(acuanKey)
  if (!akhir) return hariIni
  return hariIni < akhir ? hariIni : akhir
}

export const labelRef = (iso) => {
  const t = parseTanggal(iso)
  return t ? `${t.d} ${singkatBulan(t.m)} ${t.y}` : ''
}

/**
 * Status tiap engine “per refIso”.
 * - belum      : belum ada pencatatan service sampai tanggal itu
 * - tanpaJadwal: tidak ada jadwal/rerata HM, jadi tanggal service berikutnya tak bisa dihitung
 * - terlambat  : tanggal service berikutnya sudah lewat pada refIso
 * - segera     : ≤ 7 hari lagi
 * - aman       : masih > 7 hari lagi
 */
/**
 * Jadwal service BERIKUTNYA untuk satu unit setelah service tanggal `terakhir`.
 * Aturan sama dengan isi sheet: bila baris terakhir di log adalah baris terakhir
 * yang tercatat di tb_service1, pakai jadwal resmi sheet (`nextIso`); kalau tidak,
 * perkirakan dari rata-rata jam operasi harian (interval 250 HM).
 */
export const jadwalBerikut = (u, terakhir = '') => {
  if (!terakhir) return ''
  if (terakhir === u.terakhirIso) return u.nextIso || ''
  if (u.rerata > 0) return tambahHari(terakhir, Math.ceil(INTERVAL_HM / u.rerata))
  return ''
}

export function statusPada(units = [], log = [], refIso = todayIso()) {
  const riwayat = new Map() // kode → baris service terakhir yang ≤ refIso
  for (const r of log) {
    if (!r.tanggal || !r.kode) continue
    if (r.tanggal > refIso) continue
    const ada = riwayat.get(r.kode)
    if (!ada || r.tanggal > ada.tanggal) riwayat.set(r.kode, r)
  }
  return units.map((u) => {
    const last = riwayat.get(u.kode)
    if (!last) {
      return { ...u, statusAsal: 'belum', warningAsal: null, sisaHariAsal: null, nextAsalIso: '', terakhirAsalIso: '' }
    }
    const nextIso = jadwalBerikut(u, last.tanggal)
    const warning = nextIso ? selisihHari(nextIso, refIso) : null // positif = sudah lewat
    let statusAsal = 'aman'
    if (!nextIso || !(u.rerata > 0)) statusAsal = 'tanpaJadwal'
    else if (warning > 0) statusAsal = 'terlambat'
    else if (warning >= -AMAN_HARI) statusAsal = 'segera'
    return {
      ...u,
      statusAsal,
      warningAsal: warning,
      sisaHariAsal: warning == null ? null : -warning,
      nextAsalIso: nextIso,
      terakhirAsalIso: last.tanggal,
    }
  })
}

const EMBER_DELTA = [
  { id: '<150', label: '< 150', min: 0, max: 150, color: '#0ea5e9' },
  { id: '150-199', label: '150–199', min: 150, max: 200, color: '#0d9488' },
  { id: '200-224', label: '200–224', min: 200, max: TEPAT_MIN, color: '#7dd3fc' },
  { id: '225-275', label: '225–275', min: TEPAT_MIN, max: TEPAT_MAX + 1, color: '#22c55e' },
  { id: '276-349', label: '276–349', min: TEPAT_MAX + 1, max: 350, color: '#fb7185' },
  { id: '350+', label: '≥ 350', min: 350, max: 1e9, color: '#f43f5e' },
]

/** Ketepatan interval HM dari sekumpulan baris service (hmDelta sudah dihitung parseService2). */
export function ketepatanDari(rows = []) {
  const dinilaiLog = rows.filter((r) => !r.hmAnomali && r.hmDelta != null)
  const k = {
    dinilai: dinilaiLog.length,
    tepat: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'tepat').length,
    telat: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'telat').length,
    awal: dinilaiLog.filter((r) => ketepatanHm(r.hmDelta) === 'awal').length,
    dikecualikan: rows.filter((r) => r.hmAnomali).length,
    /* di antaranya karena meter diganti (bisa meter baru atau meter repair) */
    gantiMeter: rows.filter((r) => r.hmGantiMeter).length,
  }
  k.pct = k.dinilai ? Math.round((k.tepat / k.dinilai) * 100) : 0
  k.sebaran = EMBER_DELTA.map((e) => ({
    ...e,
    jumlah: dinilaiLog.filter((r) => r.hmDelta >= e.min && r.hmDelta < e.max).length,
  }))
  k.rata = dinilaiLog.length
    ? Math.round(dinilaiLog.reduce((a, r) => a + r.hmDelta, 0) / dinilaiLog.length)
    : null
  return k
}

/**
 * Ringkasan grafik untuk satu bulan acuan:
 * komposisi status, cakupan per divisi, sebaran urgensi, top 10 terlambat,
 * ketepatan interval, dan baris log bulan itu (untuk peta minggu).
 */
export function ringkasBulan(units = [], log = [], acuanKey, opsi = {}) {
  const refIso = opsi.refIso || refBulan(acuanKey)
  const asof = statusPada(units, log, refIso)
  const n = (id) => asof.filter((u) => u.statusAsal === id).length
  const byStatus = {
    terlambat: n('terlambat'),
    segera: n('segera'),
    aman: n('aman'),
    tanpaJadwal: n('tanpaJadwal'),
    belum: n('belum'),
  }
  const totalUnit = asof.length
  const sudahService = totalUnit - byStatus.belum

  /* cakupan per divisi */
  const posisi = [...new Set(asof.map((u) => u.posisi).filter(Boolean))].sort()
  const perPosisi = posisi.map((p) => {
    const set = asof.filter((u) => u.posisi === p)
    const total = set.length
    const m = (id) => set.filter((u) => u.statusAsal === id).length
    const belum = m('belum')
    const sudah = total - belum
    const pct = (v) => (total ? Math.round((v / total) * 100) : 0)
    return {
      posisi: p,
      total,
      terlambat: m('terlambat'),
      segera: m('segera'),
      aman: m('aman'),
      tanpaJadwal: m('tanpaJadwal'),
      belum,
      sudah,
      belumPct: pct(belum),
      sudahPct: pct(sudah),
      terlambatPct: pct(m('terlambat')),
      beres: m('aman'),
    }
  })

  /* sebaran urgensi + himpunan kode untuk klik-untuk-filter */
  const mapUrgensi = new Map()
  const setsUrgensi = {}
  for (const u of asof) {
    if (u.statusAsal === 'belum' || u.sisaHariAsal == null) continue
    const id = emberUrgensi(u.sisaHariAsal)
    mapUrgensi.set(id, (mapUrgensi.get(id) || 0) + 1)
    ;(setsUrgensi[id] = setsUrgensi[id] || new Set()).add(u.kode)
  }
  const urgensi = URGENSI.map((e) => ({ ...e, jumlah: mapUrgensi.get(e.id) || 0 }))

  const setsStatus = {}
  for (const u of asof) (setsStatus[u.statusAsal] = setsStatus[u.statusAsal] || new Set()).add(u.kode)

  const topTerlambat = asof
    .filter((u) => u.statusAsal === 'terlambat')
    .sort((a, b) => b.warningAsal - a.warningAsal)
    .slice(0, 10)
    .map((u) => ({ kode: u.kode, posisi: u.posisi, jenis: u.jenis, telat: u.warningAsal, jadwal: u.nextAsalIso }))

  /* baris service yang terjadi pada bulan acuan */
  const logBulan = log.filter((r) => keyBulanIso(r.tanggal) === acuanKey)
  const ketepatan = ketepatanDari(logBulan)

  return {
    acuanKey,
    refIso,
    refLabel: labelRef(refIso),
    bulanBerjalan: refIso < akhirBulan(acuanKey),
    totalUnit,
    sudahService,
    belumService: byStatus.belum,
    terlambat: byStatus.terlambat,
    segera: byStatus.segera,
    aman: byStatus.aman,
    tanpaJadwal: byStatus.tanpaJadwal,
    byStatus,
    cakupan: totalUnit ? Math.round((sudahService / totalUnit) * 100) : 0,
    perPosisi,
    urgensi,
    topTerlambat,
    ketepatan,
    logBulan,
    sesiBulan: logBulan.length,
    unitBulan: new Set(logBulan.map((r) => r.kode)).size,
    setsStatus,
    setsUrgensi,
  }
}

/**
 * Ringkasan kualitas data modul service — dipakai untuk badge di header.
 * Mengembalikan daftar masalah {level, kode, pesan, jumlah, contoh[]}.
 */
export function kualitasService(units = [], log = [], meta = {}) {
  const masalah = []
  const kodeUnit = new Set(units.map((u) => u.kode))

  if (meta.duplikat) {
    masalah.push({
      level: 'warn',
      kode: 'baris-ganda',
      jumlah: meta.duplikat,
      pesan: `${meta.duplikat} baris ganda di tb_service1 (dipakai HM terbesar)`,
      contoh: units.filter((u) => u.duplikat).slice(0, 4).map((u) => u.kode),
    })
  }

  if (meta.duplikatLog) {
    masalah.push({
      level: 'warn',
      kode: 'log-ganda',
      jumlah: meta.duplikatLog,
      pesan: `${meta.duplikatLog} baris ganda di tb_service2 (posisi+kode+tanggal+HM sama) — diabaikan agar volume service tidak dobel`,
      /* v1.9.18: dulu contohnya selalu kosong (slice(0,0)) sehingga panel audit
         hanya menampilkan angka tanpa bukti baris mana yang ganda */
      contoh: Array.isArray(log.duplikatKunci) ? log.duplikatKunci : [],
    })
  }

  const tanggalRusak = log.filter((r) => r.tanggalRaw && !r.tanggal)
  if (tanggalRusak.length) {
    masalah.push({
      level: 'error',
      kode: 'tanggal-rusak',
      jumlah: tanggalRusak.length,
      pesan: `${tanggalRusak.length} tanggal di tb_service2 tidak terbaca`,
      contoh: tanggalRusak.slice(0, 4).map((r) => `${r.kode} “${r.tanggalRaw}”`),
    })
  }

  const kodeAsing = [...new Set(log.map((r) => r.kode))].filter((k) => !kodeUnit.has(k))
  if (kodeAsing.length) {
    masalah.push({
      level: 'error',
      kode: 'kode-asing',
      jumlah: kodeAsing.length,
      pesan: `${kodeAsing.length} kode di tb_service2 tidak ada di tb_service1`,
      contoh: kodeAsing.slice(0, 4),
    })
  }

  const tanpaHm = log.filter((r) => r.hm == null)
  if (tanpaHm.length) {
    masalah.push({
      level: 'warn',
      kode: 'tanpa-hm',
      jumlah: tanpaHm.length,
      pesan: `${tanpaHm.length} pencatatan tanpa HM (tidak bisa dinilai intervalnya)`,
      contoh: tanpaHm.slice(0, 4).map((r) => r.kode),
    })
  }

  /* kategori dipisah agar tidak dobel hitung: “ganti meter” memuat semua
     perpindahan meter; “perlu dicek” adalah penanda tambahan (bisa menempel
     pada catatan yang juga perpindahan meter). */
  const gantiMeter = log.filter((r) => r.hmGantiMeter)
  if (gantiMeter.length) {
    masalah.push({
      level: 'info',
      kode: 'hm-ganti-meter',
      jumlah: gantiMeter.length,
      pesan:
        `${gantiMeter.length} pencatatan melanjutkan HM meter lain — meter diganti, bisa meter baru (HM kecil) atau meter hasil repair yang HM-nya meneruskan angka lama (HM besar). Kejadian sah: selisih HM-nya tidak dinilai sebagai interval service.`,
      contoh: gantiMeter.slice(0, 4).map((r) => `${r.kode} ${r.tanggal || r.tanggalRaw || ''} @${new Intl.NumberFormat('id-ID').format(r.hm)}`),
    })
  }

  const janggal = log.filter((r) => r.hmAnomali && !r.hmGantiMeter)
  if (janggal.length) {
    masalah.push({
      level: 'warn',
      kode: 'hm-janggal',
      jumlah: janggal.length,
      pesan:
        `${janggal.length} catatan HM turun karena meter di-reset / meter lain dipasang, atau melonjak > ${BATAS_DELTA_HM} HM dalam satu service — dicek manual, tidak dipakai menilai ketepatan interval`,
      contoh: janggal.slice(0, 4).map((r) => r.kode),
    })
  }

  /* Angka jauh di atas HM khas meter sejenis DAN menyendiri: bisa salah ketik
     digit, bisa juga meter hasil repair — jadi statusnya “perlu dicek”, bukan
     vonis salah. Angka ini tidak dipakai sebagai acuan jadwal sampai dicek. */
  const perluCek = log.filter((r) => r.hmPerluCek)
  if (perluCek.length) {
    masalah.push({
      level: 'warn',
      kode: 'hm-perlu-cek',
      jumlah: perluCek.length,
      pesan:
        `${perluCek.length} catatan HM jauh di atas HM khas meter sejenis (lebih dari ${BATAS_KANONIK_HM}×) dan tidak muncul lagi di catatan lain — bisa salah ketik digit, bisa juga meter hasil repair yang HM-nya meneruskan angka lama. Angkanya tetap dipakai apa adanya; cukup pastikan ke mekanik/sheet agar tidak salah baca.`,
      contoh: perluCek.slice(0, 6).map((r) => `${r.kode} ${r.tanggal || r.tanggalRaw || ''} @${new Intl.NumberFormat('id-ID').format(r.hm)}`),
    })
  }

  /* HM = 0 hampir selalu berarti sel kosong yang terisi angka nol, bukan engine
     baru: unit seperti ini jadi terlihat “baru” dan jadwalnya meleset. */
  const hmNol = log.filter((r) => r.hm === 0)
  if (hmNol.length) {
    masalah.push({
      level: 'warn',
      kode: 'hm-nol',
      jumlah: hmNol.length,
      pesan: `${hmNol.length} pencatatan dengan HM = 0 (kemungkinan sel kosong terisi 0) — periksa HM sebenarnya di sheet`,
      contoh: hmNol.slice(0, 4).map((r) => `${r.kode} ${r.tanggal || r.tanggalRaw || ''}`.trim()),
    })
  }

  /* kolom bantu sheet “Rata-Rata Operating Time Harian” masih banyak kosong.
     Bukan kesalahan web (jadwal dihitung dari laju HM antar catatan), tetapi
     penyebab utama unit berstatus “tanpa jadwal” saat “Next Service” juga kosong. */
  const rerataKosong = log.filter((r) => r.rerata == null)
  if (rerataKosong.length) {
    const unitTanpaJadwal = units.filter((u) => u.status === 'tanpaJadwal').length
    masalah.push({
      level: 'info',
      kode: 'rerata-kosong',
      jumlah: rerataKosong.length,
      pesan:
        `${rerataKosong.length} dari ${log.length} baris tb_service2 belum mengisi “Rata-Rata Operating Time Harian”` +
        (unitTanpaJadwal ? ` — ${unitTanpaJadwal} unit belum punya tanggal service berikutnya karena rerata & “Next Service” sama-sama kosong` : ''),
      /* tunjukkan unit yang benar-benar terdampak (tanpa jadwal), bukan sembarang
         baris tanpa rerata — supaya contohnya bisa langsung dicari di sheet */
      contoh: (unitTanpaJadwal
        ? units.filter((u) => u.status === 'tanpaJadwal').map((u) => u.kode)
        : [...new Set(rerataKosong.map((r) => r.kode))]
      ).slice(0, 4),
    })
  }

  /* ringkasan: temuan error/warn dihitung sebagai temuan yang perlu diperbaiki,
     catatan “info” hanya keterangan supaya angka utama tidak membengkak */
  const totalMasalah = masalah.filter((m) => m.level !== 'info').reduce((a, m) => a + m.jumlah, 0)
  const totalInfo = masalah.filter((m) => m.level === 'info').reduce((a, m) => a + m.jumlah, 0)
  return { masalah, totalMasalah, totalInfo }
}

export const riwayatUnit = (log = [], kode = '') =>
  log.filter((r) => norm(r.kode) === norm(kode))

/* ------------------------------ cache ------------------------------ */

export function readServiceCache() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_SERVICE) || 'null')
    if (!c || !Array.isArray(c.units)) return null
    /* cache dari versi bundel lain dibuang (bentuk data bisa berubah) */
    if (c.v && c.v !== SERVICE_CACHE_V) return null
    return c
  } catch {
    return null
  }
}

function writeServiceCache(data) {
  try {
    localStorage.setItem(LS_SERVICE, JSON.stringify({ ...data, v: SERVICE_CACHE_V }))
  } catch {
    /* kuota penuh: simpan versi tanpa riwayat panjang */
    try {
      localStorage.setItem(LS_SERVICE, JSON.stringify({ ...data, log: (data.log || []).slice(0, 300) }))
    } catch {
      /* abaikan */
    }
  }
}

/**
 * Ambil data service terbaru (tb_service1 + tb_service2) lewat Apps Script.
 * Browser tidak bisa membaca CSV gviz langsung (CORS), jadi endpoint yang membaca
 * kedua sheet sekaligus lalu mengirim header + barisnya.
 */
/* Satu permintaan `svcread` dipakai bersama oleh semua pemanggil yang
   berbarengan (tarikan halaman, halaman Service, tarikSetelahCatat).
   `svcread` belum punya `rev`/ETag sehingga tiap panggilan = ±53 kB; tanpa
   penjaga ini halaman Service memanggilnya 2–3 kali sekaligus (v1.9.23). */
let svcInFlight = null

function bacaSvcRaw() {
  if (svcInFlight) return svcInFlight
  svcInFlight = postApi({ action: 'svcread' }, 45000).finally(() => {
    /* dilepas setelah selesai supaya pengguna berikutnya (mis. tombol Sinkron
       atau tarikSetelahCatat) benar-benar membaca ulang sheet */
    svcInFlight = null
  })
  return svcInFlight
}

export async function fetchServiceData({ master = [] } = {}) {
  if (!getEndpoint()) {
    const err = new Error(
      'Endpoint Apps Script belum diatur. Isi di menu Pengaturan ▸ Koneksi sheet, lalu pastikan Code.gs versi 1.6.0 sudah di-deploy (New version).'
    )
    err.kode = 'TANPA_ENDPOINT'
    throw err
  }
  const json = await bacaSvcRaw()
  const r = json.result || {}
  const tunda = parseTunda(r.tundaHeader || [], r.tundaRows || [])
  const intervalHm = r.intervalHm || INTERVAL_HM
  const { units: evalUnits, duplikat, baris } = parseService1(r.evalHeader || [], r.evalRows || [])
  const log = parseService2(r.logHeader || [], r.logRows || [])
  /* tb_service1 bisa kosong/terpotong → lengkapi dari tb_service2 + master agar
     unit yang punya catatan service tidak hilang dari layar (v1.9.0) */
  const lengkap = lengkapiUnitDariLog(evalUnits, log, { intervalHm, master })
  const data = {
    units: lengkap.units,
    log,
    /* penundaan pengingat (tb_service3) — riwayat lengkap; penyaringan tanggal
       dilakukan di pemakai lewat tundaAktif()/tundaService() */
    tunda,
    duplikat: duplikat || 0,
    duplikatLog: log.duplikat || 0,
    barisLog: (r.logRows || []).length,
    barisEval: baris || evalUnits.length,
    unitEval: evalUnits.length,
    tambahanDariLog: lengkap.dariLog,
    tambahanDariMaster: lengkap.dariMaster,
    /* jumlah unit yang HM-nya dikoreksi karena meter diganti (angka turun) */
    hmReset: lengkap.hmReset || 0,
    /* jumlah unit yang HM acuannya dikoreksi karena angka di tb_service1 mustahil */
    hmDikoreksi: lengkap.hmDikoreksi || 0,
    syncedAt: new Date().toISOString(),
    intervalHm,
  }
  writeServiceCache(data)
  return data
}

/**
 * Catat satu service → Apps Script menambah baris di akhir tb_service2,
 * sheet lalu menghitung ulang tb_service1.
 */
export async function catatService(payload) {
  if (!getEndpoint()) {
    throw new Error('Endpoint Apps Script belum diatur (Pengaturan ▸ Koneksi sheet), jadi service tidak bisa disimpan ke sheet.')
  }
  const json = await postApi(
    {
      action: 'svcrecord',
      payload: {
        posisi: payload.posisi,
        tanggal: payload.tanggal,
        minggu: payload.minggu,
        kode: payload.kode,
        hm: payload.hm,
      },
    },
    45000
  )
  return json.result || {}
}

/** Simpan penundaan pengingat (delay reminder) satu unit → baris baru di
 *  sheet “Delay Reminder Service” (tb_service3). Tidak menyentuh log service. */
export async function tundaServiceUnit({ kode, hari = TUNDA_HARI_BAWAAN, alasan, posisi = '', oleh = '', hariIni = todayIso() } = {}) {
  if (!getEndpoint()) {
    throw new Error('Endpoint Apps Script belum diatur (Pengaturan ▸ Koneksi sheet), jadi penundaan tidak bisa disimpan.')
  }
  const h = Math.max(1, Math.min(TUNDA_MAKS_HARI, Math.round(Number(hari) || TUNDA_HARI_BAWAAN)))
  const sampai = tambahHari(hariIni, h)
  const json = await postApi(
    { action: 'svcdefer', payload: { kode: String(kode || '').trim().toUpperCase(), sampai, hari: h, alasan, posisi, oleh } },
    45000
  )
  if (json && json.ok === false) throw new Error(json.error || 'Gagal menyimpan penundaan.')
  const hasil = json.result || {}
  return { ...hasil, hari: h, sampai: hasil.sampai || sampai }
}

/** Tunggu sampai baris baru muncul di tb_service2 (gviz kadang butuh 1–3 detik). */
export async function tarikSetelahCatat({ kode, hm, tanggal, percobaan = 4 } = {}) {
  let terakhir = null
  for (let i = 0; i < percobaan; i++) {
    try {
      const data = await fetchServiceData()
      terakhir = data
      const ada = (data.log || []).some(
        (r) => norm(r.kode) === norm(kode) && (hm == null || Number(r.hm) === Number(hm)) && (!tanggal || r.tanggal === tanggal)
      )
      if (ada) return { ...data, ditemukan: true }
    } catch (e) {
      terakhir = terakhir || { error: e.message }
    }
    await new Promise((r) => setTimeout(r, 1200))
  }
  return { ...(terakhir || {}), ditemukan: false }
}

export const hariIniIso = todayIso
export const selisihHariIso = selisihHari

/* ================== PETA MINGGU SERVICE (rencana vs realisasi) ==================
   Menjawab: “minggu ke berapa service dijadwalkan, dan berapa yang benar-benar
   dikerjakan?” — total, per divisi (posisi), atau per jenis engine.

   Rencana  : jadwal service tiap unit pada minggu itu (tb_service1 / perkiraan
              interval HM dari service terakhir sebelum minggu tersebut).
   Realisasi: baris tb_service2 yang tanggalnya jatuh pada minggu itu.
   ============================================================================== */

const hariDalamBulan = (acuanKey) => {
  const [y, m] = String(acuanKey).split('-').map(Number)
  return y && m ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 30
}

/** Batas akhir minggu ke-w dalam bulan acuan (dipotong akhir bulan). */
const akhirMinggu = (acuanKey, w) => {
  const dim = hariDalamBulan(acuanKey)
  return `${acuanKey}-${pad(Math.min(dim, w * 7))}`
}

/**
 * @param {Array} units unit service (punya posisi, jenis, rerata, nextIso, terakhirIso)
 * @param {Array} log   baris tb_service2
 * @param {string} acuanKey `YYYY-MM`
 * @param {'total'|'divisi'|'jenis'} kelompok
 */
export function petaMingguService(units = [], log = [], acuanKey = '', kelompok = 'total') {
  const minggu = [1, 2, 3, 4, 5]
  /* service per unit (tanggal terurut) supaya “service terakhir sebelum minggu X” murah dicari */
  const riwayat = new Map()
  for (const r of log) {
    if (!r.tanggal || !r.kode) continue
    if (!riwayat.has(r.kode)) riwayat.set(r.kode, [])
    riwayat.get(r.kode).push(r.tanggal)
  }
  for (const arr of riwayat.values()) arr.sort()

  const terakhirSebelum = (kode, iso) => {
    const arr = riwayat.get(kode)
    if (!arr) return ''
    let hasil = ''
    for (const t of arr) {
      if (t > iso) break
      hasil = t
    }
    return hasil
  }

  const sel = (kode, grup) => ({ kode, grup, rencana: 0, realisasi: 0 })
  const baris = new Map() // grup → { grup, minggu: [{rencana, realisasi}], total }

  const grupDari = (u) => {
    if (kelompok === 'divisi') return u.posisi || 'Tanpa divisi'
    if (kelompok === 'jenis') return u.jenis || String(u.kode).slice(0, 3)
    return 'Total'
  }
  const ambil = (grup) => {
    if (!baris.has(grup)) {
      baris.set(grup, {
        grup,
        sel: minggu.map((w) => ({ w, ...sel(grup, w) })),
        total: { rencana: 0, realisasi: 0 },
      })
    }
    return baris.get(grup)
  }
  /* pastikan baris “Total” selalu ada di mode total */
  if (kelompok === 'total') ambil('Total')

  /* ---- rencana: satu jadwal per unit per minggu ---- */
  for (const u of units) {
    const grup = grupDari(u)
    const b = ambil(grup)
    for (const w of minggu) {
      const ref = akhirMinggu(acuanKey, w)
      const terakhir = terakhirSebelum(u.kode, ref)
      const next = jadwalBerikut(u, terakhir)
      if (!next || next.slice(0, 7) !== acuanKey) continue
      if (mingguKe(next) !== w) continue
      b.sel[w - 1].rencana += 1
      b.total.rencana += 1
    }
  }

  /* ---- realisasi: baris log pada bulan & minggu itu ---- */
  const ukuranUnit = new Map(units.map((u) => [u.kode, grupDari(u)]))
  for (const r of log) {
    if ((r.tanggal || '').slice(0, 7) !== acuanKey) continue
    const w = Number(r.minggu) || mingguKe(r.tanggal)
    if (!w || w < 1 || w > 5) continue
    /* kode yang tidak ada di master tetap dihitung (di grupnya sendiri / Total) */
    const grup = kelompok === 'total' ? 'Total' : ukuranUnit.get(r.kode) || 'Tanpa divisi'
    const b = ambil(grup)
    b.sel[w - 1].realisasi += 1
    b.total.realisasi += 1
  }

  const daftar = [...baris.values()]
  /* urutan: Total dulu, lalu paling sibuk */
  daftar.sort((a, b) => (a.grup === 'Total' ? -1 : b.grup === 'Total' ? 1 : b.total.realisasi + b.total.rencana - (a.total.realisasi + a.total.rencana) || a.grup.localeCompare(b.grup)))

  const jumlah = daftar.reduce(
    (n, b) => ({ rencana: n.rencana + b.total.rencana, realisasi: n.realisasi + b.total.realisasi }),
    { rencana: 0, realisasi: 0 }
  )
  const maks = Math.max(1, ...daftar.flatMap((b) => b.sel.map((c) => Math.max(c.rencana, c.realisasi))))

  return {
    acuanKey,
    kelompok,
    minggu,
    baris: daftar,
    jumlah,
    maks,
    /* rencana yang jatuh di minggu yang sudah lewat tetapi belum dikerjakan */
    rencanaLewat:
      kelompok === 'total'
        ? (() => {
            const ref = refBulan(acuanKey)
            const asof = statusPada(units, log, ref)
            return asof.filter((u) => u.statusAsal === 'terlambat').length
          })()
        : null,
  }
}

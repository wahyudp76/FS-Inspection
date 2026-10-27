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
import { postApi } from './api'
import { tsMs } from './time'

const LS_SERVICE = 'fsi:service-cache'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export const INTERVAL_HM = 250 // jarak service (HM) sesuai rumus sheet: F + 250
export const AMAN_HARI = 7 // ≤ 7 hari lagi = jatuh tempo
export const BATAS_DELTA_HM = 1000 // lonjakan HM per service di atas ini dianggap janggal
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

/** "24 Oktober 2026" / "24/10/2026" / "2026-10-24" → { iso, y, m, d } */
export function parseTanggal(v) {
  if (v == null || v === '') return null
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, y: +m[1], m: +m[2], d: +m[3] }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return { iso: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, y: +m[3], m: +m[2], d: +m[1] }
  /* tanggal ketik manual dengan tahun 2 digit di sheet: "17/09/26" (= 17 Sep 2026).
     Sheet memakai format Indonesia (dd/mm), jadi urutannya hari dulu. */
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/)
  if (m) {
    const yy = +m[3]
    const y = yy >= 70 ? 1900 + yy : 2000 + yy
    return { iso: `${y}-${pad(+m[2])}-${pad(+m[1])}`, y, m: +m[2], d: +m[1] }
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) {
    const idx = BULAN.findIndex((b) => norm(b).startsWith(norm(m[2]).slice(0, 3)))
    if (idx >= 0) return { iso: `${m[3]}-${pad(idx + 1)}-${pad(+m[1])}`, y: +m[3], m: idx + 1, d: +m[1] }
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
    const hm = akhir.hm != null ? akhir.hm : null
    const nextHm = hm != null ? hm + intervalHm : null
    /* tanggal service berikutnya: pakai isian sheet lebih dulu */
    const nextIsoSheet = [...arr].reverse().map((r) => r.nextIso).find(Boolean) || ''
    let nextIso = nextIsoSheet
    if (!nextIso && rerata && rerata > 0 && hm != null) {
      const sisaHari = Math.round((nextHm - hm) / rerata)
      nextIso = tambahHari(akhir.tanggal, sisaHari)
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

  return { units: hasil, tambahan: dariLog + dariMaster, dariLog, dariMaster }
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
  const prevHm = new Map()
  for (const r of asc) {
    const prev = prevHm.get(r.kode)
    r.hmDelta = prev != null && r.hm != null ? r.hm - prev : null
    /* lonjakan HM tidak wajar: > 1.000 HM sekali service (≈ 42 hari nonstop) → tandai */
    r.hmAnomali = r.hmDelta != null && (r.hmDelta > BATAS_DELTA_HM || r.hmDelta < 0)
    if (r.hm != null) prevHm.set(r.kode, r.hm)
  }
  /* urutan tampil: terbaru dulu */
  const urut = log.sort((a, b) => (b.tanggalMs - a.tanggalMs) || (b.no - a.no))
  return urut

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
    { id: '150-199', label: '150–199', min: 150, max: 200, color: '#38bdf8' },
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
  { id: 'servisIni', label: 'Service bulan ini', short: 'Servis', color: '#22c55e', cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/35' },
  { id: 'servisLalu', label: 'Service bulan lalu', short: 'Bulan lalu', color: '#38bdf8', cls: 'text-sky-300 bg-sky-500/12 border-sky-500/35' },
  { id: 'jadwalIni', label: 'Jadwal bulan ini, belum dikerjakan', short: 'Jadwal kini', color: '#f59e0b', cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35' },
  { id: 'jadwalDepan', label: 'Jadwal bulan depan', short: 'Bulan depan', color: '#a78bfa', cls: 'text-violet-300 bg-violet-500/12 border-violet-500/35' },
  { id: 'lain', label: 'Di luar 3 kategori itu', short: 'Lainnya', color: '#64748b', cls: 'text-slate-300 bg-slate-500/12 border-slate-500/35' },
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
    /* kalau baris terakhir di log = baris terakhir di sheet, pakai jadwal resmi sheet */
    let nextIso = ''
    if (last.tanggal === u.terakhirIso) nextIso = u.nextIso
    else if (u.rerata > 0) nextIso = tambahHari(last.tanggal, Math.ceil(INTERVAL_HM / u.rerata))
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
  { id: '150-199', label: '150–199', min: 150, max: 200, color: '#38bdf8' },
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

  const janggal = log.filter((r) => r.hmAnomali)
  if (janggal.length) {
    masalah.push({
      level: 'warn',
      kode: 'hm-janggal',
      jumlah: janggal.length,
      pesan: `${janggal.length} kenaikan HM tidak wajar (> ${BATAS_DELTA_HM} HM sekali service)`,
      contoh: janggal.slice(0, 4).map((r) => r.kode),
    })
  }

  return { masalah, totalMasalah: masalah.reduce((a, m) => a + m.jumlah, 0) }
}

export const riwayatUnit = (log = [], kode = '') =>
  log.filter((r) => norm(r.kode) === norm(kode))

/* ------------------------------ cache ------------------------------ */

export function readServiceCache() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_SERVICE) || 'null')
    if (!c || !Array.isArray(c.units)) return null
    return c
  } catch {
    return null
  }
}

function writeServiceCache(data) {
  try {
    localStorage.setItem(LS_SERVICE, JSON.stringify(data))
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
export async function fetchServiceData({ master = [] } = {}) {
  if (!getEndpoint()) {
    const err = new Error(
      'Endpoint Apps Script belum diatur. Isi di menu Pengaturan ▸ Koneksi sheet, lalu pastikan Code.gs versi 1.6.0 sudah di-deploy (New version).'
    )
    err.kode = 'TANPA_ENDPOINT'
    throw err
  }
  const json = await postApi({ action: 'svcread' }, 45000)
  const r = json.result || {}
  const intervalHm = r.intervalHm || INTERVAL_HM
  const { units: evalUnits, duplikat, baris } = parseService1(r.evalHeader || [], r.evalRows || [])
  const log = parseService2(r.logHeader || [], r.logRows || [])
  /* tb_service1 bisa kosong/terpotong → lengkapi dari tb_service2 + master agar
     unit yang punya catatan service tidak hilang dari layar (v1.9.0) */
  const lengkap = lengkapiUnitDariLog(evalUnits, log, { intervalHm, master })
  const data = {
    units: lengkap.units,
    log,
    duplikat: duplikat || 0,
    barisEval: baris || evalUnits.length,
    unitEval: evalUnits.length,
    tambahanDariLog: lengkap.dariLog,
    tambahanDariMaster: lengkap.dariMaster,
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

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
  const bulanIx = BULAN.map((b, i) => (header.findIndex((h) => norm(h) === norm(b)) >= 0 ? header.findIndex((h) => norm(h) === norm(b)) : 9 + i))

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

  return { units, header }
}

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
        tanggalMs: tsMs(tgl?.iso),
        bulanNum: tgl?.m || numOrNull(r[ix.bulanNum]),
        bulan: tgl ? namaBulan(tgl.m) : String(r[ix.bulan] ?? '').trim(),
        minggu: numOrNull(r[ix.minggu]) || mingguKe(tgl?.iso),
        kode,
        hm,
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

export function ringkasService(units = [], log = []) {
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
    return {
      posisi: p,
      total: set.length,
      terlambat: set.filter((u) => u.status === 'terlambat').length,
      segera: set.filter((u) => u.status === 'segera').length,
      aman: set.filter((u) => u.status === 'aman').length,
      tanpaJadwal: set.filter((u) => u.status === 'tanpaJadwal').length,
      belum: set.filter((u) => u.status === 'belum').length,
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

  /* volume service per bulan (dari tb_service2) */
  const mapBulan = new Map()
  for (const r of log) {
    if (!r.bulanNum) continue
    const key = r.bulanNum
    const cur = mapBulan.get(key) || { bulanNum: key, label: singkatBulan(key), sesi: 0, unit: new Set() }
    cur.sesi += 1
    cur.unit.add(r.kode)
    mapBulan.set(key, cur)
  }
  const perBulan = [...mapBulan.values()]
    .sort((a, b) => a.bulanNum - b.bulanNum)
    .map((b) => ({ label: b.label, bulanNum: b.bulanNum, sesi: b.sesi, unit: b.unit.size }))

  const hmJanggal = log.filter((r) => r.hmAnomali).length

  const hariIni = new Date()
  const bulanIni = hariIni.getMonth() + 1
  const serviceBulanIni = log.filter((r) => r.bulanNum === bulanIni).length

  /* daftar perhatian: urut paling telat dulu */
  const terlambat = units.filter((u) => u.status === 'terlambat').sort((a, b) => b.warning - a.warning)
  const segera = units.filter((u) => u.status === 'segera').sort((a, b) => a.sisaHari - b.sisaHari)
  const belum = units.filter((u) => u.status === 'belum').sort((a, b) => a.kode.localeCompare(b.kode))
  const tanpaJadwal = units
    .filter((u) => u.status === 'tanpaJadwal')
    .sort((a, b) => (b.hm || 0) - (a.hm || 0))
  const aman = units.filter((u) => u.status === 'aman').sort((a, b) => a.sisaHari - b.sisaHari)

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
    totalPencatatan: log.length,
    serviceBulanIni,
    hmJanggal,
    daftar: { terlambat, segera, belum, tanpaJadwal, aman },
    cakupan: units.length ? Math.round((sudahService / units.length) * 100) : 0,
  }
}

/** Riwayat service satu unit (dari tb_service2, terbaru dulu) */
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
export async function fetchServiceData() {
  if (!getEndpoint()) {
    const err = new Error(
      'Endpoint Apps Script belum diatur. Isi di menu Pengaturan ▸ Koneksi sheet, lalu pastikan Code.gs versi 1.6.0 sudah di-deploy (New version).'
    )
    err.kode = 'TANPA_ENDPOINT'
    throw err
  }
  const json = await postApi({ action: 'svcread' }, 45000)
  const r = json.result || {}
  const { units } = parseService1(r.evalHeader || [], r.evalRows || [])
  const log = parseService2(r.logHeader || [], r.logRows || [])
  const data = { units, log, syncedAt: new Date().toISOString(), intervalHm: r.intervalHm || INTERVAL_HM }
  writeServiceCache({ units, log, syncedAt: data.syncedAt })
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

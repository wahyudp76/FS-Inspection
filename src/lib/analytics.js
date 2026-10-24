import { GRADES } from './config'
import { tsMs, recordMs, compareRecordsAsc, dayKeyWIB, daysAgoWIB } from './time'

const SCORE_MAP = Object.fromEntries(GRADES.map((g) => [g.value, g.score]))

export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)

/** Skor 0-100 dari objek komponen {nama: 'A'|'B'|'C'} */
export function scoreOf(components = {}) {
  let a = 0, b = 0, c = 0
  for (const v of Object.values(components)) {
    if (v === 'A') a++
    else if (v === 'B') b++
    else if (v === 'C') c++
  }
  const total = a + b + c
  const score = total ? Math.round(((a * 100 + b * 60 + c * 0) / total) * 10) / 10 : 0
  return { a, b, c, total, score, kondisi: kondisiOf(score) }
}

/**
 * Kondisi unit dari skor komponen.
 * ATURAN KHUSUS: unit dengan Status "Rusak" SELALU dianggap "Kritis",
 * berapa pun skor komponennya.
 */
export const kondisiOf = (score, statusUnit) => {
  if (String(statusUnit || '').trim().toLowerCase() === 'rusak') return 'Kritis'
  return score >= 90 ? 'Baik' : score >= 70 ? 'Perlu Perhatian' : 'Kritis'
}

/** Kondisi sebuah unit aset (memperhitungkan status master) */
export const kondisiUnit = (unit) =>
  kondisiOf(unit?.score ?? 0, unit?.status ?? unit?.statusUnit)

export const GRADE_COLOR = Object.fromEntries(GRADES.map((g) => [g.value, g.color]))

/** Warna bar skor — mengikuti kondisi (bukan skor mentah) agar unit Rusak tidak tampil hijau. */
export const scoreColor = (score, statusUnit) => KONDISI_COLOR[kondisiOf(score, statusUnit)] || '#38bdf8'
export const KONDISI_COLOR = { Baik: '#22c55e', 'Perlu Perhatian': '#f59e0b', Kritis: '#f43f5e' }

/* ------------------------------------------------------------------ */
/*  Analitik master aset (snapshot tb_mesin / tb_irrigator)            */
/* ------------------------------------------------------------------ */

export function fleetSummary(assets = []) {
  const total = assets.length
  const terpasang = assets.filter((a) => a.status === 'Terpasang').length
  const standby = assets.filter((a) => a.status === 'Standby').length
  const rusak = assets.filter((a) => a.status === 'Rusak').length

  let a = 0, b = 0, c = 0, comps = 0
  assets.forEach((u) => {
    Object.values(u.components || {}).forEach((v) => {
      if (v === 'A') a++
      else if (v === 'B') b++
      else if (v === 'C') c++
    })
    comps += Object.keys(u.components || {}).length
  })
  const avgScore = total ? Math.round((assets.reduce((s, x) => s + (x.score || 0), 0) / total) * 10) / 10 : 0
  return { total, terpasang, standby, rusak, a, b, c, comps, avgScore, compliance: pct(a, a + b + c) }
}

/** Ranking komponen paling bermasalah (B + C) */
export function componentIssues(assets = [], limit = 12) {
  const map = new Map()
  assets.forEach((u) => {
    Object.entries(u.components || {}).forEach(([name, v]) => {
      if (!v) return
      const rec = map.get(name) || { name, a: 0, b: 0, c: 0 }
      if (v === 'A') rec.a++
      else if (v === 'B') rec.b++
      else if (v === 'C') rec.c++
      map.set(name, rec)
    })
  })
  return [...map.values()]
    .map((r) => {
      const total = r.a + r.b + r.c
      return { ...r, total, issue: r.b + r.c, issueRate: pct(r.b + r.c, total), health: pct(r.a * 100 + r.b * 60, total * 100) }
    })
    .sort((x, y) => y.issue - x.issue || y.c - x.c)
    .slice(0, limit)
}

export function byWilayah(assets = []) {
  const map = new Map()
  assets.forEach((u) => {
    const k = u.wilayah || 'Tanpa Wilayah'
    const rec = map.get(k) || { wilayah: k, total: 0, terpasang: 0, standby: 0, rusak: 0, scoreSum: 0, kritis: 0 }
    rec.total++
    if (u.status === 'Terpasang') rec.terpasang++
    else if (u.status === 'Standby') rec.standby++
    else if (u.status === 'Rusak') rec.rusak++
    rec.scoreSum += u.score || 0
    if ((u.score || 0) < 70) rec.kritis++
    map.set(k, rec)
  })
  return [...map.values()]
    .map((r) => ({ ...r, avgScore: Math.round((r.scoreSum / r.total) * 10) / 10 }))
    .sort((a, b) => b.total - a.total)
}

export function scoreBuckets(assets = []) {
  const buckets = [
    { label: '90-100', min: 90, max: 101, color: '#22c55e', count: 0 },
    { label: '80-89', min: 80, max: 90, color: '#84cc16', count: 0 },
    { label: '70-79', min: 70, max: 80, color: '#f59e0b', count: 0 },
    { label: '50-69', min: 50, max: 70, color: '#fb923c', count: 0 },
    { label: '<50', min: -1, max: 50, color: '#f43f5e', count: 0 },
  ]
  assets.forEach((a) => {
    const s = a.score || 0
    const b = buckets.find((x) => s >= x.min && s < x.max)
    if (b) b.count++
  })
  return buckets
}

/** Profil kesehatan per grup komponen (untuk radar) */
export function groupProfile(assets = [], groups = []) {
  return groups.map((g) => {
    let a = 0, b = 0, c = 0
    assets.forEach((u) => {
      g.items.forEach((it) => {
        const v = u.components?.[it]
        if (v === 'A') a++
        else if (v === 'B') b++
        else if (v === 'C') c++
      })
    })
    const total = a + b + c
    return { id: g.id, grup: g.label, nilai: total ? Math.round(((a * 100 + b * 60) / total) * 10) / 10 : 0, a, b, c, total }
  })
}

export function unitTypeBreakdown(assets = []) {
  const map = new Map()
  assets.forEach((u) => {
    const k = u.unit || '—'
    map.set(k, (map.get(k) || 0) + 1)
  })
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/* ------------------------------------------------------------------ */
/*  Analitik riwayat inspeksi (sheet Data Inspeksi)                    */
/* ------------------------------------------------------------------ */

/** Kunci hari menurut kalender WIB (Asia/Jakarta) — konsisten untuk data campuran format. */
export const dayKey = (d) => dayKeyWIB(d)

export const monthKey = (d) => (dayKey(d) || '').slice(0, 7)

/** Senin sebagai awal minggu (WIB) */
export function weekKey(d) {
  const ms = tsMs(d)
  if (Number.isNaN(ms)) return ''
  /* geser ke kalender WIB sebelum mengambil komponen tanggal */
  const wib = new Date(ms + 7 * 3600 * 1000)
  const t = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()))
  const day = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - day)
  return `${t.getUTCFullYear()}-W${String(getISOWeek(t)).padStart(2, '0')}`
}
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const fd = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3)
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000))
}

export const periodKey = (record, period = 'bulan') => {
  const d = record.tanggal || record.timestamp
  if (period === 'hari') return dayKey(d)
  if (period === 'minggu') return weekKey(d)
  return monthKey(d)
}

export const PERIOD_LABEL = { hari: 'Harian', minggu: 'Mingguan', bulan: 'Bulanan' }

const fmtShort = (key, period) => {
  if (!key) return '—'
  if (period === 'minggu') {
    const m = key.match(/^(\d{4})-W(\d{2})$/)
    if (m) return `W${Number(m[2])} '${m[1].slice(2)}`
    return key
  }
  if (period === 'bulan') {
    const m = key.match(/^(\d{4})-(\d{2})$/)
    if (m) {
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
      return `${names[Number(m[2]) - 1]} ${m[1].slice(2)}`
    }
    return key
  }
  const d = new Date(key)
  if (Number.isNaN(d.getTime())) return key
  return `${d.getDate()}/${d.getMonth() + 1}`
}
export const periodLabel = fmtShort

export function trendByPeriod(records = [], period = 'bulan') {
  const map = new Map()
  records.forEach((r) => {
    const k = periodKey(r, period)
    if (!k) return
    const rec = map.get(k) || { key: k, label: fmtShort(k, period), inspeksi: 0, a: 0, b: 0, c: 0, skorSum: 0, unit: new Set() }
    rec.inspeksi++
    rec.a += r.a || 0
    rec.b += r.b || 0
    rec.c += r.c || 0
    rec.skorSum += r.skor || 0
    rec.unit.add(`${r.tipe}-${r.kode}`)
    map.set(k, rec)
  })
  return [...map.values()]
    .sort((x, y) => (x.key < y.key ? -1 : 1))
    .map((r) => ({
      key: r.key,
      label: r.label,
      inspeksi: r.inspeksi,
      unit: r.unit.size,
      a: r.a,
      b: r.b,
      c: r.c,
      skor: Math.round((r.skorSum / r.inspeksi) * 10) / 10,
    }))
}

export function topInspectors(records = [], limit = 5) {
  const map = new Map()
  records.forEach((r) => {
    const k = (r.inspector || 'Tanpa Nama').trim() || 'Tanpa Nama'
    const rec = map.get(k) || { name: k, jumlah: 0, c: 0, skorSum: 0 }
    rec.jumlah++
    rec.c += r.c || 0
    rec.skorSum += r.skor || 0
    map.set(k, rec)
  })
  return [...map.values()]
    .map((r) => ({ ...r, avg: Math.round((r.skorSum / r.jumlah) * 10) / 10 }))
    .sort((a, b) => b.jumlah - a.jumlah)
    .slice(0, limit)
}

/**
 * Record terbaru per unit. Perbandingan memakai epoch ms (bukan string) supaya
 * format "2026-03-05 9:14:00" vs "2026-03-05 10:00:00" tidak terbalik.
 */
export function latestByUnit(records = []) {
  const map = new Map()
  records.forEach((r) => {
    const k = `${r.tipe}:${r.kode}`
    const prev = map.get(k)
    if (!prev) { map.set(k, r); return }
    const a = recordMs(r)
    const b = recordMs(prev)
    if (a > b || (a === b && String(r.id || '').localeCompare(String(prev.id || '')) > 0)) map.set(k, r)
  })
  return map
}

/** Urutkan record dari terbaru ke terlama (epoch ms, aman format campuran). */
export const sortByNewest = (records = []) => [...records].sort((a, b) => compareRecordsAsc(b, a))

export function problemComponentsFromHistory(records = [], limit = 10) {
  const map = new Map()
  records.forEach((r) => {
    Object.entries(r.komponen || {}).forEach(([name, v]) => {
      if (v !== 'B' && v !== 'C') return
      const rec = map.get(name) || { name, b: 0, c: 0 }
      if (v === 'B') rec.b++
      else rec.c++
      map.set(name, rec)
    })
  })
  return [...map.values()].sort((x, y) => y.c - x.c || y.b - x.b).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/*  Helper umum                                                        */
/* ------------------------------------------------------------------ */

export const fmtDate = (d) => {
  const ms = tsMs(d)
  if (Number.isNaN(ms)) return '—'
  return new Date(ms).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtDateTime = (d) => {
  const ms = tsMs(d)
  if (Number.isNaN(ms)) return '—'
  return `${fmtDate(d)} · ${new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
}
export const relativeTime = (d) => {
  const ms = tsMs(d)
  if (Number.isNaN(ms)) return '—'
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h} jam lalu`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days} hari lalu`
  return fmtDate(d)
}

export const groupOfComponent = (groups = [], name) =>
  groups.find((g) => g.items.includes(name)) || { id: 'lain', label: 'Lain-lain', items: [name] }

export const cx = (...a) => a.filter(Boolean).join(' ')
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
export const uniq = (arr) => [...new Set(arr)]

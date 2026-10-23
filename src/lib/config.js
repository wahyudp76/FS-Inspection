/**
 * Konfigurasi aplikasi.
 * Endpoint Apps Script bisa diisi lewat:
 *  1. .env  ->  VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/xxx/exec
 *  2. Menu "Pengaturan" di dashboard (tersimpan di localStorage browser)
 */
const LS_ENDPOINT = 'fsi:endpoint'
const LS_AUTO_MASTER = 'fsi:auto-master'
const LS_AUTO_REFRESH = 'fsi:auto-refresh'

/* interval muat ulang data dari sheet di dashboard (default 5 menit) */
export const REFRESH_MS = 5 * 60 * 1000
const LS_CACHE = 'fsi:history-cache'

export const BUILD_ENV_ENDPOINT = import.meta.env.VITE_APPS_SCRIPT_URL || ''

export const getEndpoint = () => {
  try {
    return (localStorage.getItem(LS_ENDPOINT) || BUILD_ENV_ENDPOINT || '').trim()
  } catch {
    return BUILD_ENV_ENDPOINT
  }
}

export const setEndpoint = (url) => {
  try {
    if (url) localStorage.setItem(LS_ENDPOINT, url.trim())
    else localStorage.removeItem(LS_ENDPOINT)
  } catch {
    /* ignore */
  }
}

/* ---- sinkron otomatis ke sheet Mesin & Irrigator setelah inspeksi ----
   Default: AKTIF (bisa dimatikan di Pengaturan) */
export const getAutoSyncMaster = () => {
  try {
    const v = localStorage.getItem(LS_AUTO_MASTER)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}
export const setAutoSyncMaster = (on) => {
  try {
    localStorage.setItem(LS_AUTO_MASTER, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/* ---- muat ulang otomatis data terbaru dari sheet ke dashboard ---- */
export const getAutoRefresh = () => {
  try {
    const v = localStorage.getItem(LS_AUTO_REFRESH)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}
export const setAutoRefresh = (on) => {
  try {
    localStorage.setItem(LS_AUTO_REFRESH, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export const isConfigured = () => /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(getEndpoint())

/* ------- sheet tujuan (hanya untuk ditampilkan di UI) ------- */
export const TARGET_SHEET = {
  name: 'Data Inspeksi',
  spreadsheetId: '1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o',
  url: 'https://docs.google.com/spreadsheets/d/1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o/edit#gid=2034259854',
}

export const SOURCE_SHEET = {
  name: 'Draft Dashboard',
  spreadsheetId: '1WbGTDqC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4',
  url: 'https://docs.google.com/spreadsheets/d/1WbGTDqC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4/edit',
}

/* ------- nilai checklist ------- */
export const GRADES = [
  {
    value: 'A',
    label: 'Baik',
    short: 'A',
    desc: 'Normal / layak operasi',
    color: '#22c55e',
    cls: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/35',
    score: 100,
  },
  {
    value: 'B',
    label: 'Perlu Perhatian',
    short: 'B',
    desc: 'Ada gejala, perlu pemantauan/perbaikan ringan',
    color: '#f59e0b',
    cls: 'text-amber-300 bg-amber-500/12 border-amber-500/35',
    score: 60,
  },
  {
    value: 'C',
    label: 'Rusak',
    short: 'C',
    desc: 'Tidak berfungsi / harus diperbaiki',
    color: '#f43f5e',
    cls: 'text-rose-300 bg-rose-500/12 border-rose-500/35',
    score: 0,
  },
]

export const gradeMeta = (v) => GRADES.find((g) => g.value === v)

export const kondisiMeta = (kondisi) =>
  ({
    Baik: { color: '#22c55e', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
    'Perlu Perhatian': { color: '#f59e0b', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
    Kritis: { color: '#f43f5e', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  }[kondisi] || { color: '#64748b', cls: 'text-slate-300 bg-white/5 border-white/10' })

export const statusUnitMeta = (s) =>
  ({
    Terpasang: { color: '#38bdf8', cls: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
    Standby: { color: '#a78bfa', cls: 'text-violet-300 bg-violet-500/10 border-violet-500/30' },
    Rusak: { color: '#f43f5e', cls: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  }[s] || { color: '#64748b', cls: 'text-slate-300 bg-white/5 border-white/10' })

export { LS_CACHE }

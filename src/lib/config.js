/**
 * Konfigurasi aplikasi.
 * Endpoint Apps Script bisa diisi lewat:
 *  1. .env  ->  VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/xxx/exec
 *  2. Menu "Pengaturan" di dashboard (tersimpan di localStorage browser)
 */
/* ---- akses localStorage yang TIDAK pernah melempar ----
   Mode privat / cookie diblokir / kuota penuh membuat getItem & setItem
   melempar SecurityError/QuotaExceededError. Satu panggilan tanpa penjaga
   cukup untuk mematikan seluruh halaman (React gagal render). */
export const bacaLS = (kunci, bawaan = '') => {
  try {
    const v = localStorage.getItem(kunci)
    return v == null ? bawaan : v
  } catch {
    return bawaan
  }
}

export const tulisLS = (kunci, nilai) => {
  try {
    if (nilai == null) localStorage.removeItem(kunci)
    else localStorage.setItem(kunci, String(nilai))
    return true
  } catch {
    return false
  }
}

const LS_ENDPOINT = 'fsi:endpoint'
const LS_AUTO_MASTER = 'fsi:auto-master'
const LS_AUTO_REFRESH = 'fsi:auto-refresh'

/* interval muat ulang data dari sheet di dashboard (default 5 menit) */
export const REFRESH_MS = 5 * 60 * 1000
const LS_CACHE = 'fsi:history-cache'

/* `import.meta.env` tidak ada saat modul diuji di Node (tools/*.mjs) — jaga
   supaya berkas ini bisa diimpor tanpa bundler. */
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {}
export const BUILD_ENV_ENDPOINT = ENV.VITE_APPS_SCRIPT_URL || ''

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

/* ------- sheet data SERVICE ENGINE (Update ZPAS637) -------
   tb_service1 = "Data Service Engine"  → evaluasi & jadwal (hasil rumus sheet)
   tb_service2 = "Monitor Kasie FS"     → tempat pencatatan service dari web  */
export const SERVICE_SHEET = {
  spreadsheetId: '1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o',
  evalSheet: 'Data Service Engine',
  logSheet: 'Monitor Kasie FS',
  evalTable: 'tb_service1',
  logTable: 'tb_service2',
  url: 'https://docs.google.com/spreadsheets/d/1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o/edit#gid=2096329957',
}

/* status evaluasi service engine */
export const SERVICE_STATUS = [
  { id: 'terlambat', label: 'Lewat jadwal', short: 'Lewat', color: '#f43f5e', cls: 'text-rose-600 bg-rose-500/12 border-rose-500/35', desc: 'Sudah melewati warning date' },
  { id: 'segera', label: 'Jatuh tempo', short: 'Tempo', color: '#f59e0b', cls: 'text-amber-700 bg-amber-500/12 border-amber-500/35', desc: 'Jatuh tempo ≤ 7 hari' },
  { id: 'aman', label: 'Aman', short: 'Aman', color: '#22c55e', cls: 'text-emerald-700 bg-emerald-500/12 border-emerald-500/35', desc: 'Masih ada waktu service' },
  { id: 'tanpaJadwal', label: 'Data HM kurang', short: 'HM?', color: '#7c3aed', cls: 'text-violet-700 bg-violet-500/12 border-violet-500/35', desc: 'Sudah service, tapi rerata HM/hari kosong' },
  { id: 'belum', label: 'Belum pernah service', short: 'Belum', color: '#64748b', cls: 'text-slate-700 bg-slate-500/12 border-slate-500/35', desc: 'Belum ada catatan di tb_service2' },
]
export const serviceStatusMeta = (id) => SERVICE_STATUS.find((s) => s.id === id) || SERVICE_STATUS[4]

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
    cls: 'text-emerald-700 bg-emerald-500/12 border-emerald-500/35',
    score: 100,
  },
  {
    value: 'B',
    label: 'Perlu Perhatian',
    short: 'B',
    desc: 'Ada gejala, perlu pemantauan/perbaikan ringan',
    color: '#f59e0b',
    cls: 'text-amber-700 bg-amber-500/12 border-amber-500/35',
    score: 60,
  },
  {
    value: 'C',
    label: 'Rusak',
    short: 'C',
    desc: 'Tidak berfungsi / harus diperbaiki',
    color: '#f43f5e',
    cls: 'text-rose-600 bg-rose-500/12 border-rose-500/35',
    score: 0,
  },
]

export const gradeMeta = (v) => GRADES.find((g) => g.value === v)

export const kondisiMeta = (kondisi) =>
  ({
    Baik: { color: '#22c55e', cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
    'Perlu Perhatian': { color: '#f59e0b', cls: 'text-amber-700 bg-amber-500/10 border-amber-500/30' },
    Kritis: { color: '#f43f5e', cls: 'text-rose-600 bg-rose-500/10 border-rose-500/30' },
  }[kondisi] || { color: '#64748b', cls: 'text-slate-700 bg-slate-900/5 border-slate-900/10' })

export const statusUnitMeta = (s) =>
  ({
    Terpasang: { color: '#0d9488', cls: 'text-teal-700 bg-teal-600/10 border-teal-600/30' },
    Standby: { color: '#7c3aed', cls: 'text-violet-700 bg-violet-500/10 border-violet-500/30' },
    Rusak: { color: '#f43f5e', cls: 'text-rose-600 bg-rose-500/10 border-rose-500/30' },
  }[s] || { color: '#64748b', cls: 'text-slate-700 bg-slate-900/5 border-slate-900/10' })

export { LS_CACHE }

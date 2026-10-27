import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
/**
 * Mock Google Apps Script untuk menguji apps-script/Code.gs tanpa deployment.
 * Menyediakan SpreadsheetApp, Utilities, LockService, DriveApp, CacheService
 * dengan grid in-memory yang dimuat dari ../data/di.csv (data asli 275 baris).
 *
 * Jalankan: node tools/mock-test.mjs
 */
import fs from 'node:fs'
import vm from 'node:vm'

const DATA = process.env.DI_CSV || (process.env.DI_CSV || R('../data/di.csv'))

export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

/* ---------- evaluator rumus mini (meniru Google Sheets + lokal) ----------
   Sheet ber-lokal Indonesia memakai koma sebagai DESIMAL, sehingga pemisah
   argumen rumus harus titik koma. Rumus yang memakai pemisah salah harus
   menghasilkan #ERROR! seperti di Sheets asli. */
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const BULAN_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const LOKAL_TITIK_KOMA = /^(id|de|fr|es|it|pt|nl|ru|tr|pl|sv|da|nb|fi|cs|hu|ro|sk|uk|bg|hr|sl|lt|lv|et|el)/

const pemisahLokal = (locale) => (LOKAL_TITIK_KOMA.test(String(locale || '').toLowerCase()) ? ';' : ',')

function evalRumus(raw, sheet, locale) {
  const sep = pemisahLokal(locale)
  const lain = sep === ';' ? ',' : ';'
  const tanpaTeks = raw.replace(/"[^"]*"/g, '""')
  if (tanpaTeks.includes(lain)) return '#ERROR!' /* pemisah argumen salah */
  const sel = (ref) => {
    const m = String(ref).match(/^([A-Z]+)(\d+)$/)
    if (!m) return ''
    let col = 0
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
    return sheet.cell(Number(m[2]), col)
  }
  const keTanggal = (v) => {
    if (v instanceof Date) return v
    const s = String(v || '').trim()
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
    return null
  }
  const badan = raw.slice(1).trim()

  let m = badan.match(/^MONTH\((.+)\)$/i)
  if (m) {
    const d = keTanggal(sel(m[1].trim()))
    return d ? d.getUTCMonth() + 1 : '#VALUE!'
  }
  m = badan.match(/^DAY\((.+)\)$/i)
  if (m) {
    const d = keTanggal(sel(m[1].trim()))
    return d ? d.getUTCDate() : '#VALUE!'
  }
  m = badan.match(/^ROUNDUP\((.+)\)$/i)
  if (m) {
    const bagian = m[1].split(sep)
    const hari = keTanggal(sel(bagian[0].replace(/^DAY\(|\).*$/g, '').trim()))
    if (!hari) return '#VALUE!'
    const angka = hari.getUTCDate() / 7
    const digit = bagian[1] != null ? Number(bagian[1]) : 0
    const f = Math.pow(10, digit)
    return Math.ceil(angka * f) / f
  }
  m = badan.match(/^TEXT\((.+)\)$/i)
  if (m) {
    const bagian = m[1].split(sep)
    const pola = String(bagian[1] || '').replace(/"/g, '')
    const sumber = bagian[0].trim()
    let serial
    const kali = sumber.match(/^([A-Z]+\d+)\s*\*\s*(\d+)$/)
    if (kali) serial = Number(sel(kali[1])) * Number(kali[2])
    else serial = Number(sel(sumber))
    if (!Number.isFinite(serial)) return '#VALUE!'
    const dasar = Date.UTC(1899, 11, 30) + serial * 86400000
    const bulan = new Date(dasar).getUTCMonth()
    if (/m/i.test(pola)) return (pemisahLokal(locale) === ';' ? BULAN_ID : BULAN_EN)[bulan]
    return String(serial)
  }
  return '#NAME?'
}

class Range {
  constructor(sheet, row, col, nRows = 1, nCols = 1) {
    Object.assign(this, { sheet, row, col, nRows, nCols })
  }
  getValues() {
    const out = []
    for (let r = 0; r < this.nRows; r++) {
      const line = []
      for (let c = 0; c < this.nCols; c++) line.push(this.sheet.cell(this.row + r, this.col + c))
      out.push(line)
    }
    return out
  }
  getValue() { return this.sheet.cell(this.row, this.col) }
  getRow() { return this.row }
  getColumn() { return this.col }
  getNumRows() { return this.nRows }
  getNumColumns() { return this.nCols }
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)))
    return this
  }
  setValue(v) { this.sheet.setCell(this.row, this.col, v); return this }
  setBackground(warna) {
    if (warna === undefined) return this
    for (let r = 0; r < this.nRows; r++) for (let c = 0; c < this.nCols; c++) this.sheet.setCellBackground(this.row + r, this.col + c, warna)
    return this
  }
  setFontColor() { return this }
  setFontWeight() { return this }
  setNumberFormat() { return this }
  setFontSize() { return this }
}

class Sheet {
  constructor(name, grid = [], locale = 'id_ID') {
    this.name = name
    this.grid = grid.map((r) => [...r])
    this.locale = locale
    this.parent = null
  }
  getName() { return this.name }
  getParent() { return this.parent }
  cell(r, c) {
    const line = this.grid[r - 1]
    const v = line && line[c - 1] !== undefined ? line[c - 1] : ''
    /* sel berisi rumus → kembalikan hasil hitung (atau #ERROR! bila pemisah salah) */
    if (typeof v === 'string' && v.charAt(0) === '=') return evalRumus(v, this, this.locale)
    return v
  }
  /* nilai mentah (rumus apa adanya) — dipakai uji untuk memeriksa pemisah */
  formula(r, c) {
    const line = this.grid[r - 1]
    return line && line[c - 1] !== undefined ? line[c - 1] : ''
  }
  setCell(r, c, v) {
    while (this.grid.length < r) this.grid.push([])
    const line = this.grid[r - 1]
    while (line.length < c) line.push('')
    line[c - 1] = v
  }
  getLastRow() {
    for (let r = this.grid.length; r >= 1; r--) {
      if (this.grid[r - 1].some((v) => v !== '' && v !== undefined && v !== null)) return r
    }
    return 0
  }
  getLastColumn() {
    let max = 0
    this.grid.forEach((line) => {
      for (let c = line.length; c >= 1; c--) {
        if (line[c - 1] !== '' && line[c - 1] !== undefined) { max = Math.max(max, c); break }
      }
    })
    return max
  }
  getMaxColumns() { return Math.max(92, ...this.grid.map((l) => l.length), 26) }
  insertColumnsAfter() { return this }
  setFrozenRows() { return this }
  getRange(row, col, nRows = 1, nCols = 1) { return new Range(this, row, col, nRows, nCols) }
  /* ---- format bersyarat (dipakai Code.gs 1.9.1 untuk warna kolom KONDISI) ---- */
  getConditionalFormatRules() { return (this.cfRules || []).slice() }
  setConditionalFormatRules(rules) { this.cfRules = (rules || []).slice(); return this }
  /* warna efektif sebuah sel: aturan CF PERTAMA yang cocok menang (perilaku Sheets) */
  effective(row, col) {
    const teks = String(this.cell(row, col) == null ? '' : this.cell(row, col)).trim()
    for (const r of this.cfRules || []) {
      const crit = r.cond
      const cocok =
        crit.kriteria === 'TEXT_EQ'
          ? String(crit.nilai) === teks
          : crit.kriteria === 'TEXT_CONTAINS'
          ? teks.toLowerCase().includes(String(crit.nilai).toLowerCase())
          : false
      const kena = (r.ranges || []).some(
        (rg) => col >= rg.getColumn() && col < rg.getColumn() + rg.getNumColumns() && row >= rg.getRow() && row < rg.getRow() + rg.getNumRows()
      )
      if (cocok && kena) return { background: r.bg, fontColor: r.fg, dari: 'cf' }
    }
    const b = this.bg && this.bg[row - 1] ? this.bg[row - 1][col - 1] : null
    return { background: b || null, fontColor: null, dari: b ? 'sel' : 'none' }
  }
  setCellBackground(r, c, warna) {
    this.bg = this.bg || []
    while (this.bg.length < r) this.bg.push([])
    const line = this.bg[r - 1]
    while (line.length < c) line.push(null)
    line[c - 1] = warna
  }
  appendRow(vals) {
    const r = this.getLastRow() + 1
    vals.forEach((v, i) => this.setCell(r, i + 1, v))
  }
  deleteRow(n) {
    this.grid.splice(n - 1, 1)
    return this
  }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()) }
}

class SheetStub {
  constructor() { this.deletes = 0 }
}

export function makeEnv({ extraSheets = {}, locale = process.env.SHEET_LOCALE || 'id_ID' } = {}) {
  const rows = parseCSV(fs.readFileSync(DATA, 'utf8')).filter((r) => r.some((v) => v !== ''))
  const main = new Sheet('Data Inspeksi', rows, locale)
  const sheets = { 'Data Inspeksi': main, ...extraSheets }
  const daftarSheet = () => sheets
  const state = { modified: Date.now(), writes: 0 }

  const ss = {
    getId: () => 'FAKE-SS-' + locale,
    getSpreadsheetLocale: () => locale,
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = new Sheet(n, [], locale); sheets[n].parent = ss; return sheets[n] },
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
    toast: () => {},
  }

  const pad = (n) => String(n).padStart(2, '0')
  const Utilities = {
    formatDate(date, tz, pattern) {
      /* semua data proyek ini WIB (UTC+7) */
      const d = new Date(new Date(date).getTime() + 7 * 3600 * 1000)
      const map = {
        yyyy: d.getUTCFullYear(),
        MM: pad(d.getUTCMonth() + 1),
        dd: pad(d.getUTCDate()),
        HH: pad(d.getUTCHours()),
        mm: pad(d.getUTCMinutes()),
        ss: pad(d.getUTCSeconds()),
      }
      return pattern
        .replace(/'([^']*)'/g, (_, lit) => `\u0000${lit}\u0001`)
        .replace(/yyyy|MM|dd|HH|mm|ss/g, (t) => map[t])
        .replace(/\u0000([^\u0001]*)\u0001/g, '$1')
    },
    getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    sleep: () => {},
  }

  const cache = new Map()
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, v),
      remove: (k) => cache.delete(k),
    }),
    getUserCache: () => CacheService.getScriptCache(),
    getDocumentCache: () => CacheService.getScriptCache(),
  }

  const LockService = { getScriptLock: () => ({ waitLock: () => true, releaseLock: () => {} }) }
  const DriveApp = {
    getFileById: () => ({ getLastUpdated: () => new Date(state.modified) }),
  }
  const Logger = { log: () => {} }
  const PropertiesService = {
    getScriptProperties: () => {
      const m = new Map()
      return { getProperty: (k) => (m.has(k) ? m.get(k) : null), setProperty: (k, v) => m.set(k, v), deleteProperty: (k) => m.delete(k) }
    },
  }
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (txt) => ({ text: txt, setMimeType() { return this } }),
  }
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    openById: () => ss,
    flush: () => {},
    newConditionalFormatRule() {
      const r = { ranges: [], cond: { kriteria: '', nilai: '' }, bg: null, fg: null }
      const api = {
        whenTextEqualTo(v) { r.cond = { kriteria: 'TEXT_EQ', nilai: String(v) }; return api },
        whenTextContains(v) { r.cond = { kriteria: 'TEXT_CONTAINS', nilai: String(v) }; return api },
        setBackground(v) { r.bg = v; return api },
        setFontColor(v) { r.fg = v; return api },
        setRanges(v) { r.ranges = v || []; return api },
        build() {
          return {
            ranges: r.ranges,
            cond: r.cond,
            bg: r.bg,
            fg: r.fg,
            getRanges: () => r.ranges,
            getBooleanCondition: () => ({
              getCriteriaType: () => r.cond.kriteria,
              getCriteriaValues: () => [{ getValue: () => r.cond.nilai }, r.cond.nilai],
            }),
          }
        },
      }
      return api
    },
  }

  const sandbox = {
    SpreadsheetApp, Utilities, CacheService, LockService, DriveApp, Logger,
    PropertiesService, ContentService, console,
    Date, Math, JSON, String, Number, Object, Array, isNaN, parseInt, parseFloat,
  }
  sandbox.globalThis = sandbox
  main.parent = ss
  Object.values(extraSheets).forEach((sh) => { if (sh && typeof sh === 'object') sh.parent = ss })
  main.locale = locale
  Object.values(extraSheets).forEach((sh) => { if (sh && typeof sh === 'object' && !sh.locale) sh.locale = locale })
  return { sandbox, sheet: main, ss, state, sheets, locale, daftarSheet }
}

export function loadCode(env) {
  const code = fs.readFileSync(R('../apps-script/Code.gs'), 'utf8')
  const ctx = vm.createContext(env.sandbox)
  vm.runInContext(code, ctx, { filename: 'Code.gs' })
  return ctx
}

/** Panggil doPost seperti klien web (POST text/plain berisi JSON). */
export function post(ctx, body) {
  const e = { postData: { contents: JSON.stringify(body) }, parameter: {} }
  const out = ctx.doPost(e)
  return JSON.parse(out.text)
}

export function rowCount(sheet) {
  return Math.max(0, sheet.getLastRow() - 1)
}

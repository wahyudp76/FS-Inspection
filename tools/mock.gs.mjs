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
  setValues(vals) {
    vals.forEach((line, r) => line.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)))
    return this
  }
  setValue(v) { this.sheet.setCell(this.row, this.col, v); return this }
  setBackground() { return this }
  setFontColor() { return this }
  setFontWeight() { return this }
  setNumberFormat() { return this }
  setFontSize() { return this }
}

class Sheet {
  constructor(name, grid = []) {
    this.name = name
    this.grid = grid.map((r) => [...r])
  }
  getName() { return this.name }
  cell(r, c) {
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
  appendRow(vals) {
    const r = this.getLastRow() + 1
    vals.forEach((v, i) => this.setCell(r, i + 1, v))
  }
  getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()) }
}

class SheetStub {
  constructor() { this.deletes = 0 }
}

export function makeEnv({ extraSheets = {} } = {}) {
  const rows = parseCSV(fs.readFileSync(DATA, 'utf8')).filter((r) => r.some((v) => v !== ''))
  const main = new Sheet('Data Inspeksi', rows)
  const sheets = { 'Data Inspeksi': main, ...extraSheets }
  const state = { modified: Date.now(), writes: 0 }

  const ss = {
    getId: () => 'FAKE-SS-ID',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = new Sheet(n, []); return sheets[n] },
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
  }

  const sandbox = {
    SpreadsheetApp, Utilities, CacheService, LockService, DriveApp, Logger,
    PropertiesService, ContentService, console,
    Date, Math, JSON, String, Number, Object, Array, isNaN, parseInt, parseFloat,
  }
  sandbox.globalThis = sandbox
  return { sandbox, sheet: main, ss, state, sheets }
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

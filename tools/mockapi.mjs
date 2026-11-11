import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
/* Server tiruan Apps Script Web App untuk uji end-to-end di browser. */
import http from 'node:http'
import { makeEnv, loadCode, post, rowCount, parseCSV } from './mock.gs.mjs'

const env = makeEnv()
const ctx = loadCode(env)

/* Dengan MASTER=1, sheet "Mesin" & "Irrigator" ikut disediakan dari CSV asli
   supaya aksi audit / repair bisa diuji end-to-end di browser. */
if (process.env.MASTER === '1') {
  const fs = await import('node:fs')
  const DATA_DIR = process.env.DATA_DIR || path.join(HERE, '..', 'data')
  /* MASTER_DIR: sumber CSV master saja (mis. salinan dengan SPC0224 sudah
     diperbaiki) sementara data inspeksi tetap dari DATA_DIR. */
  const MASTER_DIR = process.env.MASTER_DIR || DATA_DIR
  const muat = (sheet, file, dir) => {
    const rows = parseCSV(fs.readFileSync(path.join(dir || MASTER_DIR, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
    sheet.grid = rows.map((r) => [...r])
    return sheet
  }
  const mesin = muat(env.ss.insertSheet('Mesin'), 'mesin.csv')
  const irrigator = muat(env.ss.insertSheet('Irrigator'), 'irrigator.csv')

  /* sheet service (tb_service2 & tb_service1) untuk menguji aksi svcrecord/svcrepair */
  const SVC_DIR = process.env.SVC_DIR || path.join(HERE, '..', 'data2')
  const muatSvc = (nama, file) => {
    const p = path.join(SVC_DIR, file)
    if (!fs.existsSync(p)) return null
    const rows = parseCSV(fs.readFileSync(p, 'utf8')).filter((r) => r.some((v) => v !== ''))
    const sh = env.ss.insertSheet(nama)
    sh.grid = rows.map((r) => [...r])
    return sh
  }
  muatSvc('Monitor Kasie FS', 'Monitor_Kasie_FS.csv')
  muatSvc('Data Service Engine', 'Data_Service_Engine.csv')
  /* muat ulang seluruh sheet dari CSV — dipakai hook /__reset supaya uji yang
     mengubah sel tidak mewariskan mutasinya ke uji berikutnya */
  ctx.__muatUlangData = () => {
    muat(ctx.__mesinSheet, 'mesin.csv')
    muat(ctx.__irrigatorSheet, 'irrigator.csv')
    const svc1 = env.ss.getSheetByName('Monitor Kasie FS')
    const svc2 = env.ss.getSheetByName('Data Service Engine')
    if (svc1) { svc1.grid = parseCSV(fs.readFileSync(path.join(SVC_DIR, 'Monitor_Kasie_FS.csv'), 'utf8')).filter((r) => r.some((v) => v !== '')) }
    if (svc2) { svc2.grid = parseCSV(fs.readFileSync(path.join(SVC_DIR, 'Data_Service_Engine.csv'), 'utf8')).filter((r) => r.some((v) => v !== '')) }
    const tkr = env.ss.getSheetByName('Riwayat Tukar')
    if (tkr) tkr.grid = []
    return { sheet: ['Mesin', 'Irrigator', 'Monitor Kasie FS', 'Data Service Engine', 'Riwayat Tukar'] }
  }
  ctx.__mesinSheet = mesin
  ctx.__irrigatorSheet = irrigator
  ctx.SpreadsheetApp.openById = () => ({
    getSheetByName: (n) => (n === 'Mesin' ? mesin : n === 'Irrigator' ? irrigator : env.ss.getSheetByName(n)),
    /* sheet baru (mis. "Riwayat Tukar" untuk fitur tukar unit) dibuat di spreadsheet
       yang sama, sama seperti SpreadsheetApp asli */
    insertSheet: (n) => env.ss.insertSheet(n),
    getSpreadsheetTimeZone: () => 'Asia/Jakarta',
  })
}
let submitCount = 0

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  /* Hook uji (hanya bila TESTHOOK=1): meniru pengguna menyunting sel sheet dari
     Google Sheets — yaitu perubahan yang TIDAK lewat aplikasi.
     GET /__set?sheet=Mesin&kode=SPC0224&col=Status&val=Rusak */
  /* GET /__get?sheet=Mesin&kode=SPC0224&col=KONDISI → baca satu sel (untuk uji) */
  if (process.env.TESTHOOK === '1' && req.method === 'GET' && req.url.startsWith('/__get')) {
    const u = new URL(req.url, 'http://x')
    const sheet = env.ss.getSheetByName(u.searchParams.get('sheet'))
    const kode = (u.searchParams.get('kode') || '').trim().toUpperCase()
    const col = u.searchParams.get('col') || 'Status'
    let hasil = { ok: false, error: 'sheet/kode tidak ditemukan' }
    if (sheet && kode) {
      const head = sheet.grid[0].map((x) => String(x).trim())
      const c = head.indexOf(col)
      const r = sheet.grid.findIndex((row, i) => i > 0 && String(row[1] || '').trim().toUpperCase() === kode)
      if (c >= 0 && r > 0) hasil = { ok: true, sheet: u.searchParams.get('sheet'), kode, col, val: sheet.grid[r][c] }
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(hasil))
  }
  /* GET /__reset → muat ulang sheet dari CSV (dipakai uji yang MENGUBAH sel,
     mis. livedata/mastertest, agar uji berikutnya tidak melihat sisa mutasi).
     Sebelumnya sisa mutasi SPC0224 membuat dataquality melaporkan
     Terpasang 119 / Rusak 5 padahal sheet aslinya 120 / 4. */
  if (process.env.TESTHOOK === '1' && req.method === 'GET' && req.url.startsWith('/__reset')) {
    const ulang = ctx.__muatUlangData ? ctx.__muatUlangData() : { ok: false, error: 'hook tidak tersedia' }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, ...ulang }))
  }
  if (process.env.TESTHOOK === '1' && req.method === 'GET' && req.url.startsWith('/__set')) {
    const u = new URL(req.url, 'http://x')
    const sheet = env.ss.getSheetByName(u.searchParams.get('sheet'))
    const kode = (u.searchParams.get('kode') || '').trim().toUpperCase()
    const col = u.searchParams.get('col') || 'Status'
    const val = u.searchParams.get('val') ?? ''
    let hasil = { ok: false, error: 'sheet/kode tidak ditemukan' }
    if (sheet && kode) {
      const head = sheet.grid[0].map((x) => String(x).trim())
      const c = head.indexOf(col) + 1
      const r = sheet.grid.findIndex((row, i) => i > 0 && String(row[1] || '').trim().toUpperCase() === kode)
      if (c > 0 && r > 0) {
        sheet.grid[r][c - 1] = val
        hasil = { ok: true, sheet: u.searchParams.get('sheet'), kode, col, val, baris: r + 1 }
      }
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(hasil))
  }
  /* GET /__cell?sheet=Data Inspeksi&row=2&col=Skor&val=xx → tulis satu sel
     berdasarkan NOMOR BARIS (sheet “Data Inspeksi” punya kolom A=ID, bukan kode,
     jadi hook berbasis kode di atas tidak bisa dipakai). Dipakai uji untuk
     meniru sel yang dirusak manual di Google Sheets. */
  if (process.env.TESTHOOK === '1' && req.method === 'GET' && req.url.startsWith('/__cell')) {
    const u = new URL(req.url, 'http://x')
    const sheet = env.ss.getSheetByName(u.searchParams.get('sheet'))
    const baris = Number(u.searchParams.get('row') || 0)
    const col = u.searchParams.get('col') || ''
    const val = u.searchParams.get('val') ?? ''
    let hasil = { ok: false, error: 'sheet/kolom/baris tidak ditemukan' }
    if (sheet) {
      const head = sheet.grid[0].map((x) => String(x).trim())
      const c = head.indexOf(col)
      if (c >= 0 && baris >= 2 && baris <= sheet.grid.length) {
        hasil = { ok: true, sheet: u.searchParams.get('sheet'), baris, col, sebelum: sheet.grid[baris - 1][c], val }
        sheet.grid[baris - 1][c] = val
      }
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(hasil))
  }
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    let json = {}
    try { json = JSON.parse(body || '{}') } catch {}
    const t0 = Date.now()
    if (json.action === 'submit') { submitCount++; env.state.modified += 5000 }
    let payload
    try { payload = post(ctx, json) } catch (e) { payload = { ok: false, error: String(e) } }
    const out = JSON.stringify(payload)
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'X-Rows': String(rowCount(env.sheet)), 'X-Handler-Ms': String(Date.now() - t0) })
    res.end(out)
  })
})
const PORT = Number(process.env.PORT || 8111)
server.listen(PORT, '0.0.0.0', () => console.log(`mock Apps Script di :${PORT}, baris=${rowCount(env.sheet)}`))

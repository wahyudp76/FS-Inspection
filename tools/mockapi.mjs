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
  const DATA_DIR = process.env.DATA_DIR || '/home/user/data'
  /* MASTER_DIR: sumber CSV master saja (mis. salinan dengan SPC0224 sudah
     diperbaiki) sementara data inspeksi tetap dari DATA_DIR. */
  const MASTER_DIR = process.env.MASTER_DIR || DATA_DIR
  const muat = (sheet, file) => {
    const rows = parseCSV(fs.readFileSync(path.join(MASTER_DIR, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
    rows.forEach((line, r) => line.forEach((v, c) => sheet.setCell(r + 1, c + 1, v)))
    return sheet
  }
  const mesin = muat(env.ss.insertSheet('Mesin'), 'mesin.csv')
  const irrigator = muat(env.ss.insertSheet('Irrigator'), 'irrigator.csv')

  /* sheet service (tb_service2 & tb_service1) untuk menguji aksi svcrecord/svcrepair */
  const SVC_DIR = process.env.SVC_DIR || '/home/user/data2'
  const muatSvc = (nama, file) => {
    const p = path.join(SVC_DIR, file)
    if (!fs.existsSync(p)) return null
    const rows = parseCSV(fs.readFileSync(p, 'utf8')).filter((r) => r.some((v) => v !== ''))
    const sh = env.ss.insertSheet(nama)
    rows.forEach((line, r) => line.forEach((v, c) => sh.setCell(r + 1, c + 1, v)))
    return sh
  }
  muatSvc('Monitor Kasie FS', 'Monitor_Kasie_FS.csv')
  muatSvc('Data Service Engine', 'Data_Service_Engine.csv')
  ctx.SpreadsheetApp.openById = () => ({
    getSheetByName: (n) => (n === 'Mesin' ? mesin : n === 'Irrigator' ? irrigator : env.ss.getSheetByName(n)),
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

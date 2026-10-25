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
  const muat = (sheet, file) => {
    const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
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

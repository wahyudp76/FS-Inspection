/**
 * Server tiruan Apps Script untuk modul SERVICE ENGINE (uji lokal).
 *  - svcread   : mengirim fixture tb_service1 + tb_service2 (dari sheet asli)
 *  - svcrecord : menambah baris di log tiruan, menghitung ulang evaluasi tiruan
 *  - history/ping : jawaban minimal supaya aplikasi lain tetap tenang
 *
 * Jalankan: node tools/svcmock.mjs [port]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = process.env.SVC_FIXTURE || path.join(dir, 'svc-fixture.json')
const fx = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

const PORT = Number(process.argv[2] || process.env.PORT || 8112)
const log = [...fx.logRows]
const state = { hits: [], appends: [], sheetWrites: 0 }

const idx = (header, names) => {
  for (const n of names) {
    const i = header.findIndex((h) => String(h).trim().toUpperCase() === n.toUpperCase())
    if (i >= 0) return i
  }
  return -1
}
const IDX_LOG = {
  posisi: idx(fx.logHeader, ['Posisi']),
  no: idx(fx.logHeader, ['No']),
  tanggal: idx(fx.logHeader, ['Tanggal']),
  kode: idx(fx.logHeader, ['Kode Mesin']),
  hm: idx(fx.logHeader, ['HM Service']),
}
const IDX_EVAL = {
  kode: idx(fx.evalHeader, ['KODE UNIT']),
  posisi: idx(fx.evalHeader, ['POSISI UNIT']),
  terakhir: idx(fx.evalHeader, ['Real Service Terakhir']),
  hm: idx(fx.evalHeader, ['HM Service Terakhir']),
  nextTgl: idx(fx.evalHeader, ['Tgl Next Service']),
  nextHm: idx(fx.evalHeader, ['Next HM Service']),
  warning: idx(fx.evalHeader, ['Warning Date']),
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const pad = (n) => String(n).padStart(2, '0')
const dmy = (iso) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`
}
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const hariIni = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* --- tiru perilaku rumus tb_service1 setelah baris baru ditambahkan --- */
function rekalkulasi(kode, tanggal, hm) {
  const baris = fx.evalRows.find((r) => String(r[IDX_EVAL.kode]).toUpperCase() === kode)
  if (!baris) return null
  const rerata = Number(String(baris[6]).replace(/[^\d.]/g, '')) || 0
  baris[IDX_EVAL.terakhir] = dmy(tanggal)
  baris[IDX_EVAL.hm] = hm
  const nextHm = hm + 250
  baris[IDX_EVAL.nextHm] = nextHm
  if (rerata > 0) {
    const nextIso = addDays(tanggal, Math.ceil(250 / rerata))
    baris[IDX_EVAL.nextTgl] = dmy(nextIso)
    const a = new Date(`${hariIni()}T00:00:00`).getTime()
    const b = new Date(`${nextIso}T00:00:00`).getTime()
    baris[IDX_EVAL.warning] = Math.round((a - b) / 86400000)
  } else {
    baris[IDX_EVAL.nextTgl] = ''
    baris[IDX_EVAL.warning] = ''
  }
  /* kolom minggu service bulan terkait */
  const bulanIdx = Number(tanggal.slice(5, 7))
  const kolom = 10 + (bulanIdx - 1)
  if (baris[kolom] !== undefined) baris[kolom] = Math.ceil(Number(tanggal.slice(8, 10)) / 7)
  return {
    terakhir: tanggal,
    hm,
    nextService: baris[IDX_EVAL.nextTgl] ? addDays(tanggal, rerata ? Math.ceil(250 / rerata) : 0) : '',
    nextHm,
    warning: baris[IDX_EVAL.warning] === '' ? null : Number(baris[IDX_EVAL.warning]),
  }
}

function svcread() {
  return {
    evalHeader: fx.evalHeader,
    evalRows: fx.evalRows,
    logHeader: fx.logHeader,
    logRows: log,
    intervalHm: 250,
  }
}

function svcrecord(p) {
  const kode = String(p.kode || '').toUpperCase()
  const tanggal = String(p.tanggal || '')
  const hm = Number(p.hm)
  if (!kode) throw new Error('Kode mesin wajib diisi.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw new Error('Tanggal service tidak valid.')
  if (!Number.isFinite(hm) || hm <= 0) throw new Error('HM service harus angka > 0.')

  const udah = log.find(
    (r) => String(r[IDX_LOG.kode]).toUpperCase() === kode && String(r[IDX_LOG.tanggal]) === tanggal && Number(r[IDX_LOG.hm]) === hm
  )
  if (udah) {
    return { baris: 0, no: Number(udah[IDX_LOG.no]), kode, hm, tanggal, duplikat: true, verified: true, evaluasi: rekalkulasi(kode, tanggal, hm) }
  }

  const no = Math.max(...log.map((r) => Number(r[IDX_LOG.no]) || 0)) + 1
  const posisi = p.posisi || (fx.evalRows.find((r) => String(r[IDX_EVAL.kode]).toUpperCase() === kode) || [])[IDX_EVAL.posisi] || 'FM4'
  const bulan = BULAN[Number(tanggal.slice(5, 7)) - 1]
  const row = []
  row[IDX_LOG.posisi] = posisi
  row[IDX_LOG.no] = String(no)
  row[IDX_LOG.tanggal] = tanggal
  row[3] = String(Number(tanggal.slice(5, 7)))
  row[4] = bulan
  row[5] = String(Math.ceil(Number(tanggal.slice(8, 10)) / 7))
  row[IDX_LOG.kode] = kode
  row[IDX_LOG.hm] = String(hm)
  for (let i = 0; i < 8; i++) if (row[i] === undefined) row[i] = ''
  log.push(row)
  state.appends.push({ kode, tanggal, hm, no, posisi })
  state.sheetWrites++
  return { baris: fx.logHeader.length ? 217 + state.appends.length : 0, no, posisi, kode, tanggal, hm, verified: true, evaluasi: rekalkulasi(kode, tanggal, hm) }
}

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors)
    return res.end()
  }
  if (req.url.startsWith('/__state')) {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(state))
  }
  if (req.url.startsWith('/__reset')) {
    state.appends.length = 0
    state.hits.length = 0
    state.sheetWrites = 0
    res.writeHead(200, cors)
    return res.end('ok')
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    let payload = {}
    try {
      payload = JSON.parse(body || '{}')
    } catch {
      payload = {}
    }
    const action = payload.action || 'ping'
    state.hits.push(action)
    let out = { ok: true, version: '1.6.0-mock' }
    try {
      if (action === 'svcread') out.result = svcread()
      else if (action === 'svcrecord') out.result = svcrecord(payload.payload || {})
      else if (action === 'history') out = { ok: true, records: [], rev: 'mock', count: 0 }
      else if (action === 'syncmaster') out.result = []
      else if (action === 'ping') out.records = 0
    } catch (e) {
      out = { ok: false, error: e.message }
    }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify(out))
  })
})
server.listen(PORT, '0.0.0.0', () => console.log(`svcmock di :${PORT} — ${fx.evalRows.length} unit, ${log.length} pencatatan`))

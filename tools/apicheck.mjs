/**
 * Cek sinkronisasi API ↔ sheet: panggil `history` lewat mock Apps Script,
 * lalu bandingkan tiap record dengan baris asli sheet "Data Inspeksi".
 *
 * Yang diperiksa: jumlah record, ID (tanpa duplikat), tanggal, tipe/kode unit,
 * petugas, ringkasan A/B/C/Total/Skor/Kondisi, dan seluruh nilai komponen.
 *
 * Jalankan: DATA_DIR=/home/user/data node tools/apicheck.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA_DIR = process.env.DATA_DIR || '/home/user/data'
process.env.DI_CSV = process.env.DI_CSV || path.join(DATA_DIR, 'di.csv')
const { makeEnv, loadCode, post, parseCSV } = await import('./mock.gs.mjs')

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}
const angka = (v) => Number(String(v == null ? '' : v).replace(/[\s\u00a0]/g, '').replace(/\./g, '').replace(',', '.')) || 0

const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, 'di.csv'), 'utf8')).filter((r) => r.some((v) => v !== ''))
const header = rows[0].map((h) => String(h).trim())
const iId = header.indexOf('ID Inspeksi')
const iTgl = header.indexOf('Tanggal')
const iTipe = header.indexOf('Tipe Aset')
const iKode = header.indexOf('Kode Unit')
const iPetugas = header.indexOf('Petugas')
const iA = header.indexOf('A'), iB = header.indexOf('B'), iC = header.indexOf('C')
const iTot = header.indexOf('Total'), iSkor = header.indexOf('Skor'), iKond = header.indexOf('Kondisi')

const env = makeEnv()
const ctx = loadCode(env)
const res = post(ctx, { action: 'history', payload: {} })
cek('history balas ok', res.ok === true, `${res.count} record, kompresi ${res.compressed}`)
const recs = res.records || []
cek('jumlah record = jumlah baris sheet', recs.length === rows.length - 1, `API ${recs.length} · sheet ${rows.length - 1}`)

const ids = recs.map((r) => r.id)
cek('tidak ada ID duplikat', new Set(ids).size === ids.length, `${ids.length} record`)

/* peta baris sheet per ID */
const peta = new Map()
for (const r of rows.slice(1)) peta.set(String(r[iId]).trim(), r)

let tidakAda = 0
let bedaMeta = 0
let bedaRingkas = 0
let bedaKomponen = 0
let contoh = ''
const blokKomponen = { Mesin: header.slice(16, 62), Irrigator: header.slice(62, 91) }

/* komponen dikirim terkompresi: rec.k = string per komponen sesuai kmap[tipe] */
const lebarkan = (rec) => {
  if (rec.komponen) return rec.komponen
  const list = res.kmap?.[rec.tipe] || []
  const out = { ...(rec.kx || {}) }
  for (let i = 0; i < list.length; i++) {
    const g = String(rec.k || '')[i]
    if (g === 'A' || g === 'B' || g === 'C') out[list[i]] = g
  }
  return out
}

for (const rec of recs) {
  const row = peta.get(String(rec.id))
  if (!row) { tidakAda++; continue }
  const tipe = String(row[iTipe]).trim()
  if (rec.kode !== String(row[iKode]).trim()) { bedaMeta++; contoh += ` kode ${rec.id}: ${rec.kode} vs ${row[iKode]}` }
  if (String(rec.tipe || '').trim() !== tipe) { bedaMeta++; contoh += ` tipe ${rec.id}` }
  if (String(rec.tanggal || '') !== String(row[iTgl]).trim()) { bedaMeta++; contoh += ` tanggal ${rec.id}: ${rec.tanggal} vs ${row[iTgl]}` }
  if (String(rec.inspector || '') !== String(row[iPetugas]).trim()) { bedaMeta++; contoh += ` petugas ${rec.id}` }

  const banding = [
    ['a', iA], ['b', iB], ['c', iC], ['total', iTot],
  ]
  for (const [k, ix] of banding) {
    if (Number(rec[k]) !== angka(row[ix])) {
      bedaRingkas++
      contoh += ` ${k} ${rec.id}: ${rec[k]} vs ${row[ix]}`
    }
  }
  if (Math.abs(Number(rec.skor) - angka(row[iSkor])) > 0.05) { bedaRingkas++; contoh += ` skor ${rec.id}: ${rec.skor} vs ${row[iSkor]}` }
  if (String(rec.kondisi || '') !== String(row[iKond]).trim()) { bedaRingkas++; contoh += ` kondisi ${rec.id}: ${rec.kondisi} vs ${row[iKond]}` }

  for (const nm of blokKomponen[tipe] || []) {
    const ix = header.indexOf(nm)
    if (ix < 0) continue
    const sheetVal = String(row[ix]).trim().toUpperCase()
    const apiVal = String(lebarkan(rec)[nm] || '').trim().toUpperCase()
    if (sheetVal !== apiVal) { bedaKomponen++; if (contoh.length < 400) contoh += ` komp ${rec.id}/${nm}: "${apiVal}" vs "${sheetVal}"` }
  }
}

cek('semua record ada di sheet', tidakAda === 0, `${tidakAda} yatim`)
cek('tanggal/tipe/kode/petugas cocok', bedaMeta === 0, bedaMeta ? `${bedaMeta} selisih:${contoh.slice(0, 300)}` : '')
cek('ringkasan A/B/C/Total/Skor/Kondisi cocok', bedaRingkas === 0, bedaRingkas ? `${bedaRingkas} selisih:${contoh.slice(0, 300)}` : '')
cek('seluruh nilai komponen cocok', bedaKomponen === 0, bedaKomponen ? `${bedaKomponen} selisih:${contoh.slice(0, 300)}` : '')

/* rev/idempoten: permintaan kedua dengan rev yang sama harus murah */
const lagi = post(ctx, { action: 'history', payload: { rev: res.rev } })
cek('rev sama → unchanged', lagi.unchanged === true, `${JSON.stringify(lagi).length} byte`)
cek('payload unchanged jauh lebih kecil', JSON.stringify(lagi).length < JSON.stringify(res).length / 5,
  `${(JSON.stringify(lagi).length / 1024).toFixed(1)} KB vs ${(JSON.stringify(res).length / 1024).toFixed(1)} KB`)

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

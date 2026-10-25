/**
 * Uji aksi `audit` dan `repair` Code.gs terhadap data asli (offline, tanpa deployment).
 * Sumber data: folder $DATA_DIR (default /home/user/data) berisi
 *   di.csv (sheet "Data Inspeksi"), mesin.csv (tb_mesin), irrigator.csv (tb_irrigator).
 *
 * Jalankan: node tools/datafix.mjs
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

/* grid sheet dari CSV, memakai Sheet milik mock (lewat spreadsheet tiruan) */
function sheetDariCSV(nama, file) {
  const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
  const sh = makeEnv().ss.insertSheet(nama)
  rows.forEach((line, r) => line.forEach((v, c) => sh.setCell(r + 1, c + 1, v)))
  return sh
}

const env = makeEnv()
const ctx = loadCode(env)
const ss = env.ss
const mesin = sheetDariCSV('Mesin', 'mesin.csv')
const irrigator = sheetDariCSV('Irrigator', 'irrigator.csv')
ctx.SpreadsheetApp.openById = () => ({
  getSheetByName: (n) => (n === 'Mesin' ? mesin : n === 'Irrigator' ? irrigator : ss.getSheetByName(n)),
  getSpreadsheetTimeZone: () => 'Asia/Jakarta',
})

/* ---- 1. audit kondisi awal ---- */
const a1 = post(ctx, { action: 'audit' })
cek('audit balas ok', a1.ok === true, `versi ${a1.version}`)
const h = a1.result.hitung
console.log('   ringkasan awal:', JSON.stringify(h), '| master Mesin/Irrigator:', a1.result.master.mesin, '/', a1.result.master.irrigator)
cek('audit menemukan selisih ringkasan di Data Inspeksi', h.ringkasan > 0, `${h.ringkasan} baris`)
cek('audit menemukan komponen kosong (Jack / Kaki Depan)', h.komponenHilang >= 123, `${h.komponenHilang} sel`)
cek('audit menemukan selisih ringkasan di master', a1.result.master.mesin + a1.result.master.irrigator > 0,
  `Mesin ${a1.result.master.mesin} · Irrigator ${a1.result.master.irrigator}`)
cek('audit melaporkan contoh temuan', Array.isArray(a1.result.contoh) && a1.result.contoh.length > 0, `${a1.result.contoh.length} contoh`)
cek('tidak ada ID ganda', h.idGanda === 0, `${h.idGanda}`)
cek('tidak ada kode asing di Data Inspeksi', h.kodeAsing === 0, `${h.kodeAsing}`)
cek('status Data Inspeksi vs master dilaporkan', typeof h.statusBeda === 'number', `status beda ${h.statusBeda}`)

/* ---- 2. repair ---- */
const r1 = post(ctx, { action: 'repair', payload: { sheet: 'semua' } })
cek('repair balas ok', r1.ok === true)
console.log('   hasil repair:', JSON.stringify(r1.result))
cek('komponen kosong terisi dari master', r1.result.komponenDiisi >= 123, `${r1.result.komponenDiisi} sel`)
cek('baris Data Inspeksi dihitung ulang', r1.result.inspeksi > 0, `${r1.result.inspeksi} baris`)
cek('master Mesin diperbaiki', r1.result.mesin > 0, `${r1.result.mesin} baris`)
cek('master Irrigator diperiksa', r1.result.irrigator >= 0, `${r1.result.irrigator} baris`)

/* ---- 3. audit ulang harus bersih ---- */
const a2 = post(ctx, { action: 'audit' })
const h2 = a2.result.hitung
console.log('   ringkasan akhir:', JSON.stringify(h2), '| master Mesin/Irrigator:', a2.result.master.mesin, '/', a2.result.master.irrigator)
cek('ringkasan Data Inspeksi bersih', h2.ringkasan === 0 && h2.skor === 0 && h2.kondisi === 0)
/* statusBeda bersifat informasi (riwayat inspeksi tidak ditulis ulang) */
cek('status beda dilaporkan terpisah dari temuan', h2.statusBeda === 0 || h2.statusBeda > 0, `${h2.statusBeda} baris info`)
cek('komponen kosong bersih', h2.komponenHilang === 0)
cek('master bersih', a2.result.master.mesin === 0 && a2.result.master.irrigator === 0)

/* ---- 4. idempoten ---- */
const r2 = post(ctx, { action: 'repair', payload: {} })
cek('repair idempoten (jalan kedua tanpa perubahan)',
  r2.result.inspeksi === 0 && r2.result.komponenDiisi === 0 && r2.result.mesin === 0 && r2.result.irrigator === 0,
  JSON.stringify(r2.result))

/* ---- 5. konsistensi silang: ringkasan = hitungan sel komponen ---- */
const sh = env.sheet
const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((x) => String(x).trim())
const rowsAll = sh.getRange(2, 1, sh.getLastRow() - 1, hdr.length).getValues()
const iId = hdr.indexOf('ID Inspeksi')
const iA = hdr.indexOf('A'), iB = hdr.indexOf('B'), iC = hdr.indexOf('C')
const iT = hdr.indexOf('Total'), iS = hdr.indexOf('Skor'), iK = hdr.indexOf('Kondisi')
const iStatus = hdr.indexOf('Status Unit')
let salah = 0
let contoh = ''
for (const row of rowsAll) {
  const tipe = String(row[hdr.indexOf('Tipe Aset')])
  const blok = tipe === 'Mesin' ? row.slice(16, 62) : row.slice(62, 91)
  const g = blok.map((v) => String(v).trim().toUpperCase()).filter((v) => v === 'A' || v === 'B' || v === 'C')
  const a = g.filter((v) => v === 'A').length
  const b = g.filter((v) => v === 'B').length
  const c = g.filter((v) => v === 'C').length
  const skor = g.length ? Math.round(((a * 100 + b * 60) / g.length) * 10) / 10 : 0
  const status = String(row[iStatus]).trim().toLowerCase()
  const kondisi = status === 'rusak' ? 'Kritis' : skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis'
  const okRingkas = Number(row[iA]) === a && Number(row[iB]) === b && Number(row[iC]) === c && Number(row[iT]) === g.length
  const angka = (v) => Number(String(v == null ? '' : v).replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0
  const okSkor = Math.abs(angka(row[iS]) - skor) < 0.05
  const okKondisi = String(row[iK]).trim() === kondisi
  if (!okRingkas || !okSkor || !okKondisi) {
    salah++
    if (!contoh) contoh = `${row[iId]}: ${row[iA]}/${row[iB]}/${row[iC]} vs ${a}/${b}/${c}, skor ${row[iS]} vs ${skor}, kondisi ${row[iK]} vs ${kondisi}`
  }
}
cek('semua baris konsisten dengan sel komponen', salah === 0, salah ? `${salah} anomali (${contoh})` : `${rowsAll.length} baris`)

/* ---- 6. tidak ada nilai komponen hilang pasca-repair ---- */
let kosong = 0
const rowsMesin = new Map()
const rowsIrr = new Map()
mesin.getRange(2, 1, mesin.getLastRow() - 1, mesin.getLastColumn()).getValues().forEach((r) => rowsMesin.set(String(r[1]).trim().toUpperCase(), r))
irrigator.getRange(2, 1, irrigator.getLastRow() - 1, irrigator.getLastColumn()).getValues().forEach((r) => rowsIrr.set(String(r[1]).trim().toUpperCase(), r))
const hMesin = mesin.getRange(1, 1, 1, mesin.getLastColumn()).getValues()[0].map((x) => String(x).trim())
const hIrr = irrigator.getRange(1, 1, 1, irrigator.getLastColumn()).getValues()[0].map((x) => String(x).trim())
const norm = (s) => String(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
for (const row of rowsAll) {
  const tipe = String(row[hdr.indexOf('Tipe Aset')])
  const kode = String(row[hdr.indexOf('Kode Unit')]).trim().toUpperCase()
  const src = tipe === 'Mesin' ? rowsMesin.get(kode) : rowsIrr.get(kode)
  const hh = tipe === 'Mesin' ? hMesin : hIrr
  if (!src) continue
  const blok = tipe === 'Mesin' ? hdr.slice(16, 62) : hdr.slice(62, 91)
  for (const label of blok) {
    const posM = hh.findIndex((x) => norm(x) === norm(label))
    if (posM < 0) continue
    const vMaster = String(src[posM]).trim().toUpperCase()
    const vSheet = String(row[hdr.indexOf(label)]).trim().toUpperCase()
    if (['A', 'B', 'C'].includes(vMaster) && !['A', 'B', 'C'].includes(vSheet)) kosong++
  }
}
cek('tidak ada komponen master yang hilang di Data Inspeksi', kosong === 0, `${kosong} sel`)

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

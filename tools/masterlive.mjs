/**
 * Uji aksi `master` (master live dari spreadsheet) + penggabungannya di web.
 *
 * Kasus nyata yang dijaga: unit SPC0224 sudah diperbaiki (status di sheet
 * “Mesin” berubah Rusak → Terpasang) tetapi dashboard masih menampilkan Rusak
 * karena memakai snapshot build. Sekarang status master ikut ditarik saat Sinkron.
 *
 * Jalankan: DATA_DIR=/home/user/data node tools/masterlive.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA = process.env.DATA_DIR || '/home/user/data'
process.env.DI_CSV = process.env.DI_CSV || path.join(DATA, 'di.csv')

const { makeEnv, loadCode, post, parseCSV } = await import('./mock.gs.mjs')
const { execFileSync } = await import('node:child_process')
const os = await import('node:os')

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

/* bundle master.js untuk Node (import tanpa ekstensi ala Vite) */
const bundel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsi-ml-')), 'master.mjs')
execFileSync('npx', ['esbuild', 'src/lib/master.js', '--bundle', '--format=esm', '--platform=node', `--outfile=${bundel}`, '--log-level=error'], {
  cwd: path.join(HERE, '..'),
})
const { gabungMasterLive, bacaMasterLive } = await import(bundel)
const assets = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'data', 'assets.json'), 'utf8'))

/* ---- siapkan dunia: sheet Mesin & Irrigator, SPC0224 sudah diperbaiki ---- */
function sheetDariCSV(nama, file, ubah) {
  const rows = parseCSV(fs.readFileSync(path.join(DATA, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
  if (ubah) ubah(rows)
  const sh = makeEnv().ss.insertSheet(nama)
  rows.forEach((line, r) => line.forEach((v, c) => sh.setCell(r + 1, c + 1, v)))
  return sh
}

const mesin = sheetDariCSV('Mesin', 'mesin.csv', (rows) => {
  const h = rows[0].map((x) => String(x).trim())
  const ik = h.indexOf('Kode Unit')
  const ist = h.indexOf('Status')
  rows.forEach((r) => { if (String(r[ik]).trim() === 'SPC0224') r[ist] = 'Terpasang' })
})
const irrigator = sheetDariCSV('Irrigator', 'irrigator.csv')
const env = makeEnv()
const ctx = loadCode(env)
ctx.SpreadsheetApp.openById = () => ({
  getSheetByName: (n) => (n === 'Mesin' ? mesin : n === 'Irrigator' ? irrigator : env.ss.getSheetByName(n)),
  getSpreadsheetTimeZone: () => 'Asia/Jakarta',
})

/* ---- 1. aksi master ---- */
const r1 = post(ctx, { action: 'master', payload: {} })
cek('aksi master balas ok', r1.ok === true, `versi ${r1.version}`)
const live = r1.result
cek('berisi mesin & irrigator', Array.isArray(live.mesin) && Array.isArray(live.irrigator),
  `${live.mesin.length} mesin · ${live.irrigator.length} irrigator`)
cek('jumlah unit = sheet master', live.mesin.length === assets.mesin.length && live.irrigator.length === assets.irrigator.length,
  `${live.mesin.length}/${assets.mesin.length} · ${live.irrigator.length}/${assets.irrigator.length}`)
cek('kmap komponen ikut dikirim', live.kmap?.Mesin?.length === 46 && live.kmap?.Irrigator?.length === 29,
  `${live.kmap?.Mesin?.length}/${live.kmap?.Irrigator?.length}`)

const barisMesin = live.mesin.find((r) => r[0] === 'SPC0224')
cek('SPC0224 terkirim', !!barisMesin, JSON.stringify(barisMesin?.slice(0, 7)))
cek('status master terbaru ikut terkirim', barisMesin && barisMesin[4] === 'Terpasang', String(barisMesin && barisMesin[4]))
cek('grades berbentuk string sepanjang 46', barisMesin && barisMesin[5].length === 46, String(barisMesin && barisMesin[5].length))
cek('tgl inspeksi terakhir ikut', barisMesin && /^\d{4}-\d{2}-\d{2}$/.test(barisMesin[6]), String(barisMesin && barisMesin[6]))
cek('metadata mesin (pump/power/pompa/komoditi/keterangan) ada', barisMesin && barisMesin.length === 12,
  barisMesin && `${barisMesin[7]} · ${barisMesin[8]} HP · ${barisMesin[9]}`)

const barisIrr = live.irrigator[0]
cek('baris irrigator: kode/wilayah/spec/jenis/status', barisIrr && barisIrr[0] === 'BTI0027' && barisIrr[1] === 'FM4' && barisIrr[2] === '25' && barisIrr[3] === 'BTI' && barisIrr[4] === 'Terpasang',
  JSON.stringify(barisIrr?.slice(0, 5)))
cek('baris irrigator: nozzle di posisi terakhir', barisIrr && barisIrr.length === 8 && String(barisIrr[7]) === '25', String(barisIrr?.[7]))

const ukuran = JSON.stringify(live).length
cek('payload master hemat (< 120 kB)', ukuran < 120 * 1024, `${(ukuran / 1024).toFixed(1)} kB untuk 274 unit`)

/* rev yang sama → unchanged */
const r2 = post(ctx, { action: 'master', payload: { rev: live.rev } })
cek('rev sama → unchanged', r2.result?.unchanged === true, `${JSON.stringify(r2.result).length} byte`)

/* ---- 2. gabung ke data web ---- */
const gabung = gabungMasterLive(assets, live)
const u = gabung.mesin.find((x) => x.kode === 'SPC0224')
const ui = gabung.irrigator.find((x) => x.kode === 'BTI0027')
cek('irrigator: nozzle & jenis tidak tertukar dengan tanggal', ui.nozzle === '25' && ui.unit === 'BTI' && ui.inspeksiTerakhir === '2026-03-05',
  JSON.stringify({ nozzle: ui.nozzle, unit: ui.unit, tgl: ui.inspeksiTerakhir }))
cek('status web ikut master (Tidak lagi Rusak)', u.status === 'Terpasang', u.status)
cek('kondisi tidak lagi Kritis', u.kondisi === 'Baik', `${u.kondisi} (skor ${u.score})`)
cek('jumlah unit tetap', gabung.mesin.length === 151 && gabung.irrigator.length === 123,
  `${gabung.mesin.length}/${gabung.irrigator.length}`)
cek('semua unit ter-overlay master', gabung.diterapkan === 274, String(gabung.diterapkan))
cek('tidak ada unit hilang/baru', gabung.unitHilang.length === 0 && gabung.unitBaru.length === 0,
  JSON.stringify({ hilang: gabung.unitHilang, baru: gabung.unitBaru }))

/* status seluruh unit harus sama dengan sheet */
const hMesin = mesin.getRange(1, 1, 1, mesin.getLastColumn()).getValues()[0].map((x) => String(x).trim())
const iStatus = hMesin.indexOf('Status')
const iKode = hMesin.indexOf('Kode Unit')
let beda = 0
const contohBeda = []
for (let r = 2; r <= mesin.getLastRow(); r++) {
  const kode = String(mesin.cell(r, iKode + 1)).trim()
  const st = String(mesin.cell(r, iStatus + 1)).trim()
  const w = gabung.mesin.find((x) => x.kode === kode)
  if (!w || w.status !== st) {
    beda++
    if (contohBeda.length < 3) contohBeda.push(`${kode}: sheet "${st}" vs web "${w && w.status}"`)
  }
}
cek('status 151 mesin web = sheet', beda === 0, beda ? `${beda} beda (${contohBeda.join(', ')})` : '151 unit')

/* komponen & ringkasan juga ikut master */
const u2 = gabung.mesin.find((x) => x.kode === 'DEC0004')
cek('komponen unit ikut master', u2 && Object.keys(u2.components).length === 46, String(u2 && Object.keys(u2.components).length))
cek('ringkasan dihitung dari komponen master', u2 && u2.total === 46 && Math.abs(u2.score - 97.8) < 0.05 && u2.c === 1,
  u2 && `${u2.a}/${u2.b}/${u2.c} skor ${u2.score}`)

/* tanpa master live → data snapshot utuh (mode offline) */
const kosong = gabungMasterLive(assets, null)
cek('tanpa master live → snapshot dipakai', kosong.mesin.length === 151 && kosong.diterapkan === 0)

/* bacaMasterLive tahan input aneh */
cek('bacaMasterLive aman untuk input kosong',
  bacaMasterLive(null, 'Mesin').length === 0 && bacaMasterLive({}, 'Irrigator').length === 0)

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

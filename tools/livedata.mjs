/**
 * livedata.mjs — audit data ASLI: spreadsheet ↔ web.
 *
 * Menjalankan isi `apps-script/Code.gs` apa adanya (lewat tools/mock.gs.mjs)
 * di atas ekspor CSV asli:
 *   data/Data_Inspeksi.csv   (Update ZPAS637 ▸ Data Inspeksi)
 *   data/src_Mesin.csv       (Draft Dashboard ▸ Mesin / tb_mesin)
 *   data/src_Irrigator.csv   (Draft Dashboard ▸ Irrigator / tb_irrigator)
 *
 * Yang diperiksa:
 *   1. audit bawaan Code.gs (ringkasan vs sel komponen, komponen hilang, dst)
 *   2. apakah `repair` benar-benar membersihkan & idempoten
 *   3. kebenaran API `history`/`master` vs isi sheet
 *   4. kebenaran angka yang dipakai WEB (assets.json, analitik) vs sheet
 *
 * Jalankan: node tools/livedata.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { makeEnv, loadCode, post, parseCSV, rowCount } from './mock.gs.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
const DATA = R('../data')

let gagal = 0
const cek = (nama, ok, extra = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${extra ? ' — ' + extra : ''}`)
}
const baca = (f) => parseCSV(fs.readFileSync(path.join(DATA, f), 'utf8')).filter((r) => r.some((v) => v !== ''))

/* ---------------- siapkan lingkungan tiruan dari CSV asli ---------------- */
function buatEnv({ kosongkanInspeksi = false } = {}) {
  const env = makeEnv()
  for (const [nama, berkas] of [['Mesin', 'src_Mesin.csv'], ['Irrigator', 'src_Irrigator.csv']]) {
    const rows = baca(berkas)
    const sh = env.ss.insertSheet(nama)
    sh.grid = rows.map((r) => [...r])
  }
  if (kosongkanInspeksi) {
    const h = env.sheet.grid[0]
    env.sheet.grid = [h]
  }
  return env
}

const KOLOM_MESIN = [
  'Accu', 'Kabel Accu', 'Klem Accu', 'Kunci Kontak Batery', 'Kunci Kontak Starter',
  'Dinamo Start', 'Dinamo Charge', 'V Belt Altenator', 'Kabel Intalasi', 'Tombol Emergency Stop',
  'Amper Meter', 'Hour Meter', 'Oil Presure Meter', 'RPM Meter', 'Water Temp Meter',
  'Amper Charge', 'Temp Air', 'Feed Pump', 'Injeksi Pump', 'Filter Solar', 'Tangki Solar',
  'Selang Nozle', 'Pengukur Volum Solar', 'Stik Oil', 'Tutup Oil', 'Air Cleaner', 'Radiator',
  'Hose radiator Atas', 'Hose radiator Bawah', 'Kipas Radiator', 'Tutup Radiator',
  'V Belt Radiator', 'Water Pump', 'Oil Cooler', 'Knalpot', 'Mesin', 'Prodo',
  'Perpak clynder head', 'Perpak oil Pan', 'Turbo Charger', 'Coupling Assy', 'Joint Couple',
  'Selenoid Transmisi', 'Chasis', 'Ban', 'Pintu',
]
const KOLOM_IRR = [
  'Turbin', 'As Turbin', 'V belt Turbin ( Bauer )', 'Pulley Turbin ( Bauer )',
  'Rantai Besar ( Bauer )', 'Rantai Kecil', 'Sproket Wheel', 'Assembly Bearing',
  'Bearing Molen', 'Gear Box / Transmisi', 'Pengatur Kecepatan', 'Fleksible Hose 3"',
  'Fleksible Hose 5"', 'Hose Drum', 'Seal Hose Drum', 'Mekanik Seal', 'Bearing Hose Drum',
  'Nozle Gun', 'Roda trolley Gun', 'Stoper/Putaran Gun', 'Bandul Pada Troli',
  'Gandengan / Drawbar', 'Jack / Kaki  Depan', 'Jack / Kaki  Belakang', 'Ban Irigator',
  'Hydrolik', 'Pressure Gauge', 'PE', 'Helically',
]
const norm = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const idx = (header, nama) => header.findIndex((h) => norm(h) === norm(nama))
const angka = (v) => {
  if (typeof v === 'number') return v
  const s = String(v == null ? '' : v).trim()
  if (!s) return 0
  const bersih = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')
  const n = Number(bersih)
  return Number.isFinite(n) ? n : 0
}
const skorDari = (a, b, c) => {
  const t = a + b + c
  return t ? Math.round(((a * 100 + b * 60) / t) * 10) / 10 : 0
}
const kondisiDari = (skor, status) =>
  String(status || '').trim().toLowerCase() === 'rusak' ? 'Kritis' : skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis'

/* ---------------- 1. audit isi sheet sekarang ---------------- */
console.log('\n== 1. AUDIT SHEET “Data Inspeksi” (data asli) ==')
const env = buatEnv()
const ctx = loadCode(env)
const sebelum = post(ctx, { action: 'audit' }).result
console.log('   baris:', sebelum.baris, '| hitung:', JSON.stringify(sebelum.hitung))
console.log('   master :', JSON.stringify({ mesin: sebelum.master.mesin, irrigator: sebelum.master.irrigator }))

const rows = baca('Data_Inspeksi.csv')
const header = rows[0]
const iA = idx(header, 'A'), iB = idx(header, 'B'), iC = idx(header, 'C'), iTot = idx(header, 'Total')
const iSkor = idx(header, 'Skor'), iKond = idx(header, 'Kondisi'), iTipe = idx(header, 'Tipe Aset')
const iStatus = idx(header, 'Status Unit'), iKode = idx(header, 'Kode Unit'), iID = idx(header, 'ID Inspeksi')

let ringkasanSalah = 0, hilang = 0, skorSalah = 0, kondisiSalah = 0
const contoh = []
for (const r of rows.slice(1)) {
  const tipe = r[iTipe]
  const daftar = tipe === 'Irrigator' ? KOLOM_IRR : KOLOM_MESIN
  let a = 0, b = 0, c = 0, kosong = 0
  for (const nama of daftar) {
    const k = idx(header, nama)
    const v = k >= 0 ? String(r[k] || '').trim().toUpperCase() : ''
    if (v === 'A') a++
    else if (v === 'B') b++
    else if (v === 'C') c++
    else kosong++
  }
  const sa = angka(r[iA]), sb = angka(r[iB]), sc = angka(r[iC]), st = angka(r[iTot])
  if (sa !== a || sb !== b || sc !== c || st !== a + b + c) {
    ringkasanSalah++
    if (contoh.length < 5) contoh.push(`${r[iID]} ${tipe} ${r[iKode]}: kolom ${sa}/${sb}/${sc}/${st} ≠ sel ${a}/${b}/${c}/${a + b + c}`)
  }
  if (kosong) hilang += kosong
  if (Math.abs(angka(r[iSkor]) - skorDari(a, b, c)) > 0.05) skorSalah++
  if (String(r[iKond] || '').trim() !== kondisiDari(skorDari(a, b, c), r[iStatus])) kondisiSalah++
}
console.log(`   ringkasan(A/B/C/Total) salah : ${ringkasanSalah}/${rows.length - 1}`)
contoh.forEach((c) => console.log('     · ' + c))
console.log(`   skor salah                   : ${skorSalah}`)
console.log(`   kondisi salah                : ${kondisiSalah}`)
console.log(`   sel komponen kosong          : ${hilang}`)

/* ---------------- 2. apakah repair membereskan? ---------------- */
console.log('\n== 2. AKSI `repair` (dijalankan pada salinan di memori) ==')
const envR = buatEnv()
const ctxR = loadCode(envR)
const rep1 = post(ctxR, { action: 'repair', payload: { sheet: 'semua' } }).result
const audit2 = post(ctxR, { action: 'audit' }).result
const rep2 = post(ctxR, { action: 'repair', payload: { sheet: 'semua' } }).result
const audit3 = post(ctxR, { action: 'audit' }).result
console.log('   repair #1:', JSON.stringify(rep1))
console.log('   audit #2 :', JSON.stringify(audit2.hitung), '| master', JSON.stringify({ m: audit2.master.mesin, i: audit2.master.irrigator }))
console.log('   repair #2:', JSON.stringify(rep2))
console.log('   audit #3 :', JSON.stringify(audit3.hitung), '| master', JSON.stringify({ m: audit3.master.mesin, i: audit3.master.irrigator }))
/* Sheet bisa saja sudah pernah di-repair (mis. setelah pengguna menekan
   “Perbaiki otomatis”): saat itu repair WAJAR tidak mengubah apa pun. */
const kotor = sebelum.hitung.ringkasan + sebelum.hitung.skor + sebelum.hitung.kondisi + sebelum.hitung.komponenHilang
cek(
  kotor ? 'repair #1 mengubah baris yang salah' : 'sheet sudah bersih → repair #1 tidak mengubah apa pun',
  kotor ? rep1.inspeksi > 0 : rep1.inspeksi === 0,
  `${rep1.inspeksi} baris · temuan awal ${kotor}`
)
cek('audit setelah repair: ringkasan 0', audit2.hitung.ringkasan === 0, `${audit2.hitung.ringkasan} sisa`)
cek('audit setelah repair: skor 0', audit2.hitung.skor === 0, `${audit2.hitung.skor} sisa`)
cek('audit setelah repair: kondisi 0', audit2.hitung.kondisi === 0, `${audit2.hitung.kondisi} sisa`)
cek('audit setelah repair: komponen hilang 0', audit2.hitung.komponenHilang === 0, `${audit2.hitung.komponenHilang} sisa`)
cek('repair idempoten (jalan kedua tanpa perubahan)', rep2.inspeksi === 0 && rep2.mesin === 0 && rep2.irrigator === 0, JSON.stringify(rep2))

/* ---------------- 3. isi sheet setelah repair (cek independen) ---------------- */
const setelahGrid = envR.sheet.grid
const h2 = setelahGrid[0]
let masih = 0
for (const r of setelahGrid.slice(1)) {
  if (!r || !r.length) continue
  const tipe = r[idx(h2, 'Tipe Aset')]
  const daftar = tipe === 'Irrigator' ? KOLOM_IRR : KOLOM_MESIN
  let a = 0, b = 0, c = 0
  for (const nama of daftar) {
    const k = idx(h2, nama)
    const v = k >= 0 ? String(r[k] || '').trim().toUpperCase() : ''
    if (v === 'A') a++; else if (v === 'B') b++; else if (v === 'C') c++
  }
  if (angka(r[idx(h2, 'A')]) !== a || angka(r[idx(h2, 'Total')]) !== a + b + c) masih++
}
cek('cek independen: 0 baris berselisih setelah repair', masih === 0, `${masih} baris`)

/* ---------------- 4. API history vs sheet ---------------- */
console.log('\n== 3. API `history` vs isi sheet ==')
const hist = post(ctx, { action: 'history', payload: {} })
cek('jumlah record = jumlah baris sheet', hist.records.length === rows.length - 1, `${hist.records.length} vs ${rows.length - 1}`)
const isoOk = hist.records.every((r) => /^(\d{4}-\d{2}-\d{2}T[\d:]{8}\+07:00|\d{4}-\d{2}-\d{2})$/.test(r.timestamp || ''))
cek('semua timestamp terbaca (ISO +07:00)', isoOk, hist.records[0].timestamp)
const urut = hist.records.every((r, i) => i === 0 || new Date(hist.records[i - 1].timestamp) >= new Date(r.timestamp))
cek('urutan terbaru → terlama', urut)
cek('payload terkompresi', hist.compressed === true, `${(JSON.stringify(hist).length / 1024).toFixed(0)} kB`)
const h2rev = post(ctx, { action: 'history', payload: { rev: hist.rev } })
cek('rev sama → balasan kecil', h2rev.unchanged === true, `${JSON.stringify(h2rev).length} byte`)

/* ---------------- 5. angka yang dipakai WEB vs sheet ---------------- */
console.log('\n== 4. Angka WEB (snapshot & analitik) vs sheet ==')
const snap = JSON.parse(fs.readFileSync(R('../src/data/assets.json'), 'utf8'))
const masterMesin = baca('src_Mesin.csv')
const masterIrr = baca('src_Irrigator.csv')
function bandingkanMaster(nama, sheetRows, kolom, snapUnits, keyKode, awalKomponen) {
  const hh = sheetRows[0]
  let bedaNilai = 0, bedaSkor = 0, hilangDiWeb = 0, contohBeda = []
  const peta = new Map(snapUnits.map((u) => [String(u.kode).trim().toUpperCase(), u]))
  for (const r of sheetRows.slice(1)) {
    const kode = String(r[idx(hh, keyKode)] || '').trim()
    if (!kode) continue
    const u = peta.get(kode.toUpperCase())
    if (!u) { hilangDiWeb++; continue }
    let a = 0, b = 0, c = 0
    for (const nm of kolom) {
      const k = idx(hh, nm)
      const v = k >= 0 ? String(r[k] || '').trim().toUpperCase() : ''
      const g = ['A', 'B', 'C'].includes(v) ? v : ''
      const w = String(u.components[nm] || '')
      if ((g || '') !== w) {
        bedaNilai++
        if (contohBeda.length < 3) contohBeda.push(`${kode} ${nm}: sheet “${g}” web “${w}”`)
      }
      if (g === 'A') a++; else if (g === 'B') b++; else if (g === 'C') c++
    }
    const skorSheet = skorDari(a, b, c)
    if (Math.abs((u.score || 0) - skorSheet) > 0.05) bedaSkor++
  }
  console.log(`   ${nama}: unit di web ${snapUnits.length}, di sheet ${sheetRows.length - 1} · nilai komponen beda ${bedaNilai} · skor beda ${bedaSkor} · unit sheet tak ada di web ${hilangDiWeb}`)
  contohBeda.forEach((x) => console.log('     · ' + x))
  return { bedaNilai, bedaSkor, hilangDiWeb }
}
const bm = bandingkanMaster('Mesin', masterMesin, KOLOM_MESIN, snap.mesin, 'Kode Unit')
const bi = bandingkanMaster('Irrigator', masterIrr, KOLOM_IRR, snap.irrigator, 'KODE UNIT')
cek('nilai komponen Mesin web = sheet', bm.bedaNilai === 0, `${bm.bedaNilai} sel`)
cek('nilai komponen Irrigator web = sheet', bi.bedaNilai === 0, `${bi.bedaNilai} sel`)

/* ---------------- 5. jalur tulis: submit / update / syncmaster ---------------- */
console.log('\n== 5. Jalur tulis (submit → sheet → master) ==')
const envW = buatEnv()
const ctxW = loadCode(envW)
const auditAwal = post(ctxW, { action: 'audit' }).result
const sebelumW = post(ctxW, { action: 'ping' }).records
const sub = post(ctxW, {
  action: 'submit',
  payload: {
    clientId: 'FSI-LIVE-T1', tipe: 'Mesin', kode: 'DEC0004', wilayah: 'PG2', unitJenis: 'DEC',
    statusUnit: 'Rusak', tanggal: '2026-10-27', inspector: 'Audit Bot',
    komponen: { Accu: 'B', Mesin: 'C', Radiator: 'A' },
    /* angka klien sengaja SALAH — server harus menghitung sendiri */
    a: 99, b: 0, c: 0, total: 99, skor: 100,
  },
})
const r = sub.record || {}
cek('submit: ringkasan dihitung server (bukan dari klien)', r.a === 1 && r.b === 1 && r.c === 1 && r.total === 3, `A${r.a} B${r.b} C${r.c} total ${r.total} skor ${r.skor}`)
cek('submit: skor benar dari komponen', Math.abs((r.skor || 0) - 53.3) < 0.05, String(r.skor))
cek('submit: aturan Rusak ⇒ Kritis berlaku', r.kondisi === 'Kritis', String(r.kondisi))
cek('submit: satu baris baru saja', post(ctxW, { action: 'ping' }).records === sebelumW + 1)
const dupW = post(ctxW, { action: 'submit', payload: { clientId: 'FSI-LIVE-T1', tipe: 'Mesin', kode: 'DEC0004', statusUnit: 'Rusak', komponen: { Accu: 'B' } } })
cek('submit ulang idempoten', dupW.record?.duplicate === true && post(ctxW, { action: 'ping' }).records === sebelumW + 1)

const up = post(ctxW, { action: 'update', payload: { id: r.id, komponen: { Accu: 'A' } } })
const upR = up.record || {}
cek('update: komponen lain tidak terhapus', upR.komponen?.Mesin === 'C' && upR.komponen?.Radiator === 'A', JSON.stringify(upR.komponen))
cek('update: ringkasan ikut dihitung ulang', upR.a === 2 && upR.c === 1 && upR.total === 3, `A${upR.a} B${upR.b} C${upR.c} total ${upR.total}`)

/* syncmaster harus menulis angka dari komponen, bukan kolom ringkasan */
const sm = post(ctxW, { action: 'syncmaster' })
const masterMesinW = envW.sheets.Mesin
const cariKode = (sh, kode) => sh.grid.findIndex((row) => String(row?.[1] || '').trim().toUpperCase() === kode)
const baris = cariKode(masterMesinW, 'DEC0004')
const kepala = masterMesinW.grid[0]
const kol = (nama) => kepala.findIndex((h) => String(h || '').trim() === nama)
const selRingkas = baris > 0 ? {
  skor: masterMesinW.grid[baris][kol('SKOR')],
  kondisi: masterMesinW.grid[baris][kol('KONDISI')],
  a: masterMesinW.grid[baris][kol('A')],
  c: masterMesinW.grid[baris][kol('C')],
} : null
cek('syncmaster: terisi & skor = hitungan komponen', !!selRingkas && Number(String(selRingkas.skor).toString().replace(',', '.')) === upR.skor, JSON.stringify(selRingkas))
cek('syncmaster: KONDISI mengikuti status master (Rusak ⇒ Kritis)', selRingkas?.kondisi === 'Kritis', String(selRingkas?.kondisi))

const auW = post(ctxW, { action: 'audit' }).result
cek('baris baru tidak menambah hitungan “ringkasan salah”', auW.hitung.ringkasan === auditAwal.hitung.ringkasan, `${auW.hitung.ringkasan} vs ${auditAwal.hitung.ringkasan} (baris lama yang belum di-repair)`)

/* ---------------- 6. service engine: kelengkapan unit ---------------- */
console.log('\n== 6. Service engine: tb_service1 vs tb_service2 ==')
const { execFileSync } = await import('node:child_process')
execFileSync('npx', ['esbuild', 'src/lib/service.js', '--bundle', '--format=esm', '--outfile=/tmp/service.bundle.mjs', '--log-level=error'], { cwd: R('..') })
const svc = await import('/tmp/service.bundle.mjs?' + Date.now())
const evalCsv = baca('Data_Service_Engine.csv')
const logCsv = baca('Monitor_Kasie_FS.csv')
const evalParsed = svc.parseService1(evalCsv[0], evalCsv.slice(1))
const logParsed = svc.parseService2(logCsv[0], logCsv.slice(1))
const masterObj = masterMesin.slice(1).map((row) => ({ kode: String(row[1] || '').trim(), wilayah: String(row[4] || '').trim() })).filter((m) => m.kode)
const gab = svc.lengkapiUnitDariLog(evalParsed.units, logParsed, { master: masterObj, hariIni: '2026-10-27' })
console.log(`   tb_service1: ${evalParsed.units.length} unit · tb_service2: ${logParsed.length} catatan / ${new Set(logParsed.map((r) => r.kode)).size} unit · master: ${masterObj.length}`)
console.log(`   sesudah dilengkapi: ${gab.units.length} unit (dari log ${gab.dariLog}, dari master ${gab.dariMaster})`)
const tanpaFallback = new Set(evalParsed.units.map((u) => u.kode))
const masterTanpa = masterObj.filter((m) => !tanpaFallback.has(m.kode.toUpperCase())).length
cek('semua unit master muncul di halaman Service', new Set(gab.units.map((u) => u.kode)).size === masterObj.length, `${new Set(gab.units.map((u) => u.kode)).size}/${masterObj.length}`)
cek('fallback menambah unit yang hilang', gab.tambahan === masterTanpa, `${gab.tambahan} vs ${masterTanpa}`)
const hitungStatus = gab.units.reduce((a, u) => ({ ...a, [u.status]: (a[u.status] || 0) + 1 }), {})
console.log('   status:', JSON.stringify(hitungStatus))
cek('setiap unit punya status valid', gab.units.every((u) => ['terlambat', 'segera', 'aman', 'tanpaJadwal', 'belum'].includes(u.status)))
cek('unit hasil turunan log punya tanggal service terakhir', gab.units.filter((u) => u.sumber === 'log' && u.status !== 'belum').every((u) => !!u.terakhirIso))
cek('unit tanpa jadwal ditandai, bukan dianggap aman', gab.units.filter((u) => u.sumber === 'log' && u.rerata == null).every((u) => u.status === 'belum' || u.status === 'tanpaJadwal'))

/* ---------------- 7. warna KONDISI di sheet master (format bersyarat) ---------------- */
console.log('\n== 7. Warna kolom KONDISI (Kritis tidak boleh hijau) ==')
{
  const envC = buatEnv()
  const mesinC = envC.sheets.Mesin
  const headC = mesinC.grid[0]
  const kol = (nama) => headC.findIndex((h) => String(h || '').trim() === nama) + 1
  const cKond = kol('KONDISI')
  const cSkor = kol('SKOR')
  const cKode = kol('Kode Unit')

  /* Tiru kondisi sheet asli: ada aturan format bersyarat LAMA yang mewarnai
     seluruh blok ringkasan hijau bila teksnya mengandung “Baik”, dan satu aturan
     hijau untuk sel berisi “Baik” pada kolom KONDISI. Aturan CF selalu menang
     atas warna sel → dulu sel “Kritis” tetap hijau. */
  const lebarRange = mesinC.getRange(2, 1, 151, 40)
  const rngKond = mesinC.getRange(2, cKond, 151, 1)
  const buat = (teks, bg, ranges) =>
    envC.sandbox.SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains(teks).setBackground(bg).setRanges(ranges).build()
  mesinC.setConditionalFormatRules([
    buat('Baik', '#00ff00', [rngKond]),
    buat('Kritis', '#00ff00', [lebarRange]), // aturan “nakal” yang menimpa semua
  ])

  /* baris uji: unit berstatus Rusak dengan komponen C → KONDISI harus Kritis */
  const barisUji = (kode) => mesinC.grid.findIndex((r) => String(r?.[cKode - 1] || '').trim() === kode) + 1
  const rD = barisUji('DEM0074')
  mesinC.setCell(rD, cKond, 'Kritis')
  const sebelum = mesinC.effective(rD, cKond)
  cek('reproduksi: sel “Kritis” tampil hijau karena aturan lama', sebelum.background !== '#f4c7c3', `warna efektif ${sebelum.background}`)

  const ctxC = loadCode(envC)
  const smC = post(ctxC, { action: 'syncmaster' })
  const sesudah = mesinC.effective(rD, cKond)
  cek('sesudah syncmaster: sel “Kritis” berwarna merah', sesudah.background === '#f4c7c3', `warna efektif ${sesudah.background}`)
  cek('syncmaster melaporkan warna KONDISI terpasang', (smC.result || []).every((t) => !/warna KONDISI memakai warna sel saja/.test(t)))

  /* baris “Baik” harus hijau */
  const barisBaik = mesinC.grid.findIndex((r, i) => i > 0 && String(r?.[cKode - 1] || '').trim() === 'DEC0030') + 1
  const efektifBaik = mesinC.effective(barisBaik, cKond)
  cek('baris “Baik” tetap hijau', efektifBaik.background === '#d9ead3', `${String(mesinC.cell(barisBaik, cKond))} → ${efektifBaik.background}`)

  /* aturan tidak menumpuk saat dijalankan berulang */
  const jumlahAturanKita = () =>
    mesinC.getConditionalFormatRules().filter((r) => {
      try {
        const v = r.getBooleanCondition().getCriteriaValues()[0].getValue()
        return ['Kritis', 'Perlu Perhatian', 'Baik'].includes(String(v)) && r.getRanges().every((rg) => rg.getColumn() === cKond)
      } catch {
        return false
      }
    }).length
  post(ctxC, { action: 'syncmaster' })
  cek('aturan warna tidak menumpuk (idempoten)', jumlahAturanKita() === 3, `${jumlahAturanKita()} aturan`)
  cek('aturan milik pengguna tidak dihapus', mesinC.getConditionalFormatRules().length > 3, `${mesinC.getConditionalFormatRules().length} aturan total`)

  /* repair juga harus memasang warna (jalur “Perbaiki otomatis”) */
  const envR2 = buatEnv()
  const mesinR = envR2.sheets.Mesin
  const headR = mesinR.grid[0]
  const kdR = headR.findIndex((h) => String(h || '').trim() === 'KONDISI') + 1
  const kcR = headR.findIndex((h) => String(h || '').trim() === 'Kode Unit') + 1
  mesinR.setConditionalFormatRules([
    envR2.sandbox.SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Kritis').setBackground('#00ff00').setRanges([mesinR.getRange(2, kdR, 151, 1)]).build(),
  ])
  const ctxR2 = loadCode(envR2)
  post(ctxR2, { action: 'repair', payload: { sheet: 'master' } })
  const rD2 = mesinR.grid.findIndex((r) => String(r?.[kcR - 1] || '').trim() === 'DEM0074') + 1
  cek('repair juga membetulkan warna KONDISI', mesinR.effective(rD2, kdR).background === '#f4c7c3', `${String(mesinR.cell(rD2, kdR))} → ${mesinR.effective(rD2, kdR).background}`)
}

/* ---------------- ringkasan ---------------- */
console.log('\n' + (gagal ? `❌ ${gagal} pemeriksaan GAGAL` : '✅ semua pemeriksaan LULUS'))
process.exit(gagal ? 1 : 0)

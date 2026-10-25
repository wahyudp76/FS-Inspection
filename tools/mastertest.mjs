/**
 * Uji unit `src/lib/master.js` — aturan merge master ↔ inspeksi.
 * Jalankan: node tools/mastertest.mjs
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

/* src/lib/master.js memakai import tanpa ekstensi (gaya Vite) → bundle dulu untuk Node */
const bundel = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fsi-master-')), 'master.mjs')
execFileSync('npx', ['esbuild', 'src/lib/master.js', '--bundle', '--format=esm', '--platform=node', `--outfile=${bundel}`, '--log-level=error'], {
  cwd: path.join(path.dirname(new URL(import.meta.url).pathname), '..'),
})
const { rekapKomponen, kondisiDari, snapshotMs, terapkanInspeksiTerbaru, ringkasKualitasMaster } = await import(bundel)

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

/* ---------- rekapKomponen ---------- */
cek('rekap: A=100 B=60 C=0', (() => {
  const r = rekapKomponen({ x: 'A', y: 'B', z: 'C', w: 'A' })
  return r.a === 2 && r.b === 1 && r.c === 1 && r.total === 4 && r.score === 65
})(), JSON.stringify(rekapKomponen({ x: 'A', y: 'B', z: 'C', w: 'A' })))
cek('rekap: komponen kosong → 0', (() => {
  const r = rekapKomponen({})
  return r.total === 0 && r.score === 0
})())

/* ---------- kondisiDari ---------- */
cek('kondisi: Rusak selalu Kritis (skor 100)', kondisiDari(100, 'Rusak') === 'Kritis')
cek('kondisi: 95 → Baik', kondisiDari(95, 'Terpasang') === 'Baik')
cek('kondisi: 70 → Perlu Perhatian', kondisiDari(70, 'Standby') === 'Perlu Perhatian')
cek('kondisi: 69,9 → Kritis', kondisiDari(69.9, 'Standby') === 'Kritis')

/* ---------- snapshotMs ---------- */
cek('snapshotMs: ISO valid', snapshotMs('2026-10-23T18:09:52.854Z') === Date.parse('2026-10-23T18:09:52.854Z'))
cek('snapshotMs: kosong → 0', snapshotMs('') === 0 && snapshotMs(undefined) === 0)

/* ---------- fixture ---------- */
const data = {
  generatedAt: '2026-10-23T18:09:52.854Z',
  mesin: [
    { kode: 'M1', status: 'Terpasang', components: { a: 'A', b: 'A' }, a: 2, b: 0, c: 0, total: 2, score: 100, inspeksiTerakhir: '2026-03-05' },
    { kode: 'M2', status: 'Standby', components: { a: 'C', b: 'A' }, a: 1, b: 0, c: 1, total: 2, score: 50, inspeksiTerakhir: '2026-03-05' },
  ],
  irrigator: [{ kode: 'I1', status: 'Terpasang', components: { a: 'B' }, a: 0, b: 1, c: 0, total: 1, score: 60, inspeksiTerakhir: '2026-03-05' }],
}

/* record lebih tua dari snapshot → diabaikan */
const lama = [{ id: 'x1', kode: 'M1', tipe: 'Mesin', tanggal: '2026-10-20', komponen: { a: 'C', b: 'C' }, statusUnit: 'Rusak' }]
const h0 = terapkanInspeksiTerbaru(data, lama)
cek('record ≤ snapshot diabaikan', h0.diterapkan === 0 && h0.mesin[0].score === 100 && !h0.mesin[0].dariInspeksi)

/* record lebih baru → menimpa komponen & ringkasan */
const baru = [{ id: 'x2', kode: 'M1', tipe: 'Mesin', tanggal: '2026-10-24', komponen: { a: 'B', b: 'A' }, statusUnit: 'Rusak' }]
const h1 = terapkanInspeksiTerbaru(data, baru)
const m1 = h1.mesin.find((u) => u.kode === 'M1')
cek('record baru diterapkan', h1.diterapkan === 1 && m1.dariInspeksi === true, `skor ${m1.score}`)
cek('komponen record dipakai', m1.components.a === 'B' && m1.components.b === 'A')
cek('ringkasan dihitung ulang', m1.a === 1 && m1.b === 1 && m1.c === 0 && m1.total === 2 && m1.score === 80)
cek('Rusak ⇒ Kritis meski skor 80', m1.kondisi === 'Kritis' && m1.status === 'Rusak')
cek('tanggal inspeksi terbaru tercatat', m1.inspeksiTerakhir === '2026-10-24' && h1.tanggalTerbaru === '2026-10-24')
cek('unit lain tidak tersentuh', h1.mesin.find((u) => u.kode === 'M2').score === 50 && h1.irrigator[0].score === 60)

/* dua record baru untuk unit sama → yang terbaru menang */
const dua = [
  { id: 'a1', kode: 'M2', tipe: 'Mesin', tanggal: '2026-10-24', komponen: { a: 'C' }, statusUnit: 'Standby' },
  { id: 'a2', kode: 'M2', tipe: 'Mesin', tanggal: '2026-10-25', komponen: { a: 'A' }, statusUnit: 'Standby' },
]
const h2 = terapkanInspeksiTerbaru(data, dua)
cek('record terbaru menang', h2.mesin.find((u) => u.kode === 'M2').score === 100)

/* seri waktu & tanggal sama → id terbesar menang (deterministik) */
const seri = [
  { id: 'FSI-2', kode: 'I1', tipe: 'Irrigator', tanggal: '2026-10-24', komponen: { a: 'A' }, statusUnit: 'Terpasang' },
  { id: 'FSI-9', kode: 'I1', tipe: 'Irrigator', tanggal: '2026-10-24', komponen: { a: 'C' }, statusUnit: 'Terpasang' },
]
const h3 = terapkanInspeksiTerbaru(data, seri)
cek('seri waktu → id terbesar dipakai', h3.irrigator[0].components.a === 'C', `skor ${h3.irrigator[0].score}`)

/* tipe berbeda tidak saling menimpa */
const bedaTipe = [{ id: 'b1', kode: 'M1', tipe: 'Irrigator', tanggal: '2026-10-24', komponen: { a: 'C' }, statusUnit: 'Terpasang' }]
const h4 = terapkanInspeksiTerbaru(data, bedaTipe)
cek('tipe berbeda → tidak menimpa Mesin', h4.diterapkan === 0 && h4.mesin[0].score === 100)
cek('tipe Irrigator dengan kode mesin → dilaporkan kodeBaru', h4.kodeBaru.length === 1 && h4.kodeBaru[0] === 'M1', JSON.stringify(h4.kodeBaru))

/* record tanpa komponen → status & tanggal tetap dipakai, skor lama dipertahankan */
const tanpaKomp = [{ id: 'c1', kode: 'M2', tipe: 'Mesin', tanggal: '2026-10-24', komponen: {}, statusUnit: 'Terpasang' }]
const h5 = terapkanInspeksiTerbaru(data, tanpaKomp)
const m2 = h5.mesin.find((u) => u.kode === 'M2')
cek('record tanpa komponen → skor lama & status baru', m2.score === 50 && m2.status === 'Terpasang' && m2.total === 2)

/* kode asing benar-benar dilaporkan */
const asing = [{ id: 'd1', kode: 'ZZZ9999', tipe: 'Mesin', tanggal: '2026-10-24', komponen: { a: 'A' }, statusUnit: 'Terpasang' }]
const h6 = terapkanInspeksiTerbaru(data, asing)
cek('kode tanpa master masuk kodeBaru', h6.kodeBaru.length === 1 && h6.kodeBaru[0] === 'ZZZ9999', JSON.stringify(h6.kodeBaru))

/* tanggal rusak tidak bikin crash */
const rusak = [{ id: 'e1', kode: 'M1', tipe: 'Mesin', tanggal: 'kemarin', komponen: { a: 'A' }, statusUnit: 'Terpasang' }]
let aman = true
try { terapkanInspeksiTerbaru(data, rusak) } catch (e) { aman = false }
cek('tanggal tak terbaca tidak melempar error', aman)

/* input aneh */
cek('records null aman', (() => { const h = terapkanInspeksiTerbaru(data, null); return h.diterapkan === 0 && h.mesin.length === 2 })())
cek('data kosong aman', (() => { const h = terapkanInspeksiTerbaru({}, []); return h.mesin.length === 0 && h.irrigator.length === 0 })())

/* ---------- ringkasKualitasMaster ---------- */
const kualitas = ringkasKualitasMaster({ mesin: h1.mesin, irrigator: h1.irrigator, diterapkan: h1.diterapkan, kodeBaru: h6.kodeBaru })
const kodeMasalah = kualitas.masalah.map((m) => m.kode)
cek('ringkas kualitas mendeteksi kode asing', kodeMasalah.includes('kode-asing'), kodeMasalah.join(', '))
const kualitasRusak = ringkasKualitasMaster({
  mesin: [{ kode: 'M7', status: 'Rusak', components: { a: 'A' }, score: 100 }],
  irrigator: [],
})
cek('ringkas kualitas mendeteksi Rusak berskor tinggi', kualitasRusak.masalah.map((m) => m.kode).includes('rusak-skor'))
cek('ringkas kualitas bersih untuk data sehat', ringkasKualitasMaster({
  mesin: [{ kode: 'M9', status: 'Terpasang', components: { a: 'A' }, score: 100 }],
  irrigator: [],
}).masalah.length === 0)

/* data asli: snapshot + record asli → tidak boleh ada regresi jumlah unit */
const aset = JSON.parse(fs.readFileSync(new URL('../src/data/assets.json', import.meta.url), 'utf8'))
const hAsli = terapkanInspeksiTerbaru(aset, [])
cek('snapshot asli tetap 151 mesin + 123 irrigator', hAsli.mesin.length === 151 && hAsli.irrigator.length === 123)
const semuaAda = hAsli.mesin.every((u) => u.components && Object.keys(u.components).length > 0)
cek('semua unit punya komponen', semuaAda)

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

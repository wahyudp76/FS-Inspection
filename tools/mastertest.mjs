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
const { rekapKomponen, kondisiDari, snapshotMs, terapkanInspeksiTerbaru, ringkasKualitasMaster, gabungMasterLive, normalStatus } = await import(bundel)

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

/* ---------- normalStatus ---------- */
cek('normal: nilai baku tetap', normalStatus('Terpasang') === 'Terpasang' && normalStatus('Standby') === 'Standby' && normalStatus('Rusak') === 'Rusak')
cek('normal: huruf besar & spasi', normalStatus('  RUSAK ') === 'Rusak' && normalStatus('terpasang') === 'Terpasang', normalStatus('  RUSAK '))
cek('normal: NBSP & spasi ganda', normalStatus('Ter\u00a0pasang') === 'Terpasang' && normalStatus('Stand by') === 'Standby')
cek('normal: rusak/perbaikan dikenali Rusak', normalStatus('Rusak / Perbaikan') === 'Rusak', normalStatus('Rusak / Perbaikan'))
cek('normal: kosong / tak dikenal → kosong', normalStatus('') === '' && normalStatus(null) === '' && normalStatus('Ngawur') === '')

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

/* record yang lebih TUA dari tanggal inspeksi terakhir di master → diabaikan */
const lama = [{ id: 'x1', kode: 'M1', tipe: 'Mesin', tanggal: '2026-02-20', komponen: { a: 'C', b: 'C' }, statusUnit: 'Rusak' }]
const h0 = terapkanInspeksiTerbaru(data, lama)
cek('record lebih tua dari tanggal master diabaikan', h0.diterapkan === 0 && h0.mesin[0].score === 100 && !h0.mesin[0].dariInspeksi,
  `diterapkan ${h0.diterapkan}`)

/* v1.9.1: record yang LEBIH BARU dari master tetapi lebih tua dari build snapshot
   tetap dipakai (dulu ambangnya max(tanggal master, waktu snapshot) → dibuang) */
const antara = [{ id: 'x2', kode: 'M1', tipe: 'Mesin', tanggal: '2026-10-20', komponen: { a: 'C', b: 'A' }, statusUnit: 'Rusak' }]
const hAntara = terapkanInspeksiTerbaru(data, antara)
cek('record di antara tanggal master & build snapshot tetap dipakai', hAntara.diterapkan === 1 && hAntara.mesin[0].status === 'Rusak',
  `diterapkan ${hAntara.diterapkan} · status ${hAntara.mesin[0].status}`)

/* perbaikan manual di master tidak boleh dibatalkan baris inspeksi yang sama tuanya */
const dataBaru = {
  ...data,
  mesin: [
    { ...data.mesin[0], status: 'Terpasang', inspeksiTerakhir: '2026-10-24' },
    data.mesin[1],
  ],
}
/* perbaikan manual di master tidak dibatalkan baris inspeksi LAMA (bertimestamp) */
const lebihTua = [{ id: 'y0', kode: 'M1', tipe: 'Mesin', timestamp: '2026-10-23T03:00:00+07:00', tanggal: '2026-10-23', komponen: { a: 'C' }, statusUnit: 'Rusak' }]
const hTua = terapkanInspeksiTerbaru(dataBaru, lebihTua)
cek('record bertimestamp lebih tua dari master diabaikan', hTua.diterapkan === 0 && hTua.mesin[0].status === 'Terpasang',
  `${hTua.mesin[0].status} · diterapkan ${hTua.diterapkan}`)

/* inspeksi baru setelah tanggal master tetap menang */
const sesudah = [{ id: 'y1', kode: 'M1', tipe: 'Mesin', timestamp: '2026-10-25T08:00:00+07:00', tanggal: '2026-10-25', komponen: { a: 'B' }, statusUnit: 'Terpasang' }]
const hSama = terapkanInspeksiTerbaru(dataBaru, sesudah)
cek('inspeksi setelah tanggal master dipakai', hSama.diterapkan === 1 && hSama.mesin[0].score === 60,
  `skor ${hSama.mesin[0].score} · diterapkan ${hSama.diterapkan}`)

const lebihBaruHari = [{ id: 'y2', kode: 'M1', tipe: 'Mesin', tanggal: '2026-10-26', komponen: { a: 'C' }, statusUnit: 'Rusak' }]
const hBaru = terapkanInspeksiTerbaru(dataBaru, lebihBaruHari)
cek('record lebih baru dari master menang', hBaru.diterapkan === 1 && hBaru.mesin[0].status === 'Rusak' && hBaru.mesin[0].score === 0,
  `${hBaru.mesin[0].status} · skor ${hBaru.mesin[0].score}`)

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

/* ---------- gabungMasterLive (master live dari sheet) ---------- */
const live = {
  rev: 'x',
  generatedAt: '2026-10-25T10:00:00.000Z',
  kmap: { Mesin: ['a', 'b'], Irrigator: ['a'] },
  mesin: [['M1', 'PG2', 'Cat 3306', 'SPC', 'Terpasang', 'AA', '2026-10-24', 'Pump X', '150', 'Sumur', 'Tebu', '']],
  irrigator: [],
}
const g1 = gabungMasterLive(data, live)
const m1g = g1.mesin.find((u) => u.kode === 'M1')
cek('gabung: status master menimpa snapshot', m1g.status === 'Terpasang' && m1g.kondisi === 'Baik', `${m1g.status}/${m1g.kondisi}`)
cek('gabung: komponen master dipakai', m1g.components.a === 'A' && m1g.components.b === 'A' && m1g.total === 2)
cek('gabung: metadata master terbawa', m1g.pump === 'Pump X' && m1g.power === '150' && m1g.komoditi === 'Tebu')
cek('gabung: unit di luar master tetap ada', g1.mesin.length === 2 && g1.unitHilang[0] === 'M2', JSON.stringify(g1.unitHilang))
cek('gabung: ditandai dari master live', m1g.dariMasterLive === true && g1.diterapkan === 1)

const liveTambahan = {
  ...live,
  mesin: [...live.mesin, ['M3', 'FM4', 'Baru', 'DEC', 'Standby', 'A-', '2026-10-20']],
}
const g2 = gabungMasterLive(data, liveTambahan)
cek('gabung: unit baru dari master ditambahkan', g2.mesin.some((u) => u.kode === 'M3') && g2.unitBaru.includes('M3'),
  JSON.stringify(g2.unitBaru))
cek('gabung: tanpa master live → snapshot apa adanya', gabungMasterLive(data, null).mesin.length === 2)

/* bentuk lama (objek) tetap didukung supaya Apps Script versi lama tidak merusak tampilan */
const liveLama = {
  mesin: [{ kode: 'M1', wilayah: 'PG2', spec: 'Cat 3306', status: 'RUSAK', components: { a: 'C', b: 'C' } }],
  irrigator: [],
}
const g3 = gabungMasterLive(data, liveLama)
const m1l = g3.mesin.find((u) => u.kode === 'M1')
cek('gabung: bentuk objek lama didukung + status dinormalkan', m1l.status === 'Rusak' && m1l.score === 0 && m1l.kondisi === 'Kritis',
  `${m1l.status} · skor ${m1l.score} · ${m1l.kondisi}`)
cek('gabung: master unchanged → snapshot apa adanya', gabungMasterLive(data, { unchanged: true }).diterapkan === 0)

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
/* ---------- v1.9.1: status master tidak boleh dibatalkan inspeksi lama ---------- */
{
  const aset = {
    generatedAt: '2026-10-23T18:09:52.854Z',
    mesin: [{ id: 'M-DEM0074', kode: 'DEM0074', wilayah: 'OP2', status: 'Standby', components: { Mesin: 'C', Accu: 'A' }, a: 1, b: 0, c: 1, total: 2, score: 50 }],
    irrigator: [],
  }
  const live = {
    rev: 'x',
    generatedAt: '2026-10-27T00:00:00Z',
    kmap: { Mesin: ['Mesin', 'Accu'], Irrigator: [] },
    mesin: [['DEM0074', 'OP2', 'MITS. 6D19T', 'DEM', 'Rusak', 'CA', '2026-03-05', '', '220', 'Sumur', '', '']],
    irrigator: [],
  }
  const recHariSama = {
    id: 'FSI-INIT-Mesin-DEM0074', tipe: 'Mesin', kode: 'DEM0074', statusUnit: 'Terpasang',
    tanggal: '2026-03-05', timestamp: '2026-03-05T09:42:00+07:00', komponen: { Mesin: 'C', Accu: 'A' }, skor: 50,
  }
  const g = gabungMasterLive(aset, live)
  cek('master live: status master dipakai', g.mesin[0].status === 'Rusak', g.mesin[0].status)
  const out = terapkanInspeksiTerbaru({ ...g, generatedAt: g.generatedAt }, [recHariSama])
  cek('inspeksi di HARI yang sama tidak menimpa status master', out.mesin[0].status === 'Rusak', out.mesin[0].status)
  cek('kondisi mengikuti status master (Rusak ⇒ Kritis)', out.mesin[0].kondisi === 'Kritis', out.mesin[0].kondisi)

  /* inspeksi satu hari setelah tanggal master → HARUS menang */
  const recBesok = { ...recHariSama, id: 'FSI-NEW', tanggal: '2026-03-06', timestamp: '2026-03-06T08:00:00+07:00', statusUnit: 'Terpasang' }
  const out2 = terapkanInspeksiTerbaru({ ...g, generatedAt: g.generatedAt }, [recBesok])
  cek('inspeksi hari berikutnya menimpa master', out2.mesin[0].status === 'Terpasang', out2.mesin[0].status)

  /* record lebih baru dari master tetapi lebih lama dari build snapshot → dulu dibuang */
  const recAntara = { ...recHariSama, id: 'FSI-MID', tanggal: '2026-06-01', timestamp: '2026-06-01T08:00:00+07:00', statusUnit: 'Standby' }
  const out3 = terapkanInspeksiTerbaru({ ...g, generatedAt: g.generatedAt }, [recAntara])
  cek('record antara tanggal master & snapshot tetap dipakai', out3.mesin[0].status === 'Standby', out3.mesin[0].status)
}


console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

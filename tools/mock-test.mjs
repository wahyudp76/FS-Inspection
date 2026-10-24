import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { makeEnv, loadCode, post, rowCount } from './mock.gs.mjs'

const T = (name, ok, extra = '') => console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`)
let fail = 0
const check = (n, ok, x = '') => { if (!ok) fail++; T(n, ok, x) }

const env = makeEnv()
const ctx = loadCode(env)

/* ---------------- 1. ping ---------------- */
const ping = post(ctx, { action: 'ping' })
check('ping balas ok', ping.ok === true, `versi ${ping.version}, ${ping.records} baris`)

/* ---------------- 2. history: bentuk data ---------------- */
const h1 = post(ctx, { action: 'history', payload: {} })
check('history tanpa rev → data penuh', Array.isArray(h1.records) && h1.records.length > 0, `${h1.records.length} record, ${(JSON.stringify(h1).length / 1024).toFixed(0)} KB, rev=${h1.rev}`)
const isoOk = h1.records.every((r) => /T.*\+07:00$/.test(r.timestamp) || /^\d{4}-\d{2}-\d{2}$/.test(r.timestamp))
check('semua timestamp ISO +07:00 (aman Safari)', isoOk, `contoh: ${h1.records[0].timestamp}`)
const descOk = h1.records.every((r, i) => i === 0 || new Date(h1.records[i - 1].timestamp) >= new Date(r.timestamp))
check('urutan terbaru→terlama', descOk)
check('kompresi komponen aktif', h1.compressed === true && typeof h1.records[0].k === 'string', `kmap Mesin ${h1.kmap.Mesin.length} komponen`)
check('payload ramping (tanpa komponen kosong)', h1.records.filter((r) => r.komponen && Object.keys(r.komponen).length === 0).length === 0,
  `${(JSON.stringify(h1).length / 1024).toFixed(0)} KB`)

/* ---------------- 3. rev: request kedua murah ---------------- */
const h2 = post(ctx, { action: 'history', payload: { rev: h1.rev } })
check('rev sama → unchanged (payload kecil)', h2.unchanged === true, `${JSON.stringify(h2).length} byte vs ${JSON.stringify(h1).length} byte`)

/* ---------------- 4. submit: idempoten ---------------- */
const before = rowCount(env.sheet)
const payload = {
  clientId: 'FSI-TEST-1',
  tipe: 'Mesin', kode: 'BTI0027', wilayah: 'ZPAS637', unitJenis: 'BTI', spec: 'X',
  statusUnit: 'Baik', tanggal: '2026-10-24', inspector: 'Audit Bot',
  komponen: { Accu: 'B', 'V Belt Altenator': 'C' }, a: 1, b: 1, c: 1, total: 3, skor: 53.3,
}
const s1 = post(ctx, { action: 'submit', payload })
const s2 = post(ctx, { action: 'submit', payload })
const after = rowCount(env.sheet)
check('submit pertama menambah 1 baris', s1.ok && after === before + 1, `${before} → ${after}`)
check('submit ulang (retry) TIDAK menambah baris', s2.ok && s2.record.duplicate === true && rowCount(env.sheet) === after, `duplikat ditandai`)
check('timestamp hasil submit = format history', /\+07:00$/.test(s1.record.timestamp), s1.record.timestamp)
check('komponen tersimpan', s1.record.komponen.Accu === 'B')

/* ---------------- 5. rev berubah setelah submit ---------------- */
const h3 = post(ctx, { action: 'history', payload: { rev: h1.rev } })
check('rev berubah setelah submit → data baru dikirim', !h3.unchanged && h3.records.length === h1.records.length + 1, `${h3.records.length} record`)
check('record terbaru = inspeksi baru', h3.records[0].kode === 'BTI0027' && h3.records[0].inspector === 'Audit Bot', h3.records[0].timestamp)

/* ---------------- 6. urutan "inspeksi terakhir" untuk jam tidak berpadding ---------------- */
const env2 = makeEnv()
/* tambahkan dua baris tanggal sama: 9:14 dan 10:00 (kasus bug leksikografis) */
const header = env2.sheet.grid[0]
const mk = (id, ts) => {
  const row = header.map((h, i) => {
    if (i === 0) return id
    if (i === 1) return '2026-03-05'
    if (i === 2) return ts
    if (header[i] === 'Tipe Aset') return 'Mesin'
    if (header[i] === 'Kode Unit') return 'ORD001'
    return ''
  })
  env2.sheet.appendRow(row)
  env2.state.modified += 1000
}
// hapus baris master ORD001 supaya bersih
const ctx2 = loadCode(env2)
mk('FSI-ORD-EARLY', '2026-03-05 9:14:00')
mk('FSI-ORD-LATE', '2026-03-05 10:00:00')
const h4 = post(ctx2, { action: 'history', payload: {} })
const ord = h4.records.filter((r) => r.kode === 'ORD001')
check('10:00 dianggap lebih baru dari 9:14', ord[0].id === 'FSI-ORD-LATE', `${ord[0].timestamp} vs ${ord[1].timestamp}`)

/* ---------------- 7. tanggal Date asli dari sheet ---------------- */
check('formatIso_ konsisten utk objek Date', ctx2.formatIso_(new Date('2026-03-05T03:00:00Z')) === '2026-03-05T10:00:00+07:00', ctx2.formatIso_(new Date('2026-03-05T03:00:00Z')))
check('isoDariTeks_ menormalkan teks lokal', ctx2.isoDariTeks_('2026-03-05 7:00:00') === '2026-03-05T07:00:00+07:00')


/* ---------------- 8. uji bolak-balik kompresi klien (lossless) ---------------- */
const { expandRecords } = await import('../src/lib/compress.js')
const plain = post(ctx, { action: 'history', payload: { plain: true } })
const packed = post(ctx, { action: 'history', payload: {} })
const expanded = expandRecords(packed.records, packed.kmap)
const key = (r) => `${r.id}|${Object.entries(r.komponen || {}).sort().map(([k, v]) => k + v).join(',')}`
const setPlain = new Set(plain.records.map(key))
const mismatch = expanded.filter((r) => !setPlain.has(key(r)))
check('kompresi lossless (komponen identik setelah dikembangkan)', mismatch.length === 0, `${expanded.length} record, ${mismatch.length} beda`)
console.log(`\nUkuran payload: penuh ${(JSON.stringify(plain).length / 1024).toFixed(0)} KB → terkompresi ${(JSON.stringify(packed).length / 1024).toFixed(0)} KB`)

console.log(fail === 0 ? '\nSEMUA UJI LULUS' : `\n${fail} UJI GAGAL`)
process.exit(fail === 0 ? 0 : 1)

/**
 * Uji penulisan “Catat Service” ke spreadsheet (tb_service2 / sheet "Monitor Kasie FS").
 *
 * Kasus yang dijaga:
 *  1. Sheet berlokal Indonesia (desimal koma) → pemisah argumen rumus harus `;`.
 *     Dulu ditulis `=ROUNDUP(DAY(C)/7,0)` sehingga kolom D/E/F jadi #ERROR!.
 *  2. Sheet berlokal Inggris → pemisah `,`.
 *  3. Baris yang sudah telanjur error bisa dibetulkan lewat aksi `svcrepair`.
 *  4. Setelah diperbaiki, penulisan baru selalu bersih (idempoten, tidak ada #ERROR!).
 *
 * Jalankan: DATA_DIR=/home/user/data node tools/svcrumus.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA = process.env.DATA_DIR || '/home/user/data'
const SVC = process.env.SVC_DIR || '/home/user/data2'
process.env.DI_CSV = process.env.DI_CSV || path.join(DATA, 'di.csv')

const { makeEnv, loadCode, post, parseCSV } = await import('./mock.gs.mjs')

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

function sheetDariCSV(nama, file, locale) {
  const rows = parseCSV(fs.readFileSync(file, 'utf8')).filter((r) => r.some((v) => v !== ''))
  const sh = makeEnv({ locale }).ss.insertSheet(nama)
  rows.forEach((line, r) => line.forEach((v, c) => sh.setCell(r + 1, c + 1, v)))
  return sh
}

const buatDunia = (locale) => {
  const env = makeEnv({ locale })
  const ctx = loadCode(env)
  const log = sheetDariCSV('Monitor Kasie FS', path.join(SVC, 'Monitor_Kasie_FS.csv'), locale)
  const evalSh = sheetDariCSV('Data Service Engine', path.join(SVC, 'Data_Service_Engine.csv'), locale)
  log.parent = env.ss
  evalSh.parent = env.ss
  env.sheets['Monitor Kasie FS'] = log
  env.sheets['Data Service Engine'] = evalSh
  return { env, ctx, log, evalSh }
}

/* ---------- 1. sheet lokal Indonesia: baris lama error ---------- */
{
  const { env, ctx, log } = buatDunia('id_ID')
  const hdr = 1
  const last = log.getLastRow()
  /* rusak-kan 5 baris terakhir seperti kasus nyata (#ERROR!) */
  for (let r = last - 4; r <= last; r++) {
    log.setCell(r, 4, '#ERROR!')
    log.setCell(r, 5, '#ERROR!')
    log.setCell(r, 6, '#ERROR!')
  }

  const rep = post(ctx, { action: 'svcrepair' })
  cek('svcrepair balas ok', rep.ok === true)
  cek('svcrepair memperbaiki 5 baris error', rep.result.diperbaiki >= 5, JSON.stringify(rep.result))
  cek('pemisah yang dipakai = titik koma', rep.result.pemisah === ';', String(rep.result.pemisah))

  let errSisa = 0
  for (let r = hdr + 1; r <= log.getLastRow(); r++) {
    for (const c of [4, 5, 6]) if (String(log.cell(r, c)).startsWith('#')) errSisa++
  }
  cek('tidak ada #ERROR! tersisa di kolom D/E/F', errSisa === 0, `${errSisa} sel`)

  /* catat service baru dari web */
  const rec = post(ctx, { action: 'svcrecord', payload: { kode: 'DEC0004', tanggal: '2026-10-25', hm: 9999, posisi: 'FM4' } })
  cek('svcrecord balas ok', rec.ok === true, JSON.stringify(rec.result && { baris: rec.result.baris, no: rec.result.no }))
  const baris = rec.result.baris
  const v = [log.cell(baris, 4), log.cell(baris, 5), log.cell(baris, 6)]
  cek('baris baru tidak error', !v.some((x) => String(x).startsWith('#')), JSON.stringify(v))
  cek('Month terisi 10', Number(v[0]) === 10, String(v[0]))
  cek('Bulan Service = Oktober', String(v[1]).toLowerCase() === 'oktober', String(v[1]))
  cek('Minggu Service = 4 (25 Okt)', Number(v[2]) === 4, String(v[2]))

  const f4 = String(log.formula(baris, 4))
  const f5 = String(log.formula(baris, 5))
  const f6 = String(log.formula(baris, 6))
  cek('kolom D tetap berupa rumus (=MONTH)', f4.startsWith('=MONTH'), f4)
  cek('kolom E memakai pemisah titik koma', f5.includes(';') && !f5.includes(','), f5)
  cek('kolom F memakai pemisah titik koma', f6.includes(';') && !f6.includes(','), f6)

  const lagi = post(ctx, { action: 'svcrecord', payload: { kode: 'DEC0004', tanggal: '2026-10-25', hm: 9999 } })
  cek('catat dua kali → dianggap duplikat', lagi.result.duplikat === true, JSON.stringify({ duplikat: lagi.result.duplikat }))

  const rep2 = post(ctx, { action: 'svcrepair' })
  cek('svcrepair kedua idempoten', rep2.result.diperbaiki === 0, JSON.stringify(rep2.result))
}

/* ---------- 2. sheet berlokal Inggris: pemisah koma ---------- */
{
  const { ctx, log } = buatDunia('en_US')
  const rec = post(ctx, { action: 'svcrecord', payload: { kode: 'DEC0030', tanggal: '2026-10-08', hm: 5555, posisi: 'PG2' } })
  const baris = rec.result.baris
  const f6 = String(log.formula(baris, 6))
  cek('lokal Inggris: kolom F memakai pemisah koma', f6.includes(',') && !f6.includes(';'), f6)
  const v = [log.cell(baris, 4), log.cell(baris, 5), log.cell(baris, 6)]
  cek('lokal Inggris: nilai D/E/F benar', Number(v[0]) === 10 && Number(v[2]) === 2 && !String(v[1]).startsWith('#'), JSON.stringify(v))
}

/* ---------- 3. rumus benar-benar ditolak → jatuh ke nilai jadi ---------- */
{
  const { env, ctx, log } = buatDunia('id_ID')
  /* buat sheet yang menolak semua rumus (evaluator selalu #ERROR!) */
  log.cell = function (r, c) {
    const line = this.grid[r - 1]
    const v = line && line[c - 1] !== undefined ? line[c - 1] : ''
    if (typeof v === 'string' && v.charAt(0) === '=') return '#ERROR!'
    return v
  }
  const rec = post(ctx, { action: 'svcrecord', payload: { kode: 'DEC0035', tanggal: '2026-10-25', hm: 4321 } })
  const baris = rec.result.baris
  const v = [log.cell(baris, 4), log.cell(baris, 5), log.cell(baris, 6)]
  cek('fallback: kolom D/E/F berisi nilai (bukan #ERROR!)', !v.some((x) => String(x).startsWith('#')), JSON.stringify(v))
  cek('fallback: nilai tetap benar', Number(v[0]) === 10 && String(v[1]).toLowerCase() === 'oktober' && Number(v[2]) === 4, JSON.stringify(v))
  cek('fallback: catatan tetap sukses', rec.ok === true && rec.result.baris > 0)
}

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

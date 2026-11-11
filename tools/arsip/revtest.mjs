/**
 * revtest.mjs — regresi bug “sudah tekan Sinkron, status unit tidak berubah”.
 *
 * Akar masalah (v1.9.1 ke bawah):
 *   `rev` (sidik jari data) dihitung dari **waktu modifikasi file** lewat
 *   DriveApp.getLastUpdated() + jumlah baris. Bila DriveApp lambat atau gagal
 *   (segel = 0), mengubah satu sel Status TIDAK mengubah rev → server selalu
 *   menjawab `unchanged` → web memakai cache lama selamanya.
 *
 * Uji ini membuktikan:
 *   1. mengubah status di sheet master mengubah `rev` → data baru terkirim;
 *   2. hal yang sama berlaku untuk sheet “Data Inspeksi”;
 *   3. skenario DriveApp gagal total (getLastUpdated melempar error) TETAP
 *      mengirim data baru;
 *   4. mengirim `rev` kosong (tombol Sinkron) selalu menghasilkan data penuh;
 *   5. rev kembali sama → `unchanged` (optimasi masih bekerja).
 *
 * Jalankan: node tools/revtest.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { makeEnv, loadCode, post, parseCSV } from './mock.gs.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA = path.join(HERE, '../data')

let gagal = 0
const cek = (nama, ok, extra = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${extra ? ' — ' + extra : ''}`)
}
const baca = (f) => parseCSV(fs.readFileSync(path.join(DATA, f), 'utf8')).filter((r) => r.some((v) => v !== ''))

function buatEnv({ driveRusak = false } = {}) {
  const env = makeEnv()
  for (const [nama, berkas] of [['Mesin', 'src_Mesin.csv'], ['Irrigator', 'src_Irrigator.csv']]) {
    const sh = env.ss.insertSheet(nama)
    sh.grid = baca(berkas).map((r) => [...r])
  }
  if (driveRusak) {
    /* meniru kondisi nyata: izin Drive tidak ada / layanan sedang error */
    env.sandbox.DriveApp = { getFileById: () => { throw new Error('DriveApp tidak tersedia (simulasi)') } }
  }
  const ctx = loadCode(env)
  return { env, ctx }
}

const PETA_SHEET = { Mesin: 'src_Mesin.csv', Irrigator: 'src_Irrigator.csv' }

/** Kolom “Status” pada sheet master tiruan. */
function kolomStatus(csv) {
  const h = baca(csv)[0].map((x) => x.trim())
  return h.findIndex((x) => x.toUpperCase() === 'STATUS') + 1
}
function setStatusMaster(env, tipe, kode, nilai) {
  const sh = env.ss.getSheetByName(tipe)
  const col = kolomStatus(PETA_SHEET[tipe])
  const baris = sh.grid.findIndex((r, i) => i > 0 && String(r[1] || '').trim().toUpperCase() === kode)
  if (baris < 0) throw new Error('kode tidak ditemukan: ' + kode)
  sh.grid[baris][col - 1] = nilai
}
const statusDariMaster = (json, kode) => {
  const i = (json.result?.mesin || []).findIndex((r) => String(r[0]).trim().toUpperCase() === kode)
  return i < 0 ? '(tidak ada)' : json.result.mesin[i][4]
}

/* ================= 1. master: isi berubah → rev berubah ================= */
{
  const { env, ctx } = buatEnv()
  const a = post(ctx, { action: 'master', payload: { rev: '' } })
  const rev1 = a.result.rev
  cek('master: permintaan pertama mengirim 274 unit', (a.result.mesin.length + a.result.irrigator.length) === 274,
    `${a.result.mesin.length} mesin + ${a.result.irrigator.length} irrigator`)

  const b = post(ctx, { action: 'master', payload: { rev: rev1 } })
  cek('master: rev sama → jawaban “unchanged” (optimasi tetap ada)', b.result?.unchanged === true)

  /* balik status ke nilai lain (jangan asumsikan nilai awal sheet) */
  const nilaiBaru = statusDariMaster(a, 'SPC0224') === 'Rusak' ? 'Terpasang' : 'Rusak'
  setStatusMaster(env, 'Mesin', 'SPC0224', nilaiBaru)
  const c = post(ctx, { action: 'master', payload: { rev: rev1 } })
  cek('master: status diubah → TIDAK “unchanged”, data baru dikirim', c.result?.unchanged !== true,
    JSON.stringify(c.result?.unchanged ?? false))
  cek(`master: status baru (SPC0224 = ${nilaiBaru}) sampai ke klien`, statusDariMaster(c, 'SPC0224') === nilaiBaru,
    statusDariMaster(c, 'SPC0224'))
  cek('master: rev ikut berubah', c.result.rev !== rev1, `${rev1} → ${c.result.rev}`)

  const d = post(ctx, { action: 'master', payload: { rev: c.result.rev } })
  cek('master: rev baru dikirim balik → “unchanged” lagi', d.result?.unchanged === true)
}

/* ================= 2. DriveApp error total: tetap terdeteksi ================= */
{
  const { env, ctx } = buatEnv({ driveRusak: true })
  const a = post(ctx, { action: 'master', payload: { rev: '' } })
  const nilaiBaru = statusDariMaster(a, 'DEM0074') === 'Standby' ? 'Rusak' : 'Standby'
  setStatusMaster(env, 'Mesin', 'DEM0074', nilaiBaru)
  const b = post(ctx, { action: 'master', payload: { rev: a.result.rev } })
  cek('DriveApp error: perubahan status tetap terkirim (dulu macet selamanya)', b.result?.unchanged !== true)
  cek(`DriveApp error: unit mengikuti sheet (${nilaiBaru})`, statusDariMaster(b, 'DEM0074') === nilaiBaru, statusDariMaster(b, 'DEM0074'))
}

/* ================= 3. tombol Sinkron = rev kosong → selalu penuh ================= */
{
  const { ctx } = buatEnv()
  const a = post(ctx, { action: 'master', payload: { rev: '' } })
  const b = post(ctx, { action: 'master', payload: { rev: '' } })
  cek('Sinkron (rev kosong) selalu dapat data penuh, walau isi sama',
    b.result?.unchanged !== true && (b.result.mesin.length + b.result.irrigator.length) === 274)
  cek('Sinkron: rev penuh sama dengan permintaan pertama', b.result.rev === a.result.rev)
}

/* ================= 4. history: ubah sel → terdeteksi ================= */
{
  const { env, ctx } = buatEnv()
  const a = post(ctx, { action: 'history', payload: { rev: '' } })
  const rev1 = a.rev
  const b = post(ctx, { action: 'history', payload: { rev: rev1 } })
  cek('history: rev sama → “unchanged”', b.unchanged === true, `${a.count} baris`)

  /* Ubah kondisi satu baris langsung di sheet (meniru suntingan manual pengguna) */
  const sh = env.sheet
  const head = sh.grid[0].map((x) => String(x).trim())
  const colKondisi = head.indexOf('Kondisi') + 1
  const colId = head.indexOf('ID Inspeksi') + 1
  const baris = sh.grid.findIndex((r, i) => i > 0 && String(r[colId - 1] || '').includes('SPC0224'))
  if (baris < 0) throw new Error('baris SPC0224 tidak ada di Data Inspeksi')
  sh.grid[baris][colKondisi - 1] = String(sh.grid[baris][colKondisi - 1]).trim() === 'Baik' ? 'Kritis' : 'Baik'

  const c = post(ctx, { action: 'history', payload: { rev: rev1 } })
  cek('history: satu sel diubah → TIDAK “unchanged”', c.unchanged !== true, c.rev)
  cek('history: rev berubah', c.rev !== rev1, `${rev1} → ${c.rev}`)
}

/* ================= 5. DriveApp error juga tidak memblokir history ================= */
{
  const { env, ctx } = buatEnv({ driveRusak: true })
  const a = post(ctx, { action: 'history', payload: { rev: '' } })
  const sh = env.sheet
  const head = sh.grid[0].map((x) => String(x).trim())
  sh.grid[1][head.indexOf('Kondisi')] = 'Perlu Perhatian'
  const b = post(ctx, { action: 'history', payload: { rev: a.rev } })
  cek('DriveApp error: suntingan Data Inspeksi tetap terkirim', b.unchanged !== true)
}

console.log(gagal ? `\n❌ ${gagal} pemeriksaan GAGAL` : '\n✅ semua pemeriksaan rev/cache LULUS')
process.exit(gagal ? 1 : 0)

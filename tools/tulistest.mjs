/**
 * tulistest.mjs — uji arah **web → sheet**: Sinkron menulis ulang ringkasan
 * master (A/B/C, skor, KONDISI) dan menegakkan aturan **Status “Rusak” ⇒ KONDISI “Kritis”**.
 *
 * Keluhan yang diuji: SPC0224 berstatus “Rusak” di sheet Mesin tetapi kolom
 * KONDISI-nya masih “Baik”. Setelah Sinkron, KONDISI harus menjadi “Kritis”
 * (dan tetap Kritis walau dijalankan berkali-kali).
 *
 * Jalankan: node tools/tulistest.mjs
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

const env = makeEnv()
for (const [nama, berkas] of [['Mesin', 'src_Mesin.csv'], ['Irrigator', 'src_Irrigator.csv']]) {
  const sh = env.ss.insertSheet(nama)
  sh.grid = baca(berkas).map((r) => [...r])
}
const ctx = loadCode(env)

/* ---- pembaca/penulis sel pada sheet master tiruan ---- */
const sheet = (n) => env.ss.getSheetByName(n)
const kolom = (n, nama) => sheet(n).grid[0].map((x) => String(x).trim()).findIndex((x) => x.toUpperCase() === nama.toUpperCase())
const barisKode = (n, kode) =>
  sheet(n).grid.findIndex((r, i) => i > 0 && String(r[1] || '').trim().toUpperCase() === kode)
const bacaSel = (n, kode, nama) => sheet(n).grid[barisKode(n, kode)][kolom(n, nama)]
const tulisSel = (n, kode, nama, v) => { sheet(n).grid[barisKode(n, kode)][kolom(n, nama)] = v }
const snapshotKondisi = (n) => sheet(n).grid.slice(1).map((r) => String(r[kolom(n, 'KONDISI')] || ''))

/* ---- 1. keadaan awal: status Rusak, KONDISI masih Baik (seperti sheet pengguna) ---- */
tulisSel('Mesin', 'SPC0224', 'Status', 'Rusak')
tulisSel('Mesin', 'SPC0224', 'KONDISI', 'Baik')
cek('awal: SPC0224 = Rusak / Baik (data bermasalah seperti di sheet)', bacaSel('Mesin', 'SPC0224', 'KONDISI') === 'Baik')

/* ---- 2. unit tanpa riwayat inspeksi + status Rusak (jaring pengaman) ---- */
{
  const mesin = sheet('Mesin')
  const head = mesin.grid[0]
  const barisBaru = new Array(head.length).fill('')
  barisBaru[kolom('Mesin', 'Kode Unit')] = 'ZZTEST1'
  barisBaru[kolom('Mesin', 'Jenis')] = 'ZZT'
  barisBaru[kolom('Mesin', 'Status')] = 'Rusak'
  barisBaru[kolom('Mesin', 'KONDISI')] = 'Baik'
  mesin.grid.push(barisBaru)
}

/* ---- 3. jalankan Sinkron (aksi syncmaster) ---- */
const hasil = post(ctx, { action: 'syncmaster' })
cek('syncmaster berhasil dijalankan', hasil.ok === true && Array.isArray(hasil.result), (hasil.result || []).join(' · ').slice(0, 120))

cek('SPC0224: KONDISI menjadi Kritis setelah Sinkron', bacaSel('Mesin', 'SPC0224', 'KONDISI') === 'Kritis',
  `Rusak / ${bacaSel('Mesin', 'SPC0224', 'KONDISI')}`)
cek('unit tanpa riwayat + status Rusak juga dipaksa Kritis', bacaSel('Mesin', 'ZZTEST1', 'KONDISI') === 'Kritis',
  String(bacaSel('Mesin', 'ZZTEST1', 'KONDISI')))

/* ---- 4. aturan tidak merusak unit lain: status bukan Rusak dibiarkan ---- */
{
  const salah = sheet('Mesin').grid.slice(1).filter((r) => {
    const st = String(r[kolom('Mesin', 'Status')] || '').trim().toLowerCase()
    const kd = String(r[kolom('Mesin', 'KONDISI')] || '').trim()
    return st !== 'rusak' && kd === 'Kritis' && String(r[kolom('Mesin', 'Kode Unit')]).trim() !== 'ZZTEST1'
  })
  cek('unit berstatus Terpasang/Standby tidak dipaksa Kritis', salah.length === 0, `${salah.length} unit`)
}

/* ---- 5. idempoten: jalankan lagi, isi tidak berubah ---- */
{
  const sebelum = snapshotKondisi('Mesin')
  const h2 = post(ctx, { action: 'syncmaster' })
  const sesudah = snapshotKondisi('Mesin')
  cek('Sinkron kedua: hasil identik (idempoten)', JSON.stringify(sebelum) === JSON.stringify(sesudah))
  cek('Sinkron kedua tetap melaporkan sukses', h2.ok === true)
}

/* ---- 6. Irrigator: aturan sama ---- */
{
  const kode = String(sheet('Irrigator').grid[1][1] || '').trim()
  tulisSel('Irrigator', kode, 'Status', 'Rusak')
  tulisSel('Irrigator', kode, 'KONDISI', 'Baik')
  post(ctx, { action: 'syncmaster' })
  cek(`Irrigator (${kode}): Rusak ⇒ Kritis`, bacaSel('Irrigator', kode, 'KONDISI') === 'Kritis', String(bacaSel('Irrigator', kode, 'KONDISI')))
}

/* ---- 7. audit tidak lagi melaporkan pelanggaran aturan Rusak ⇒ Kritis ---- */
{
  const a = post(ctx, { action: 'audit' })
  cek('audit: 0 pelanggaran “kondisi” di Data Inspeksi', (a.result?.hitung?.kondisi || 0) === 0, String(a.result?.hitung?.kondisi))
}

console.log(gagal ? `\n❌ ${gagal} pemeriksaan GAGAL` : '\n✅ Sinkron menulis ringkasan master + aturan Rusak ⇒ Kritis LULUS')
process.exit(gagal ? 1 : 0)

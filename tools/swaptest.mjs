/**
 * UJI TUKAR UNIT (engine & irrigator)
 *
 * Memeriksa fitur rotasi aset dari UI sampai sheet:
 *   1. halaman Tukar Unit tampil (KPI standby, kartu divisi, riwayat)
 *   2. tukar dengan pengganti dari STOCK STANDBY → Status/Wilayah berubah di master
 *   3. tukar dengan pengganti dari LOKASI LAIN (relokasi) → lokasi asal dilaporkan kosong
 *   4. validasi: unit keluar yang bukan Terpasang ditolak dengan pesan jelas
 *   5. riwayat bertambah & terbaca lagi setelah dimuat ulang
 *   6. tukar untuk tipe Irrigator juga jalan
 *   7. tanpa error JavaScript (desktop & HP)
 *
 * Pakai (Vite :5199 → mock :8111, MASTER=1 TESTHOOK=1):
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/swaptest.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'

let gagal = 0
const cek = (ok, nama, catatan = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${catatan ? ` — ${catatan}` : ''}`)
  if (!ok) gagal++
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms))

async function api(body) {
  const r = await fetch(EP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
    redirect: 'follow',
  })
  return r.json()
}

const master = async () => (await api({ action: 'master' })).result
const cariUnit = (m, tipe, kode) => {
  const arr = tipe === 'Mesin' ? m.mesin : m.irrigator
  const r = arr.find((x) => x[0] === kode)
  return r ? { kode: r[0], wilayah: r[1], status: r[4] } : null
}

async function jalankan() {
  /* mock menyimpan sel di memori — mulai dari CSV asli supaya hasilnya konsisten */
  try {
    const r = await fetch(EP.replace(/\/exec.*$/, '') + '/__reset')
    if (r.ok) console.log('(mock dimuat ulang dari CSV)')
  } catch {}

  /* siapkan data: satu unit terpasang + satu unit standby untuk Mesin */
  const awal = await master()
  const mesin = awal.mesin.map((r) => ({ kode: r[0], wilayah: r[1], status: r[4] }))
  const keluarM = mesin.filter((u) => u.status === 'Terpasang')[0]
  const standbyM = mesin.filter((u) => u.status === 'Standby')[0]
  const irr = awal.irrigator.map((r) => ({ kode: r[0], wilayah: r[1], status: r[4] }))
  const keluarI = irr.filter((u) => u.status === 'Terpasang')[0]
  const standbyI = irr.filter((u) => u.status === 'Standby')[0]

  const riwayatAwal = (await api({ action: 'swapread' })).result.jumlah

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Jakarta' })
  const galat = []
  page.on('pageerror', (e) => galat.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') galat.push(`console: ${m.text()}`)
  })
  /* konfirmasi “yakin menulis ke sheet master?” selalu dijawab OK */
  page.on('dialog', (d) => d.accept())

  await page.addInitScript((ep) => {
    localStorage.clear()
    localStorage.setItem('fsi:endpoint', ep)
  }, EP)

  await page.goto(`${BASE}/#/tukar`, { waitUntil: 'networkidle' })
  await tidur(6000)

  const teksHalaman = await page.evaluate(() => document.body.innerText)
  cek(/Tukar Unit/.test(teksHalaman), 'halaman Tukar Unit terbuka')
  cek(/standby engine/i.test(teksHalaman) && /standby irrigator/i.test(teksHalaman), 'KPI stock standby tampil')
  cek(/Kesiapan Unit per Divisi/.test(teksHalaman), 'kartu kesiapan per divisi tampil')
  cek(/Riwayat Tukar Unit/.test(teksHalaman), 'panel riwayat tukar tampil')

  /* ---------------- 1. tukar Mesin dari stock Standby ---------------- */
  await page.getByRole('button', { name: /^Tukar Unit$/ }).first().click()
  await tidur(900)
  const dialog = page.getByRole('dialog', { name: /Tukar unit aset/i })
  cek((await dialog.count()) === 1, 'pop-up tukar unit terbuka')

  const selects = dialog.locator('select')
  /* pilih dulu lokasi tempat unit keluar terpasang */
  await selects.nth(0).selectOption(keluarM.wilayah)
  await tidur(600)
  const opsiKeluar = await selects.nth(1).locator('option').allTextContents()
  const opsiMasuk = await selects.nth(2).locator('option').allTextContents()
  cek(opsiKeluar.some((o) => o.includes(keluarM.kode)), `daftar unit keluar memuat unit terpasang di ${keluarM.wilayah}`, `${opsiKeluar.length} opsi`)
  cek(opsiMasuk.some((o) => o.includes(standbyM.kode)), 'daftar unit masuk memuat stock standby', `${opsiMasuk.length} opsi`)

  await selects.nth(1).selectOption(keluarM.kode)
  await selects.nth(2).selectOption(standbyM.kode)
  await tidur(400)
  const ringkasForm = await dialog.innerText()
  cek(ringkasForm.includes(standbyM.kode) && /setelah disimpan/i.test(ringkasForm), 'ringkasan sebelum simpan tampil', `${keluarM.kode} → ${standbyM.kode}`)

  await dialog.getByRole('button', { name: /Tukar Sekarang/i }).click()
  await tidur(2500)
  const teksSukses = await page.getByRole('dialog').innerText().catch(() => '')
  cek(/tercatat/i.test(teksSukses), 'tukar tersimpan (ringkasan sukses tampil)')

  const setelah1 = await master()
  const k1 = cariUnit(setelah1, 'Mesin', keluarM.kode)
  const m1 = cariUnit(setelah1, 'Mesin', standbyM.kode)
  cek(k1?.status === 'Standby', `unit keluar → Standby di sheet master`, `${keluarM.kode}: ${k1?.status}`)
  cek(m1?.status === 'Terpasang' && m1?.wilayah === keluarM.wilayah, `unit masuk → Terpasang di ${keluarM.wilayah}`, `${standbyM.kode}: ${m1?.status} ${m1?.wilayah}`)

  const r1 = (await api({ action: 'swapread' })).result
  cek(r1.jumlah === riwayatAwal + 1, 'satu baris riwayat bertambah', `${riwayatAwal} → ${r1.jumlah}`)
  cek(r1.rows[r1.rows.length - 1].includes(keluarM.kode) && r1.rows[r1.rows.length - 1].includes(standbyM.kode), 'riwayat mencatat unit keluar & masuk')

  await page.getByRole('button', { name: /^Selesai$/ }).click().catch(() => {})
  await tidur(1200)

  /* ---------------- 2. relokasi: unit terpasang di lokasi lain ---------------- */
  const sesudah1 = await master()
  const listM = sesudah1.mesin.map((r) => ({ kode: r[0], wilayah: r[1], status: r[4] }))
  const posLain = [...new Set(listM.filter((u) => u.status === 'Terpasang').map((u) => u.wilayah))][0]
  const keluar2 = listM.find((u) => u.status === 'Terpasang' && u.wilayah !== posLain)
  const masuk2 = listM.find((u) => u.status === 'Terpasang' && u.wilayah === posLain && u.kode !== keluar2?.kode)

  let relokasiOk = false
  let posisiKosong = ''
  if (keluar2 && masuk2) {
    const hasil = await api({
      action: 'swapunit',
      payload: { tipe: 'Mesin', keluar: keluar2.kode, masuk: masuk2.kode, statusKeluar: 'Rusak', alasan: 'Relokasi / pemerataan unit' },
    })
    relokasiOk = !!hasil.ok && hasil.result?.masuk?.posisiAsal === masuk2.wilayah
    posisiKosong = hasil.result?.posisiKosong || ''
  }
  cek(relokasiOk, 'relokasi dari lokasi lain mencatat posisi asal (lokasi kosong)', `${masuk2?.wilayah} → ${keluar2?.wilayah} · kosong: ${posisiKosong}`)

  /* ---------------- 3. validasi: unit keluar bukan Terpasang ---------------- */
  /* pakai unit yang PASTI bukan Terpasang saat ini (bisa Standby atau Rusak) */
  const kini = await master()
  const bukanTerpasang = kini.mesin.map((r) => ({ kode: r[0], status: r[4] })).find((u) => u.status !== 'Terpasang')
  const tolak = await api({ action: 'swapunit', payload: { tipe: 'Mesin', keluar: bukanTerpasang.kode, masuk: keluarM.kode } })
  cek(!tolak.ok && /tidak|bukan/i.test(String(tolak.error)), 'validasi menolak unit keluar yang bukan Terpasang', String(tolak.error).slice(0, 70))

  /* ---------------- 4. tukar Irrigator dari stock Standby ---------------- */
  if (keluarI && standbyI) {
    const hasilI = await api({
      action: 'swapunit',
      payload: { tipe: 'Irrigator', keluar: keluarI.kode, masuk: standbyI.kode, statusKeluar: 'Standby', alasan: 'Unit lama masuk perbaikan' },
    })
    const mI = await master()
    const st = cariUnit(mI, 'Irrigator', standbyI.kode)
    cek(!!hasilI.ok && st?.status === 'Terpasang', 'tukar Irrigator juga jalan', `${keluarI.kode} → ${standbyI.kode} di ${st?.wilayah}`)
  } else {
    cek(false, 'tukar Irrigator juga jalan', 'data irrigator tidak lengkap di mock')
  }

  /* ---------------- 5. riwayat tampil lagi setelah muat ulang ---------------- */
  await page.reload({ waitUntil: 'networkidle' })
  await tidur(5500)
  const teksAkhir = await page.evaluate(() => document.body.innerText)
  cek(teksAkhir.includes(standbyM.kode) && teksAkhir.includes(keluarM.kode), 'riwayat tukar terbaca lagi setelah halaman dimuat ulang')

  /* ---------------- 6. HP: halaman tidak melebar ---------------- */
  const hp = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Jakarta' })
  await hp.addInitScript((ep) => {
    localStorage.clear()
    localStorage.setItem('fsi:endpoint', ep)
  }, EP)
  await hp.goto(`${BASE}/#/tukar`, { waitUntil: 'networkidle' })
  await tidur(4000)
  const lebar = await hp.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  cek(lebar.scroll <= lebar.client + 1, 'HP 390 px: halaman tidak melebar', `${lebar.scroll}/${lebar.client}`)

  cek(galat.length === 0, 'tanpa error JavaScript', galat.slice(0, 2).join(' | '))

  await browser.close()
  console.log(gagal ? `\n❌ ${gagal} pemeriksaan gagal` : '\n✅ tukar unit: stock standby, relokasi, validasi, riwayat')
  process.exit(gagal ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

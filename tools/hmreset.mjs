/**
 * UJI HM HASIL RESET METER (hour meter rusak lalu diganti)
 *
 * Kasus lapangan: hour meter rusak, diganti baru, angkanya kembali dari nol.
 * HM yang lebih kecil dari HM terakhir HARUS tetap bisa dicatat, asal pengguna
 * menyatakan bahwa meter memang diganti — dan jadwal service harus dihitung
 * dari angka baru, bukan dari angka lama di tb_service1 (yang memakai MAX()).
 *
 * Yang diperiksa:
 *   1. HM lebih kecil tanpa centang → ditolak dengan pesan yang menjelaskan.
 *   2. HM lebih kecil + centang “Meter HM diganti / di-reset” → tersimpan.
 *   3. Baris baru benar-benar masuk sheet (dibaca balik lewat svcread).
 *   4. Setelah Sinkron, kartu unit memakai HM baru (bukan angka MAX lama).
 *   5. Ringkasan pop-up menyebut “meter HM baru (di-reset)”.
 *   6. Tanpa error JavaScript.
 *
 * Pakai (Vite :5199 → mock :8111, MASTER=1 TESTHOOK=1):
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/hmreset.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const KODE = process.env.KODE || 'SPC0207' // HM terakhir 88.878 di sheet
const HM_BARU = process.env.HM || '37' // angka meter baru (jauh di bawah)

let gagal = 0
const lulus = []
const cek = (ok, nama, catatan = '') => {
  if (ok) lulus.push(nama)
  console.log(`${ok ? '✅' : '❌'} ${nama}${catatan ? ` — ${catatan}` : ''}`)
  if (!ok) gagal++
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms))

async function svcread() {
  const r = await fetch(EP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'svcread' }),
    redirect: 'follow',
  })
  return (await r.json()).result
}

async function jalankan() {
  const sebelum = await svcread()
  const idxKode = sebelum.logHeader.findIndex((h) => String(h).trim() === 'Kode Mesin')
  const idxTgl = sebelum.logHeader.findIndex((h) => String(h).trim() === 'Tanggal')
  const idxHm = sebelum.logHeader.findIndex((h) => String(h).trim() === 'HM Service')
  const barisAwal = sebelum.logRows.length

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const galat = []
  page.on('pageerror', (e) => galat.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') galat.push(`console: ${m.text()}`)
  })

  await page.addInitScript((ep) => {
    try {
      localStorage.setItem('fsi:endpoint', ep)
      localStorage.clear()
      localStorage.setItem('fsi:endpoint', ep)
    } catch {}
  }, EP)

  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await tidur(6500)

  /* ---------- buka form “Catat Service” ---------- */
  await page.getByRole('button', { name: /^Catat Service$/ }).first().click()
  await tidur(700)
  const dialog = page.getByRole('dialog', { name: /Catat service engine/i })
  cek(await dialog.count() === 1, 'pop-up Catat Service terbuka')

  /* pilih unit lewat kotak cari */
  const cari = dialog.locator('input[type="text"], input:not([type])').first()
  await cari.fill(KODE)
  await tidur(600)
  const opsi = dialog.locator(`text=${KODE}`).first()
  if (await opsi.count()) {
    await opsi.click()
    await tidur(500)
  }
  const teksDialogAwal = await dialog.innerText()
  cek(teksDialogAwal.includes(KODE), `unit ${KODE} terpilih`, KODE)

  /* ---------- 1. HM lebih kecil tanpa centang → ditolak ---------- */
  const inputHm = dialog.locator('input[type="number"]').first()
  await inputHm.fill(HM_BARU)
  await tidur(400)
  const teksSetelahIsi = await dialog.innerText()
  cek(/tidak lebih besar/.test(teksSetelahIsi), 'peringatan HM turun muncul saat angka diisi')
  const centang = dialog.locator('input[type="checkbox"]').first()
  cek(await centang.count() === 1, 'tersedia centang “Meter HM diganti / di-reset”')

  await dialog.getByRole('button', { name: /Simpan/i }).click()
  await tidur(900)
  const teksTolak = await dialog.innerText()
  cek(/centang/i.test(teksTolak) && /Meter HM/i.test(teksTolak), 'tanpa centang: penyimpanan ditolak + petunjuk jelas')

  const sesudahTolak = await svcread()
  cek(sesudahTolak.logRows.length === barisAwal, 'tanpa centang: tidak ada baris baru di sheet', `${sesudahTolak.logRows.length} baris`)

  /* ---------- 2. centang → boleh disimpan ---------- */
  await centang.check()
  await tidur(300)
  await dialog.getByRole('button', { name: /Simpan/i }).click()
  /* pop-up menutup diri 2,2 detik setelah sukses → baca ringkasannya lebih dulu */
  await tidur(1200)
  const teksSukses = await page.getByRole('dialog').innerText().catch(() => '')
  cek(/tercatat/.test(teksSukses), 'HM turun tersimpan setelah meter ditandai diganti')
  cek(/meter HM baru|di-reset/i.test(teksSukses), 'ringkasan menyebut meter HM baru (di-reset)')

  /* ---------- 3. baris benar-benar masuk sheet ---------- */
  const sesudah = await svcread()
  const barisBaru = sesudah.logRows.filter(
    (r) => String(r[idxKode]).trim().toUpperCase() === KODE && String(r[idxHm]).trim() === HM_BARU
  )
  cek(sesudah.logRows.length === barisAwal + 1, 'tepat satu baris baru di tb_service2', `${barisAwal} → ${sesudah.logRows.length}`)
  cek(barisBaru.length >= 1, `baris ${KODE} dengan HM ${HM_BARU} ada di sheet`, `tanggal ${barisBaru[0] ? String(barisBaru[0][idxTgl]) : '—'}`)

  /* ---------- 4. setelah sinkron, web memakai HM baru ---------- */
  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await tidur(1500)
  await page.getByRole('button', { name: /^Sinkron/i }).first().click().catch(() => {})
  await tidur(7000)

  const info = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('fsi:service-cache') || 'null')
    const u = c && (c.units || []).find((x) => x.kode === new URLSearchParams(location.search).get('kode'))
    return { ada: !!c, unit: u || null, hmReset: c ? c.hmReset : null }
  })
  /* localStorage tidak memuat kode → ambil langsung dari cache penuh */
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('fsi:service-cache') || 'null'))
  const unit = (data?.units || []).find((u) => u.kode === KODE) || info.unit
  cek(!!unit, `unit ${KODE} ada di data service`)
  if (unit) {
    cek(unit.hm === Number(HM_BARU), `HM unit memakai angka meter baru (${unit.hm}), bukan MAX lama 88878`)
    cek(!!unit.hmReset && unit.hmReset.ke === Number(HM_BARU), 'unit ditandai hmReset (meter diganti)')
  }
  const teks = await page.evaluate(() => document.body.innerText)
  cek(/meter diganti|di-reset/i.test(teks), 'pemberitahuan “meter diganti/di-reset” tampil di halaman Service')

  cek(galat.length === 0, 'tanpa error JavaScript', galat.slice(0, 2).join(' | '))

  /* ---------- bersihkan: buang baris uji supaya data sheet kembali ---------- */
  const sisa = await svcread()
  console.log(`\nℹ️  baris uji tersisa: ${sisa.logRows.length - barisAwal} (mock di memori; restart mock untuk bersih)`)

  await browser.close()
  console.log(gagal ? `\n❌ ${gagal} pemeriksaan gagal` : '\n✅ HM reset meter: boleh dicatat & jadwal dihitung dari angka baru')
  process.exit(gagal ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

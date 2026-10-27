/**
 * synctest.mjs — uji end-to-end tombol **Sinkron** vs suntingan manual di sheet.
 *
 * Meniru keluhan nyata: pengguna mengubah Status unit langsung di Google Sheets
 * (bukan lewat aplikasi), lalu menekan Sinkron. Dulu web tetap menampilkan
 * status lama karena `rev` hanya berubah bila waktu modifikasi file berubah —
 * dan bila DriveApp gagal, rev tidak pernah berubah sama sekali.
 *
 * Butuh (jalankan di terminal lain):
 *   MASTER=1 TESTHOOK=1 PORT=8111 node tools/mockapi.mjs
 *   VITE_APPS_SCRIPT_URL=http://127.0.0.1:8111/exec npx vite --port 5199
 *
 * Jalankan: node tools/synctest.mjs
 */
import { chromium } from 'playwright-core'

const APP = 'http://127.0.0.1:5199/'
const MOCK = 'http://127.0.0.1:8111'
const KODE = 'SPC0224'

let gagal = 0
const cek = (nama, ok, extra = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${extra ? ' — ' + extra : ''}`)
}

const setSheet = async (val) => {
  const r = await fetch(`${MOCK}/__set?sheet=Mesin&kode=${KODE}&col=Status&val=${encodeURIComponent(val)}`)
  const j = await r.json()
  if (!j.ok) throw new Error('hook gagal: ' + JSON.stringify(j))
}

const barisUnit = (page, kode) =>
  page.evaluate(
    (k) =>
      [...document.querySelectorAll('tr, article, .card')]
        .map((e) => (e.innerText || '').replace(/\s+/g, ' '))
        .filter((t) => t.includes(k) && /Rusak|Standby|Terpasang/.test(t))[0] || '',
    kode
  )

const tekanSinkron = async (page) => {
  const klik = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => (e.innerText || '').trim() === 'Sinkron')
    if (!b) return false
    b.click()
    return true
  })
  if (!klik) throw new Error('tombol Sinkron tidak ditemukan')
  await page.waitForTimeout(7000) /* 4 tahap: kirim → master + riwayat + service */
}

const bukaUnit = async (page) => {
  await page.goto(APP + '#/unit', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.locator('input[type=text], input:not([type])').first().fill(KODE)
  await page.waitForTimeout(1200)
  return barisUnit(page, KODE)
}

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

/* 1. keadaan awal: SPC0224 = Rusak (sesuai sheet master) */
await setSheet('Rusak')
await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.removeItem('fsi:master-live'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
let baris = await bukaUnit(page)
cek('awal: SPC0224 tampil Rusak', /Rusak/.test(baris), baris.slice(-70))

/* 2. pengguna menyunting sheet → Terpasang, lalu tekan Sinkron */
await setSheet('Terpasang')
baris = await bukaUnit(page)
cek('sebelum Sinkron: layar masih Rusak (belum ditarik)', /Rusak/.test(baris), baris.slice(-70))
await tekanSinkron(page)
baris = await bukaUnit(page)
cek('setelah Sinkron: SPC0224 mengikuti sheet → Terpasang', /Terpasang/.test(baris) && !/Rusak/.test(baris), baris.slice(-70))

/* 3. dikembalikan ke Rusak → Sinkron lagi */
await setSheet('Rusak')
await tekanSinkron(page)
baris = await bukaUnit(page)
cek('Sinkron kedua: kembali ke Rusak', /Rusak/.test(baris), baris.slice(-70))

/* 4. Sinkron berulang tanpa perubahan → tetap konsisten */
await tekanSinkron(page)
baris = await bukaUnit(page)
cek('Sinkron ketiga (tidak ada perubahan): tetap Rusak', /Rusak/.test(baris), baris.slice(-70))

/* 5. chip master menyatakan data live */
const chip = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button, span')].find((e) => /Master live|tekan Sinkron/.test(e.innerText || ''))
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '(tidak ada)'
})
cek('chip sidebar: “Master live”', /Master live/.test(chip), chip)
cek('tidak ada error JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '))

await page.screenshot({ path: '/home/user/FS-Inspection/audit-shots/sync-SPC0224.png' })
await b.close()
console.log(gagal ? `\n❌ ${gagal} pemeriksaan GAGAL` : '\n✅ Sinkron mengikuti suntingan sheet di semua skenario')
process.exit(gagal ? 1 : 0)

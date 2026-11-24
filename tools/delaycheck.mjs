/**
 * Uji fitur “Delay reminder” (ronde 21) — penundaan pengingat manual oleh pengguna.
 *
 * Aturan yang diuji:
 *   1. Unit berstatus “Lewat jadwal” membuka detail → tombol “Delay reminder”
 *      → pilih 7 hari + alasan wajib → tersimpan (aksi `svcdefer`, sheet
 *      “Delay Reminder Service” / tb_service3).
 *   2. Setelah tersimpan, unit pindah dari tab “Lewat” ke tab “Ditunda”,
 *      keterangan baris: “Pengingat ditunda s.d. <tanggal> · n hari lagi”.
 *   3. Form “Catat Service” juga menawarkan opsi tunda yang sama.
 *
 * Jalankan dengan Vite + mock API (mock menulis ke SVC_DIR, jangan ke data/):
 *   SVC_DIR=data2/tmp_svc node tools/mockapi.mjs          # port 8111
 *   npx vite --port 5199
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/delaycheck.mjs
 *   VP=HP …  # menguji viewport HP (390×844) saja
 *
 * Data uji harus bersih (tidak ada baris tb_service3) agar tab “Ditunda” mulai 0.
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const HANYA = process.env.VP || ''

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ` — ${info}` : ''}`)
}

const browser = await chromium.launch()
for (const vp of [{ w: 1440, h: 1000, n: 'Desktop' }, { w: 390, h: 844, n: 'HP' }].filter((v) => !HANYA || v.n === HANYA)) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    isMobile: vp.w < 700,
    hasTouch: vp.w < 700,
  })
  await ctx.addInitScript((ep) => {
    try {
      localStorage.setItem('fsi:endpoint', ep)
      localStorage.removeItem('fsi:service-cache')
    } catch (e) {}
  }, EP)
  const page = await ctx.newPage()
  const galat = []
  page.on('pageerror', (e) => galat.push(e.message))
  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)

  /* ---------- A. detail unit → tunda 7 hari ---------- */
  await page.locator('button:has-text("SPC0226"):visible').first().click()
  await page.waitForTimeout(700)
  const tombol = page.locator('[role="dialog"] button:has-text("Delay reminder"), [role="dialog"] button:has-text("Ubah tunda")').first()
  cek(`[${vp.n}] A · detail unit punya tombol Delay reminder`, (await tombol.count()) > 0)
  await tombol.click()
  await page.waitForTimeout(400)
  const panel = await page.locator('[role="dialog"]').first().innerText()
  cek(`[${vp.n}] A · panel tunda: pilihan hari + alasan wajib`, /Tunda pengingat/.test(panel) && /7 hari/.test(panel) && /alasan \(wajib\)/i.test(panel))
  await page.locator('[role="dialog"] button:has-text("Tunda 7 hari")').last().click()
  await page.waitForTimeout(2600)
  const isi = await page.locator('[role="dialog"]').first().innerText()
  const sampai = (isi.match(/Pengingat ditunda sampai (\d{4}-\d{2}-\d{2})/) || [])[1]
  cek(`[${vp.n}] A · penundaan tersimpan & ditampilkan`, !!sampai, sampai ? `s.d. ${sampai}` : '')
  await page.locator('[role="dialog"] button:has-text("Tutup")').last().click()
  await page.waitForTimeout(700)

  /* ---------- B. tab Ditunda ---------- */
  await page.locator('button:has-text("Ditunda ("):visible').last().click()
  await page.waitForTimeout(900)
  const blok = await page.evaluate(() => {
    const t = document.body.innerText
    const i = t.indexOf('Perlu Perhatian')
    return t.slice(i, i + 1200)
  })
  cek(`[${vp.n}] B · tab Ditunda memuat SPC0226`, (blok.match(/[A-Z]{3}\d{4}/g) || []).includes('SPC0226'))
  cek(`[${vp.n}] B · keterangan “Pengingat ditunda s.d. …”`, /Pengingat ditunda s\.d\./.test(blok))
  cek(`[${vp.n}] B · penundaan tidak lagi dihitung “Lewat”`, /Lewat \(15\)/.test(blok) || !/Lewat \(16\)/.test(blok))

  /* ---------- C. opsi tunda di form Catat Service ---------- */
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) break
    await page.locator('[role="dialog"] button').first().click().catch(() => {})
    await page.waitForTimeout(350)
  }
  await page.locator('button[aria-label="Catat Service"]').first().click()
  await page.waitForTimeout(800)
  await page.locator('[role="dialog"] input[placeholder^="Cari kode"]').first().fill('DEM0077')
  await page.waitForTimeout(500)
  await page.locator('[role="option"]:has-text("DEM0077")').first().click()
  await page.waitForTimeout(600)
  const form = await page.locator('[role="dialog"]').first().innerText()
  cek(`[${vp.n}] C · form Catat Service menawarkan tunda`, /Tunda pengingatnya/.test(form))
  await page.locator('[role="dialog"] button:has-text("14 hari")').first().click()
  await page.waitForTimeout(200)
  await page.locator('[role="dialog"] button:has-text("Delay reminder — tunda")').first().click()
  await page.waitForTimeout(2800)
  cek(`[${vp.n}] C · penundaan dari form tersimpan (form tertutup)`, (await page.locator('[role="dialog"][aria-label="Catat service engine"]').count()) === 0)
  await page.locator('button:has-text("Ditunda ("):visible').last().click()
  await page.waitForTimeout(900)
  const blok2 = await page.evaluate(() => {
    const t = document.body.innerText
    const i = t.indexOf('Perlu Perhatian')
    return t.slice(i, i + 1500)
  })
  const kode = blok2.match(/[A-Z]{3}\d{4}/g) || []
  cek(`[${vp.n}] C · dua unit tampil di tab Ditunda`, kode.includes('SPC0226') && kode.includes('DEM0077'), `Ditunda (${(blok2.match(/Ditunda \((\d+)\)/) || [])[1]})`)
  cek(`[${vp.n}] tanpa galat JS`, galat.length === 0, galat.slice(0, 2).join(' | '))
  await ctx.close()
}
await browser.close()
console.log(gagal ? `\n${gagal} cek GAGAL` : '\nSemua cek lulus')
process.exit(gagal ? 1 : 0)

import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
/* pakai playwright-core lokal (npm i -D playwright-core) atau dari PW_DIR */
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const EP = 'http://127.0.0.1:8111/exec'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
/* ---- desktop + mobile 3G-ish ---- */
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep); localStorage.removeItem('fsi:history-cache'); localStorage.removeItem('fsi:history-rev') } catch (e) {} }, EP)
const p = await ctx.newPage()
const sizes = []
p.on('response', async (r) => { if (r.url().includes('8111')) { try { sizes.push((await r.body()).length) } catch {} } })
const errs = []
p.on('pageerror', (e) => errs.push(e.message))

const t0 = Date.now()
await p.goto('http://127.0.0.1:8099/#/riwayat', { waitUntil: 'networkidle' })
await p.waitForFunction(() => /\b275\b/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 15000 })
const tFirst = Date.now() - t0
const txt = () => p.evaluate(() => (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' '))
let t = await txt()
console.log(`1) sinkron pertama (data penuh): ${tFirst} ms, payload ${(sizes.at(-1) / 1024).toFixed(0)} KB, sesi tampil: ${/275/.test(t)}`)

/* ulang: rev sama → harus murah */
await p.getByRole('button', { name: /Tarik dari Sheet/ }).click()
await p.waitForTimeout(1500)
console.log(`2) sinkron ulang (rev sama): payload ${sizes.at(-1)} byte`)
t = await txt()
console.log(`   sesi tetap: ${/275/.test(t)}`)

/* submit baru lewat UI: buka form, pilih unit, isi petugas, kirim */
await p.goto('http://127.0.0.1:8099/#/inspeksi', { waitUntil: 'networkidle' })
await p.waitForTimeout(800)
const cari = p.locator('main input[type=search], main input[placeholder*="Cari"]').first()
if (await cari.count()) { await cari.fill('SPC0018'); await p.waitForTimeout(500) }
const pick = p.locator('main button').filter({ hasText: 'SPC0018' }).first()
if (await pick.count()) { await pick.click(); await p.waitForTimeout(700) }
const petugas = p.locator('main input[placeholder="Nama lengkap"]').first()
let nPetugas = await petugas.count()
if (!nPetugas) {
  /* pilih unit lewat daftar: klik tombol yang memuat kode unit */
  const rows = p.locator('main button').filter({ hasText: /^SPC0018/ })
  if (await rows.count()) { await rows.first().click(); await p.waitForTimeout(800) }
  nPetugas = await petugas.count()
}
console.log('3) form inspeksi terbuka:', nPetugas > 0)
const sizesBefore = sizes.length
if (nPetugas) {
  await petugas.fill('Uji E2E')
  const isiA = p.locator('main button').filter({ hasText: 'Isi sisa A' })
  if (await isiA.count()) { await isiA.first().click(); await p.waitForTimeout(400) }
  const kirim = p.locator('button').filter({ hasText: /Kirim Inspeksi/ }).last()
  await kirim.waitFor({ state: 'attached', timeout: 15000 })
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /Kirim Inspeksi/.test(b.textContent))
    btns.at(-1)?.click()
  })
  await p.waitForTimeout(2500)
  const after = sizes.slice(sizesBefore)
  const toast = await p.evaluate(() => (document.querySelector('[class*=toast]')?.textContent || '').trim().slice(0, 60))
  console.log(`4) submit dikirim (${after.length} request), toast: "${toast}"`)
  const rows = await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) })).json()
  console.log(`   baris sheet sekarang: ${rows.records} (sebelum 275) → ${rows.records === 276 ? 'BERTAMBAH 1 ✅' : 'TIDAK BERTAMBAH ❌'}`)
  /* kirim ulang (klik lagi) → harus tetap 276 (idempoten) */
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /Kirim Inspeksi/.test(b.textContent))
    btns.at(-1)?.click()
  })
  await p.waitForTimeout(2000)
  const rows2 = await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) })).json()
  console.log(`   kirim ulang: ${rows2.records} baris → ${rows2.records === 276 ? 'tidak dobel ✅' : 'DOBEL ❌'}`)
}
console.log('error JS:', errs.length ? errs : 'tidak ada')
await b.close()

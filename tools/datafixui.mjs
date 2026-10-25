/**
 * Uji kartu “Kualitas Data Sheet” di halaman Pengaturan (end-to-end).
 * Butuh mock Apps Script yang menyertakan sheet Mesin & Irrigator:
 *   DI_CSV=/home/user/data/di.csv PORT=8113 MASTER=1 DATA_DIR=/home/user/data node tools/mockapi.mjs
 *
 * Jalankan: LD_LIBRARY_PATH=... node tools/datafixui.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_(process.env.PW || '/home/user/tools/node_modules/playwright-core')

const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const MOCK = process.env.MOCK || 'http://127.0.0.1:8113/'
/* UI hanya mengaktifkan tombol untuk endpoint Apps Script asli (….google.com/…/exec),
   jadi permintaan ke URL itu kita balikkan (route) ke mock lokal. */
const EP = 'https://script.google.com/macros/s/AKfycbMOCK/exec'

const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
for (const vp of [{ w: 1440, h: 950, n: 'Desktop' }, { w: 390, h: 844, n: 'HP' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  await ctx.route('https://script.google.com/**', async (route) => {
    const body = route.request().postData() || '{}'
    const r = await fetch(MOCK, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body })
    const text = await r.text()
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: text })
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  p.on('dialog', (d) => d.accept())
  await p.goto(`${BASE}/#/pengaturan`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)

  const kartu = p.locator('text=Kualitas Data Sheet').first()
  cek(`[${vp.n}] kartu “Kualitas Data Sheet” tampil`, (await kartu.count()) > 0)

  const auditBtn = p.getByRole('button', { name: /Audit data sheet/ })
  const repairBtn = p.getByRole('button', { name: /Perbaiki otomatis/ })
  cek(`[${vp.n}] tombol audit & perbaiki ada`, (await auditBtn.count()) > 0 && (await repairBtn.count()) > 0)

  await auditBtn.click()
  await p.waitForTimeout(3000)
  const teksAudit = (await p.locator('body').innerText()).toLowerCase()
  const adaStat = teksAudit.includes('baris diperiksa') && teksAudit.includes('ringkasan salah')
  cek(`[${vp.n}] hasil audit tampil (statistik + contoh)`, adaStat)
  const chipAwal = await p.locator('span.chip', { hasText: /temuan|Bersih/i }).first().innerText().catch(() => '')
  cek(`[${vp.n}] chip status terisi setelah audit`, /temuan|bersih/i.test(chipAwal), chipAwal)

  await repairBtn.click()
  await p.waitForTimeout(6000)
  const teksAkhir = (await p.locator('body').innerText()).toLowerCase()
  cek(`[${vp.n}] audit ulang otomatis setelah perbaikan`, teksAkhir.includes('baris diperiksa'))
  const chipAkhir = await p.locator('span.chip', { hasText: /Bersih|temuan/i }).first().innerText().catch(() => '')
  cek(`[${vp.n}] sheet bersih setelah perbaikan`, /bersih/i.test(chipAkhir), chipAkhir)

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs[0] || '')
  await ctx.close()
}
await b.close()
console.log(hasil.join('\n'))
const gagal = hasil.filter((h) => h.startsWith('GAGAL')).length
console.log(gagal ? '\nADA YANG GAGAL' : '\nSEMUA LULUS')
process.exit(gagal ? 1 : 0)

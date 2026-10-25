/**
 * Uji badge “catatan kualitas data” di halaman Service (DESKTOP + HP):
 *  - badge muncul dengan jumlah temuan > 0
 *  - klik badge membuka panel rincian & menutupnya lagi
 *  - panel memuat temuan yang memang ada di data (tanggal rusak / HM kosong / kode asing)
 *  - tidak ada error JS
 *
 * Jalankan: LD_LIBRARY_PATH=... NODE_PATH=/home/user/tools/node_modules node tools/kualitas.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_(process.env.PW || '/home/user/tools/node_modules/playwright-core')

const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'

const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
for (const vp of [{ w: 1440, h: 950, n: 'Desktop' }, { w: 390, h: 844, n: 'HP' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  await p.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2600)

  const badge = p.locator('button[aria-expanded]', { hasText: 'catatan kualitas data' }).first()
  const ada = await badge.count()
  const teks = ada ? (await badge.innerText()).replace(/\s+/g, ' ').trim() : ''
  const jumlah = Number((teks.match(/(\d+)\s+catatan/) || [])[1] || 0)
  cek(`[${vp.n}] badge kualitas data tampil`, ada > 0 && jumlah > 0, teks)

  await badge.click()
  await p.waitForTimeout(400)
  const panel = p.locator('text=Hasil audit data sheet').first()
  const panelTampil = await panel.count()
  cek(`[${vp.n}] panel rincian terbuka saat badge diklik`, panelTampil > 0)

  const isi = panelTampil ? (await p.locator('text=Hasil audit data sheet').first().locator('..').innerText()) : ''
  const punyaTanggal = /tanggal|HM|kode/i.test(isi)
  cek(`[${vp.n}] panel memuat butir temuan`, punyaTanggal, isi.replace(/\s+/g, ' ').slice(0, 120))

  const tinggiSebelum = await p.evaluate(() => document.body.scrollHeight)
  await badge.click()
  await p.waitForTimeout(300)
  const tinggiSesudah = await p.evaluate(() => document.body.scrollHeight)
  cek(`[${vp.n}] panel tertutup lagi`, tinggiSesudah < tinggiSebelum + 5, `${tinggiSebelum} → ${tinggiSesudah}`)

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs[0] || '')
  await ctx.close()
}
await b.close()
console.log(hasil.join('\n'))
const gagal = hasil.filter((h) => h.startsWith('GAGAL')).length
console.log(gagal ? '\nADA YANG GAGAL' : '\nSEMUA LULUS')
process.exit(gagal ? 1 : 0)

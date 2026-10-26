import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const CHROME = process.env.CHROME
  || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await fetch(EP.replace('/exec', '/__reset'))
await p.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2000)
await p.locator('button:has-text("Catat Service")').first().click()
await p.waitForTimeout(600)

const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

/* 1. tidak ada dropdown minggu di pop-up */
const dropdown = await p.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  return { selects: d.querySelectorAll('select').length, adaTeksMinggu: /Minggu \d/.test(d.innerText) }
})
cek('tidak ada dropdown (select) di form', dropdown.selects === 0, JSON.stringify(dropdown))
cek('minggu ditampilkan otomatis', dropdown.adaTeksMinggu)

/* 2. geser tanggal 1..28 → minggu mengikuti ROUNDUP(day/7) */
await p.fill('[role="dialog"] input[placeholder*="Cari kode"]', 'DED0017')
await p.waitForTimeout(300)
await p.click('[role="option"]:has-text("DED0017")')
await p.waitForTimeout(400)
const cekTanggal = []
for (const [tgl, harap] of [['2026-10-01', 1], ['2026-10-07', 1], ['2026-10-08', 2], ['2026-10-15', 3], ['2026-10-22', 4], ['2026-10-31', 5]]) {
  await p.fill('[role="dialog"] input[type="date"]', tgl)
  await p.waitForTimeout(250)
  const teks = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.replace(/\n+/g, ' | '))
  const m = teks.match(/Minggu (\d)/)
  cekTanggal.push(`${tgl}→${m ? m[1] : '?'} (harap ${harap})`)
  cek(`minggu otomatis untuk ${tgl}`, m && Number(m[1]) === harap, m ? `Minggu ${m[1]}` : 'tidak ada')
}

/* 3. simpan dan pastikan minggu yang dikirim = hasil hitungan tanggal */
await p.fill('[role="dialog"] input[type="date"]', '2026-10-22')
await p.waitForTimeout(300)
const hmTerakhir = await p.evaluate(() => {
  const m = document.querySelector('[role="dialog"]').innerText.match(/HM TERAKHIR[\s\S]{0,40}?([\d.]{2,})/i)
  return m ? Number(m[1].replace(/\./g, '')) : 0
})
await p.fill('[role="dialog"] input[type="number"]', String(hmTerakhir + 55))
await p.waitForTimeout(300)
await p.click('[role="dialog"] button:has-text("Simpan ke Sheet")')
await p.waitForTimeout(1500)
const state = await (await fetch(EP.replace('/exec', '/__state'))).json()
cek('payload ke sheet memuat minggu 4 (22 Okt)', state.appends.length === 1 && state.appends[0].tanggal === '2026-10-22', JSON.stringify(state.appends))
cek('tidak ada error JS', errs.length === 0, errs.slice(0, 2).join(' | '))
await p.screenshot({ path: '/home/user/tools/svc-minggu.png' })
console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

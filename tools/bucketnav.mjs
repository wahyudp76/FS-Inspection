import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
/* pakai playwright-core lokal (npm i -D playwright-core) atau dari PW_DIR */
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
import fs from 'node:fs'
import path from 'node:path'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const seed = fs.readFileSync(process.env.SEED || path.join(HERE, 'seed-cache.json'), 'utf8')
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((d) => { try { localStorage.setItem('fsi:history-cache', d) } catch (e) {} }, seed)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://127.0.0.1:8099/#/dashboard', { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)

/* buka lewat tombol HP (<50 Irrigator = 1 unit) */
await p.evaluate(() => {
  const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
  c.scrollIntoView({ block: 'center' })
})
await p.getByRole('button', { name: /Analisa <50 Irrigator/ }).click()
await p.waitForTimeout(600)
let t = await p.evaluate(() => document.querySelector('[role=dialog]')?.innerText || '')
console.log('pop-up <50 Irrigator:', /1 unit/.test(t), '|', t.split('\n').slice(0,2).join(' / '))

/* tombol Inspeksi di dalam pop-up */
await p.locator('[role=dialog] button', { hasText: 'Inspeksi' }).first().click()
await p.waitForTimeout(900)
console.log('setelah klik Inspeksi →', await p.evaluate(() => location.hash), '| modal tertutup:', !(await p.evaluate(() => !!document.querySelector('[role=dialog]'))))
await p.goto('http://127.0.0.1:8099/#/dashboard', { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)
await p.evaluate(() => {
  const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
  c.scrollIntoView({ block: 'center' })
})
await p.getByRole('button', { name: /Analisa 90-100 Mesin/ }).click()
await p.waitForTimeout(600)
await p.locator('[role=dialog] button[aria-label^="Detail unit"]').first().click()
await p.waitForTimeout(900)
console.log('setelah klik kode unit →', await p.evaluate(() => location.hash))
console.log('error JS:', errs.length ? errs.slice(0,3) : 'tidak ada')
await b.close()

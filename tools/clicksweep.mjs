import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
/* pakai playwright-core lokal (npm i -D playwright-core) atau dari PW_DIR */
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
import fs from 'node:fs'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const BASE = 'http://127.0.0.1:8099'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true })
  const seed = fs.readFileSync(R('seed-cache.json'), 'utf8')
  await ctx.addInitScript((data) => {
    try { localStorage.setItem('fsi:history-cache', data) } catch (e) {}
  }, seed)
  const p = await ctx.newPage()
const out = []
const routes = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'pengaturan']
for (const r of routes) {
  await p.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(700)
  const n = await p.evaluate(() => document.querySelectorAll('main button, main a[href], main [role=button]').length)
  for (let i = 0; i < n; i++) {
    await p.goto(`${BASE}/#/${r}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(320)
    const errs = []
    const onErr = (e) => errs.push(e.message)
    p.on('pageerror', onErr)
    const info = await p.evaluate((idx) => {
      const el = document.querySelectorAll('main button, main a[href], main [role=button]')[idx]
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('href') || el.tagName).trim().slice(0, 34)
      const snap = () => {
        const m = document.querySelector('main')
        const t = m ? m.innerText : ''
        let h = 0
        for (let c = 0; c < t.length; c++) h = (h * 31 + t.charCodeAt(c)) | 0
        return h
      }
      const before = { hash: location.hash, modals: document.querySelectorAll('[role=dialog], .fixed.inset-0').length, text: snap() }
      el.click()
      return { label, before, disabled: el.disabled === true }
    }, i)
    await p.waitForTimeout(450)
    const after = await p.evaluate(() => ({
      hash: location.hash,
      modals: document.querySelectorAll('[role=dialog], .fixed.inset-0').length,
      toasts: [...document.querySelectorAll('[class*=toast], [role=status]')].map((t) => t.textContent.trim().slice(0, 60)),
      mainLen: (document.querySelector('main')?.innerText || '').length,
      text: (() => { const t = document.querySelector('main')?.innerText || ''; let h = 0; for (let c = 0; c < t.length; c++) h = (h * 31 + t.charCodeAt(c)) | 0; return h })(),
    }))
    p.off('pageerror', onErr)
    if (info) out.push({ route: r, i, ...info, after, errs })
    await p.keyboard.press('Escape')
  }
}
fs.writeFileSync('./clicksweep.json', JSON.stringify(out, null, 1))
const errs = out.filter((o) => o.errs.length)
const dead = out.filter((o) => !o.disabled && o.after.hash === o.before.hash && o.after.modals <= o.before.modals && o.after.toasts.length === 0 && o.after.text === o.before.text)
console.log('diklik:', out.length, '| error JS:', errs.length, '| tanpa reaksi:', dead.length)
if (errs.length) console.log(JSON.stringify(errs.slice(0, 6), null, 1))
console.log('contoh tanpa reaksi:', JSON.stringify(dead.slice(0, 12).map((d) => `${d.route}: ${d.label}`), null, 1))
await b.close()

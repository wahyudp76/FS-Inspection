import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const routes = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'pengaturan']
const widths = [320, 360, 390, 414]
const problems = []
for (const w of widths) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true })
    const seed = fs.readFileSync(R('seed-cache.json'), 'utf8')
  await ctx.addInitScript((data) => {
    try { localStorage.setItem('fsi:history-cache', data) } catch (e) {}
  }, seed)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  for (const r of routes) {
    await p.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(800)
    const res = await p.evaluate((vp) => {
      const out = { docW: document.documentElement.scrollWidth, clipped: [], taps: [], scrollers: [] }
      const inScroller = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
        return false
      }
      const clippedByAncestor = (el) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX
          if (ox === 'hidden' || ox === 'clip') return true
        }
        return false
      }
      for (const el of document.querySelectorAll('main *, header *')) {
        const rr = el.getBoundingClientRect()
        if (!rr.width) continue
        if (rr.right > vp + 1 && !inScroller(el) && !clippedByAncestor(el)) {
          out.clipped.push({ tag: el.tagName, txt: (el.textContent || '').trim().slice(0, 20), right: Math.round(rr.right), cls: String(el.className || '').slice(0, 34) })
        }
      }
      out.clipped = out.clipped.slice(0, 4)
      const seen = new Set()
      for (const el of document.querySelectorAll('button, a[href], [role=button], select, input')) {
        const rr = el.getBoundingClientRect()
        if (!rr.width || !rr.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue
        if (rr.width < 34 || rr.height < 30) {
          const label = (el.getAttribute('aria-label') || el.title || el.textContent || el.tagName).trim().slice(0, 22)
          const k = label + rr.width.toFixed(0) + rr.height.toFixed(0)
          if (!seen.has(k)) { seen.add(k); out.taps.push({ label, w: +rr.width.toFixed(0), h: +rr.height.toFixed(0) }) }
        }
      }
      out.taps = out.taps.slice(0, 6)
      for (const el of document.querySelectorAll('main div, main section')) {
        const cs = getComputedStyle(el)
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) {
          out.scrollers.push({ sw: el.scrollWidth, cw: el.clientWidth })
        }
      }
      return out
    }, w)
    if (res.docW > w + 1) problems.push({ w, r, type: 'PAGE_OVERFLOW', val: res.docW })
    if (res.clipped.length) problems.push({ w, r, type: 'CLIPPED', items: res.clipped })
    if (res.taps.length) problems.push({ w, r, type: 'TAP', items: res.taps })
    if (r === 'unit' && !res.scrollers.length) problems.push({ w, r, type: 'NO_SCROLLER', note: 'tabel unit seharusnya bisa digeser' })
  }
  if (errs.length) problems.push({ w, type: 'JS_ERROR', items: errs })
  await ctx.close()
}
fs.writeFileSync('./audit2.json', JSON.stringify(problems, null, 1))
console.log('temuan:', problems.length)
for (const p of problems) {
  if (p.type === 'TAP' || p.type === 'CLIPPED') console.log(`${p.type} ${p.w}px ${p.r}:`, JSON.stringify(p.items))
  else console.log(p.type, p.w + 'px', p.r || '', p.val || p.items || p.note || '')
}
await b.close()

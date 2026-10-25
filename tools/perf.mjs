/**
 * Probe performa: ukuran bundel + metrik muat halaman (Dashboard & Service).
 * Membandingkan build lokal (docs/) dengan versi live sebagai "sebelum".
 *
 * Jalankan (butuh server lokal di 8099 + mock API di 8112):
 *   LD_LIBRARY_PATH=... NODE_PATH=/home/user/tools/node_modules \
 *   CHROME=$HOME/.cache/ms-playwright/chromium-1117/chrome-linux/chrome \
 *   node tools/perf.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_(process.env.PW || '/home/user/tools/node_modules/playwright-core')

const HERE = path.dirname(new URL(import.meta.url).pathname)
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const LIVE = 'https://wahyudp76.github.io/FS-Inspection'

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

/* ---------- ukuran bundel ---------- */
const ukuranBuild = (dir, label) => {
  const aset = path.join(dir, 'assets')
  if (!fs.existsSync(aset)) return null
  const file = fs.readdirSync(aset).filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  let total = 0
  const rinci = file.map((f) => {
    const n = fs.statSync(path.join(aset, f)).size
    total += n
    return [f, n]
  })
  console.log(`\n== ${label}: ${kb(total)} total (${file.length} berkas)`)
  rinci.sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`   ${kb(n).padStart(10)}  ${f}`))
  return total
}

const lama = ukuranBuild(path.join(HERE, '..', 'docs'), 'build SEKARANG (docs/)')

const ambil = async (url, ep) => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  const hasil = []
  for (const vp of [{ w: 1440, h: 950, n: 'Desktop' }, { w: 390, h: 844, n: 'HP' }]) {
    for (const rute of ['dashboard', 'service']) {
      const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700 })
      if (ep) await ctx.addInitScript((e) => { try { localStorage.setItem('fsi:endpoint', e) } catch (x) {} }, ep)
      const p = await ctx.newPage()
      const errs = []
      p.on('pageerror', (e) => errs.push(e.message))
      const t0 = Date.now()
      await p.goto(`${url}/#/${rute}`, { waitUntil: 'load' }).catch(() => {})
      await p.waitForTimeout(2500)
      const m = await p.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {}
        const res = performance.getEntriesByType('resource')
        const js = res.filter((r) => /\.js(\?|$)/.test(r.name)).reduce((n, r) => n + (r.transferSize || 0), 0)
        const paint = performance.getEntriesByType('paint')
        return {
          dom: Math.round(nav.domContentLoadedEventEnd || 0),
          load: Math.round(nav.loadEventEnd || 0),
          fcp: Math.round((paint.find((x) => x.name === 'first-contentful-paint') || {}).startTime || 0),
          jsKB: Math.round(js / 1024),
          nodes: document.querySelectorAll('*').length,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        }
      })
      hasil.push({ vp: vp.n, rute, ...m, wall: Date.now() - t0, err: errs.length ? errs[0] : '' })
      await ctx.close()
    }
  }
  await b.close()
  return hasil
}

const lokal = await ambil(BASE, EP)
console.log('\n== metrik build SEKARANG (data dari mock API, jaringan lokal)')
console.log('layar     halaman    DCL(ms)  load(ms)  FCP(ms)  JS(kB)  node-DOM  heap(MB)')
for (const r of lokal) {
  console.log(`${r.vp.padEnd(9)} ${r.rute.padEnd(10)} ${String(r.dom).padStart(7)} ${String(r.load).padStart(9)} ${String(r.fcp).padStart(8)} ${String(r.jsKB).padStart(7)} ${String(r.nodes).padStart(9)} ${String(r.heapMB).padStart(8)}${r.err ? '  ⚠ ' + r.err : ''}`)
}

if (process.env.LIVE === '1') {
  const live = await ambil(LIVE, '')
  console.log('\n== metrik versi LIVE (v1.7.1, tanpa endpoint) — pembanding')
  console.log('layar     halaman    DCL(ms)  load(ms)  FCP(ms)  JS(kB)  node-DOM  heap(MB)')
  for (const r of live) {
    console.log(`${r.vp.padEnd(9)} ${r.rute.padEnd(10)} ${String(r.dom).padStart(7)} ${String(r.load).padStart(9)} ${String(r.fcp).padStart(8)} ${String(r.jsKB).padStart(7)} ${String(r.nodes).padStart(9)} ${String(r.heapMB).padStart(8)}${r.err ? '  ⚠ ' + r.err : ''}`)
  }
}

console.log(`\nTotal bundel: ${kb(lama)}`)

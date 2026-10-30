/**
 * Probe performa & berat halaman (build `docs/` + mock Apps Script).
 *
 * Mengukur:
 *   · ukuran tiap berkas build (js/css) + total yang diunduh saat muat pertama
 *   · metrik navigasi: TTFB, DOMContentLoaded, load, waktu sampai KPI tampil
 *   · jumlah permintaan jaringan & total byte
 *   · pemakaian memori (JS heap) setelah halaman tenang
 *   · ukuran cache localStorage (riwayat + master + service)
 *   · waktu respons tiap aksi Apps Script (history, master, svcread, audit)
 *
 * Pakai:
 *   node tools/mockapi.mjs (port 8111, lihat README)  → lalu
 *   EP=http://127.0.0.1:8111/exec node tools/perfcheck.mjs
 * `DIST=docs` bisa diganti (mis. `DIST=dist`) untuk membandingkan build.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.join(HERE, '..')
const DIST = process.env.DIST || 'docs'
const PORT = Number(process.env.PORT || 8123)
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`

/* ---------- 1. ukuran bundel ---------- */
function ukuranBundel() {
  const aset = path.join(ROOT, DIST, 'assets')
  if (!fs.existsSync(aset)) {
    console.log(`⚠ folder ${DIST}/assets belum ada — jalankan npm run build:pages dulu`)
    return 0
  }
  const file = fs.readdirSync(aset).filter((f) => /\.(js|css)$/.test(f))
  const rinci = file
    .map((f) => [f, fs.statSync(path.join(aset, f)).size])
    .sort((a, b) => b[1] - a[1])
  const total = rinci.reduce((a, [, n]) => a + n, 0)
  console.log(`\n== bundel ${DIST}/ (${rinci.length} berkas, ${kb(total)})`)
  rinci.forEach(([f, n]) => console.log(`   ${kb(n).padStart(10)}  ${f}`))
  return total
}

/* ---------- 2. server statis ---------- */
function serverStatis() {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    let f = path.join(ROOT, DIST, url === '/' ? 'index.html' : url)
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
    fs.createReadStream(f).pipe(res)
  })
  return new Promise((resolve) => srv.listen(PORT, '0.0.0.0', () => resolve(srv)))
}

/* ---------- 3. ukur halaman ---------- */
async function ukurHalaman(browser, rute) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const bytes = { total: 0, js: 0, css: 0, api: 0 }
  const reqs = []
  page.on('response', async (res) => {
    const req = res.request()
    const url = req.url()
    const len = Number(res.headers()['content-length'] || 0)
    reqs.push({ url, len })
    bytes.total += len
    if (/\.js(\?|$)/.test(url)) bytes.js += len
    else if (/\.css(\?|$)/.test(url)) bytes.css += len
    else if (url.startsWith(EP)) bytes.api += len
  })
  /* endpoint Apps Script diarahkan ke mock lewat localStorage */
  await page.addInitScript((ep) => {
    try {
      localStorage.setItem('fsi:endpoint', ep)
      localStorage.setItem('fsi:auto-master', '1')
      localStorage.setItem('fsi:auto-refresh', '0')
    } catch { /* abaikan */ }
  }, EP)

  const t0 = Date.now()
  await page.goto(`http://127.0.0.1:${PORT}/#/${rute}`, { waitUntil: 'load' })
  /* rute hash bisa memicu navigasi internal; tunggu tenang dulu */
  await page.waitForLoadState('networkidle').catch(() => {})
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {}
    const paint = performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])
    return {
      ttfb: Math.round(n.responseStart || 0),
      dom: Math.round(n.domContentLoadedEventEnd || 0),
      load: Math.round(n.loadEventEnd || 0),
      paint,
    }
  })
  /* waktu sampai angka KPI pertama muncul (bukti data siap dipakai) */
  let siapMs = null
  try {
    await page.waitForFunction(() => /[0-9]/.test(document.body.innerText.slice(0, 4000)), { timeout: 20000 })
    siapMs = Date.now() - t0
  } catch { /* biarkan null */ }
  await page.waitForTimeout(1500)

  const info = await page.evaluate(() => {
    /* ukuran unduhan dari Resource Timing (content-length jarang dikirim) */
    const res = performance.getEntriesByType('resource')
    const jumlah = { js: 0, css: 0, api: 0, total: 0, n: res.length }
    for (const r of res) {
      const n = r.encodedBodySize || r.transferSize || 0
      jumlah.total += n
      if (/\.js(\?|$)/.test(r.name)) jumlah.js += n
      else if (/\.css(\?|$)/.test(r.name)) jumlah.css += n
      else if (r.name.includes('/exec')) jumlah.api += n
    }
    const ls = {}
    let total = 0
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      const v = localStorage.getItem(k) || ''
      ls[k] = v.length
      total += v.length
    }
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
    return {
      jumlah,
      ls,
      lsTotal: total,
      heapMB: mem,
      grafik: document.querySelectorAll('.recharts-surface').length,
      kartu: document.querySelectorAll('div.card').length,
      dom: document.querySelectorAll('*').length,
    }
  })
  await page.close()
  return { rute, nav, siapMs, bytes, reqs, info }
}

const main = async () => {
  const totalBundel = ukuranBundel()
  const srv = await serverStatis()
  const browser = await chromium.launch()

  const hasil = []
  for (const rute of ['dashboard', 'service']) {
    const h = await ukurHalaman(browser, rute)
    hasil.push(h)
    console.log(`\n== rute ${rute}`)
    console.log(`   TTFB ${h.nav.ttfb} ms · DOMContentLoaded ${h.nav.dom} ms · load ${h.nav.load} ms · KPI siap ${h.siapMs ?? '—'} ms`)
    console.log(`   paint: ${h.nav.paint.map(([n, t]) => `${n} ${t} ms`).join(' · ')}`)
    const j = h.info.jumlah
    console.log(`   unduhan: total ${kb(j.total)} (js ${kb(j.js)}, css ${kb(j.css)}, api ${kb(j.api)}) · ${j.n} permintaan`)
    console.log(`   DOM ${h.info.dom} elemen · kartu ${h.info.kartu} · grafik ${h.info.grafik} · heap ${h.info.heapMB ?? '—'} MB`)
    console.log(`   localStorage ${kb(h.info.lsTotal)}: ${Object.entries(h.info.ls).map(([k, n]) => `${k} ${kb(n)}`).join(' · ')}`)
  }

  /* ---------- 4. waktu respons tiap aksi API ---------- */
  console.log('\n== waktu respons Apps Script (mock, data nyata)')
  const aksi = [
    ['ping', { action: 'ping' }],
    ['history (penuh)', { action: 'history', payload: {} }],
    ['master (penuh)', { action: 'master', payload: {} }],
    ['svcread', { action: 'svcread' }],
    ['audit', { action: 'audit' }],
  ]
  for (const [nama, body] of aksi) {
    const t = Date.now()
    const res = await fetch(EP, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    })
    const teks = await res.text()
    console.log(`   ${nama.padEnd(16)} ${String(Date.now() - t).padStart(5)} ms · ${kb(teks.length)}`)
  }

  await browser.close()
  srv.close()
  const ringkas = {
    bundel: totalBundel,
    rute: hasil.map((h) => ({ rute: h.rute, load: h.nav.load, siapMs: h.siapMs, unduhan: h.info.jumlah.total, heapMB: h.info.heapMB, lsTotal: h.info.lsTotal })),
  }
  fs.writeFileSync(path.join(ROOT, 'perf-last.json'), JSON.stringify(ringkas, null, 1))
  console.log('\n(ringkasan disimpan ke perf-last.json)')
}

main().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

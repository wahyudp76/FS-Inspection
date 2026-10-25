import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const DOCS = process.env.DOCS || '/home/user/FS-Inspection/docs'

const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

/* --- cek statis: file ikon ada & bertipe PNG ukuran yang benar --- */
const pngSize = (p) => {
  const b = fs.readFileSync(p)
  if (b.slice(1, 4).toString() !== 'PNG') return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
const wajib = [
  ['favicon.ico', null],
  ['favicon.svg', null],
  ['apple-touch-icon.png', 180],
  ['icons/favicon-16.png', 16],
  ['icons/favicon-32.png', 32],
  ['icons/icon-192.png', 192],
  ['icons/icon-256.png', 256],
  ['icons/icon-384.png', 384],
  ['icons/icon-512.png', 512],
  ['icons/maskable-192.png', 192],
  ['icons/maskable-512.png', 512],
]
for (const [f, ukuran] of wajib) {
  const p = path.join(DOCS, f)
  cek(`berkas ${f} ada`, fs.existsSync(p), String(fs.existsSync(p)))
  if (ukuran && fs.existsSync(p)) {
    const s = pngSize(p)
    cek(`${f} berukuran ${ukuran}×${ukuran}`, s && s.w === ukuran && s.h === ukuran, JSON.stringify(s))
  }
}

/* --- ikon baru memang berbeda dari yang lama (bukan file lama terbawa) --- */
const baru = fs.readFileSync(path.join(DOCS, 'icons/icon-512.png'))
cek('icon-512 memuat warna biru & hijau logo baru', baru.length > 20000, `${baru.length} byte`)

/* --- cek runtime di browser --- */
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
for (const vp of [{ w: 390, h: 844, n: 'HP' }, { w: 1440, h: 950, n: 'Desktop' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700, hasTouch: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  const gagal404 = []
  p.on('response', (r) => {
    if (r.url().includes('/icons/') || /favicon|apple-touch|manifest|\.svg/.test(r.url())) {
      if (r.status() >= 400) gagal404.push(`${r.status()} ${r.url()}`)
    }
  })
  await p.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)

  const halaman = await p.evaluate(async () => {
    const link = (sel) => [...document.querySelectorAll(sel)].map((l) => l.getAttribute('href'))
    /* ambil logo yang benar-benar terlihat (sidebar di desktop, topbar di HP) */
    const img = [...document.querySelectorAll('img[alt="FS Inspection"]')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0)[0]
    const verCache = (document.querySelector('link[rel="icon"]')?.getAttribute('href') || '').match(/v=(\w+)/)?.[1] || ''
    const muat = img ? img.el.complete && img.el.naturalWidth > 0 : false
    const rect = img ? img.r : null
    let manifest = null
    try {
      const r = await fetch(document.querySelector('link[rel="manifest"]').href, { cache: 'no-store' })
      manifest = await r.json()
    } catch (e) {
      manifest = { error: String(e) }
    }
    return {
      verCache,
      favicon: link('link[rel="icon"]'),
      apple: link('link[rel="apple-touch-icon"]'),
      logoMuat: muat,
      logoUkuran: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      logoSrc: img ? img.el.currentSrc || img.el.src : null,
      jumlahLogo: document.querySelectorAll('img[alt="FS Inspection"]').length,
      manifestIkon: (manifest?.icons || []).map((i) => `${i.sizes}:${i.purpose || 'any'}`),
      /* versi cache diambil dari index.html supaya uji tidak usang saat ?v= dinaikkan */
      manifestVersi: JSON.stringify(manifest).match(new RegExp(verCache, 'g'))?.length || 0,
      swAktif: !!(await navigator.serviceWorker?.getRegistration?.()),
    }
  })
  cek(`[${vp.n}] logo baru tampil di sidebar`, halaman.logoMuat && halaman.logoUkuran?.[0] >= 24, JSON.stringify({ src: halaman.logoSrc, ukuran: halaman.logoUkuran }))
  const vNow = halaman.verCache
  cek(`[${vp.n}] semua favicon memakai ?v= yang sama (${vNow})`, (halaman.favicon || []).every((h) => h.includes(`v=${vNow}`)), JSON.stringify(halaman.favicon))
  cek(`[${vp.n}] apple-touch-icon memakai ?v= yang sama (${vNow})`, (halaman.apple || []).every((h) => h.includes(`v=${vNow}`)), JSON.stringify(halaman.apple))
  cek(
    `[${vp.n}] manifest memuat ikon 192/512 + maskable`,
    ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable'].every((x) => halaman.manifestIkon.includes(x)),
    JSON.stringify(halaman.manifestIkon)
  )
  cek(`[${vp.n}] manifest ikon memakai versi cache baru`, halaman.manifestVersi >= 4, String(halaman.manifestVersi))
  cek(`[${vp.n}] service worker aktif`, halaman.swAktif, String(halaman.swAktif))
  cek(`[${vp.n}] tidak ada ikon/manifest yang 404`, gagal404.length === 0, gagal404.slice(0, 3).join(' | '))
  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))

  await p.screenshot({ path: `/home/user/tools/logo-${vp.n}.png` })
  await ctx.close()
}
await b.close()
console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))

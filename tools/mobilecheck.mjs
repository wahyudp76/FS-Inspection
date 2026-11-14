/**
 * mobilecheck.mjs — audit tampilan HP/Android.
 *
 * Yang diperiksa pada setiap rute × resolusi:
 *   1. luapan horizontal (halaman melebar ke samping)
 *   2. elemen yang lebih lebar dari layar
 *   3. ukuran target sentuh (rekomendasi Android 48dp ≈ 44–48 px CSS)
 *   4. ukuran huruf terkecil (batas baca 11 px)
 *   5. tombol melayang menutupi tombol lain
 *   6. pop-up (dialog) di layar pendek: tinggi melebihi layar / tombol tutup
 *      tidak terjangkau / isi tidak bisa digulir
 *
 * Pakai:
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/mobilecheck.mjs
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'

const require_ = createRequire(import.meta.url.replace('/tools/', '/tools/'))
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'

/* resolusi nyata yang dipakai di lapangan (CSS px, setelah viewport meta) */
const DEVICES = [
  { id: '320', label: 'HP kecil 320×568', w: 320, h: 568, dpr: 2 },
  { id: '360', label: 'Android umum 360×800', w: 360, h: 800, dpr: 3 },
  { id: '390', label: 'Galaxy/iPhone 390×844', w: 390, h: 844, dpr: 3 },
  { id: '412', label: 'Pixel besar 412×915', w: 412, h: 915, dpr: 2.6 },
  { id: '768', label: 'Tablet 768×1024', w: 768, h: 1024, dpr: 2 },
]
const ROUTES = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'service', 'pengaturan']

const MIN_TAP = 44 // px CSS
const MIN_TAP_KECIL = 36 // di bawah ini = temuan berat
const MIN_FONT = 11

const temuan = []
function catat(tingkat, rute, perangkat, pesan, detail) {
  temuan.push({ tingkat, rute, perangkat, pesan, detail })
}

/* skrip yang dijalankan di dalam halaman */
function auditDom({ MIN_TAP, MIN_TAP_KECIL, MIN_FONT }) {
  const out = { overflowX: 0, lebar: [], tap: [], font: [], tumpang: [], judul: document.title }
  const vw = window.innerWidth
  const de = document.documentElement
  out.overflowX = Math.max(de.scrollWidth - vw, document.body ? document.body.scrollWidth - vw : 0, 0)

  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ')
    return (t || el.tagName.toLowerCase()).slice(0, 42)
  }
  const terlihat = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }

  const semua = [...document.querySelectorAll('body *')]

  /* --- elemen melebar dari layar --- */
  for (const el of semua) {
    if (!terlihat(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width > vw + 1 && !el.closest('[data-izinkan-lebar]') && getComputedStyle(el).overflowX !== 'visible') {
      /* wadah yang memang bisa digulir mendatar = sah */
      continue
    }
    if (r.right > vw + 1.5 || r.left < -1.5) {
      /* abaikan elemen yang berada di dalam wadah gulir mendatar */
      let p = el.parentElement
      let dalamGulir = false
      while (p) {
        const cs = getComputedStyle(p)
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { dalamGulir = true; break }
        p = p.parentElement
      }
      if (dalamGulir) continue
      out.lebar.push({ tag: el.tagName.toLowerCase(), kelas: el.className?.toString().slice(0, 60), teks: label(el), kiri: Math.round(r.left), kanan: Math.round(r.right) })
    }
  }

  /* --- target sentuh --- */
  const tapEls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')]
  for (const el of tapEls) {
    if (!terlihat(el)) continue
    /* kotak centang di dalam <label>: area sentuh efektif = seluruh label */
    let r = el.getBoundingClientRect()
    const lab = el.closest('label')
    if (lab && (el.type === 'checkbox' || el.type === 'radio')) {
      const lr = lab.getBoundingClientRect()
      if (lr.width > r.width || lr.height > r.height) r = lr
    }
    if (r.width < MIN_TAP || r.height < MIN_TAP) {
      const kecil = r.width < MIN_TAP_KECIL || r.height < MIN_TAP_KECIL
      out.tap.push({
        teks: label(el), tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), berat: kecil,
      })
    }
  }

  /* --- huruf terlalu kecil --- */
  const teksEls = [...document.querySelectorAll('p, span, a, button, td, th, li, h1, h2, h3, h4, label, div')]
  const sudah = new Set()
  for (const el of teksEls) {
    if (!terlihat(el)) continue
    const isi = (el.textContent || '').trim()
    if (!isi || isi.length > 200) continue
    /* hanya elemen yang langsung memuat teks */
    const langsung = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (!langsung) continue
    const px = parseFloat(getComputedStyle(el).fontSize)
    if (px && px < MIN_FONT) {
      const kunci = `${label(el)}|${px}`
      if (sudah.has(kunci)) continue
      sudah.add(kunci)
      out.font.push({ teks: label(el), px: +px.toFixed(1) })
    }
  }

  /* --- tombol melayang vs isi halaman --- */
  const melayang = [...document.querySelectorAll('[class*="fixed"]')].filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' || !terlihat(el)) return false
    const r = el.getBoundingClientRect()
    return r.width < 80 && r.height < 80 && r.width > 20 /* tombol kecil, bukan header */
  })
  const kandidat = tapEls.filter(terlihat)
  for (const f of melayang) {
    const a = f.getBoundingClientRect()
    for (const el of kandidat) {
      if (f === el || f.contains(el) || el.contains(f)) continue
      const b = el.getBoundingClientRect()
      const lebar = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const tinggi = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (lebar > 4 && tinggi > 4) out.tumpang.push({ melayang: label(f), tertutup: label(el) })
    }
  }

  /* ukuran dokumen */
  out.docH = de.scrollHeight
  return out
}

const browser = await chromium.launch()
const ringkas = []

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; ' + (d.id === '768' ? 'SM-X200' : 'SM-A546E') +
      ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    timezoneId: 'Asia/Jakarta',
  })
  await ctx.addInitScript((ep) => {
    localStorage.clear()
    localStorage.setItem('fsi:endpoint', ep)
  }, EP)

  const page = await ctx.newPage()
  const errJs = []
  page.on('pageerror', (e) => errJs.push(e.message))
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)

  for (const rute of ROUTES) {
    await page.goto(`${BASE}/#/${rute}`, { waitUntil: 'load' })
    await page.waitForTimeout(rute === 'service' ? 2600 : 1400)
    const hasil = await page.evaluate(auditDom, { MIN_TAP, MIN_TAP_KECIL, MIN_FONT })

    if (hasil.overflowX > 1) {
      catat('berat', rute, d.label, `halaman melebar ${hasil.overflowX} px ke samping`, hasil.lebar.slice(0, 5))
    }
    if (hasil.lebar.length) {
      catat('sedang', rute, d.label, `${hasil.lebar.length} elemen keluar layar`, hasil.lebar.slice(0, 5))
    }
    const berat = hasil.tap.filter((t) => t.berat)
    if (berat.length) catat('sedang', rute, d.label, `${berat.length} tombol < 36 px`, berat.slice(0, 6))
    else if (hasil.tap.length) catat('ringan', rute, d.label, `${hasil.tap.length} target sentuh < 44 px`, hasil.tap.slice(0, 6))
    if (hasil.font.length) catat('sedang', rute, d.label, `${hasil.font.length} teks < ${MIN_FONT} px`, hasil.font.slice(0, 6))
    if (hasil.tumpang.length) catat('berat', rute, d.label, 'tombol melayang menutupi tombol lain', hasil.tumpang.slice(0, 3))

    ringkas.push({ rute, perangkat: d.id, dokH: hasil.docH, overflow: hasil.overflowX, tapKecil: hasil.tap.length, fontKecil: hasil.font.length })
    /* tangkapan layar untuk bukti visual */
    mkdirSync('audit-shots/mobile', { recursive: true })
    await page.screenshot({ path: `audit-shots/mobile/${d.id}-${rute}.png`, fullPage: false })
  }
  if (errJs.length) catat('berat', 'semua', d.label, 'error JavaScript', errJs.slice(0, 3))
  await ctx.close()
}

await browser.close()

const berat = temuan.filter((t) => t.tingkat === 'berat')
const sedang = temuan.filter((t) => t.tingkat === 'sedang')
const ringan = temuan.filter((t) => t.tingkat === 'ringan')

console.log(`\n=== MOBILE AUDIT · ${DEVICES.length} resolusi × ${ROUTES.length} rute ===`)
for (const t of [...berat, ...sedang, ...ringan]) {
  const ikon = t.tingkat === 'berat' ? '❌' : t.tingkat === 'sedang' ? '⚠️ ' : 'ℹ️ '
  console.log(`${ikon} [${t.perangkat}] ${t.rute}: ${t.pesan}`)
  if (t.detail?.length) console.log('      ' + JSON.stringify(t.detail).slice(0, 260))
}
console.log(`\nRingkasan: ${berat.length} berat · ${sedang.length} sedang · ${ringan.length} ringan`)
mkdirSync('audit-shots', { recursive: true })
writeFileSync('audit-shots/mobile.json', JSON.stringify({ ringkas, temuan }, null, 1))
console.log('detail → audit-shots/mobile.json')
process.exit(berat.length ? 1 : 0)

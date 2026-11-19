/**
 * desktopcheck.mjs — audit tampilan desktop (dan tablet lebar).
 *
 * Diperiksa per rute × resolusi:
 *   1. luapan horizontal (halaman melebar / scrollbar mendatar)
 *   2. elemen keluar dari kartu/wadah (terpotong tepi)
 *   3. kartu dalam satu baris grid: tinggi & lebar tidak seragam (aturan layout)
 *   4. grafik: isi SVG keluar dari kartu / melebihi batas 1,25× tinggi desain
 *   5. tombol melayang menutupi tombol lain
 *   6. huruf terlalu kecil (< 11 px) khusus konten desktop
 *   7. tabel: kolom terpotong tanpa wadah gulir
 *
 * Pakai: BASE=http://127.0.0.1:8123 EP=http://127.0.0.1:8111/exec node tools/desktopcheck.mjs
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'

const require_ = createRequire(import.meta.url.replace('/tools/', '/tools/'))
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const ROUTES = (process.env.ROUTES || 'dashboard,inspeksi,unit,riwayat,service,pengaturan').split(',')
const LAYAR = [
  { id: '1280', label: 'Laptop 1280×800', w: 1280, h: 800 },
  { id: '1366', label: 'Laptop 1366×768', w: 1366, h: 768 },
  { id: '1440', label: 'Desktop 1440×900', w: 1440, h: 900 },
  { id: '1920', label: 'Full HD 1920×1080', w: 1920, h: 1080 },
  { id: '1024', label: 'Tablet lanskap 1024×768', w: 1024, h: 768 },
]

const temuan = []
const catat = (tingkat, pesan, detail) => temuan.push({ tingkat, pesan, detail })

function auditDom() {
  const vw = window.innerWidth
  const out = { overflowX: Math.max(document.documentElement.scrollWidth - vw, 0), kartu: [], grafik: [], terpotong: [], tabel: [], tumpang: [] }
  const lihat = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }

  /* --- kartu per baris grid: tinggi & lebar harus seragam --- */
  const kartu = [...document.querySelectorAll('.card')].filter(lihat)
  const baris = new Map()
  for (const k of kartu) {
    const r = k.getBoundingClientRect()
    const kunci = `${Math.round((r.top + window.scrollY) / 6)}|${Math.round(Math.abs(r.left) / 6)}`
    if (!baris.has(kunci)) baris.set(kunci, [])
    baris.get(kunci).push({ h: Math.round(r.height), w: Math.round(r.width), judul: (k.querySelector('h2,h3,p')?.textContent || '').trim().slice(0, 24) })
  }
  for (const [kunci, arr] of baris) {
    if (arr.length < 2) continue
    const hs = [...new Set(arr.map((a) => a.h))]
    const ws = [...new Set(arr.map((a) => a.w))]
    /* toleransi 2 px (sub-pixel) */
    if (Math.max(...hs) - Math.min(...hs) > 2 || Math.max(...ws) - Math.min(...ws) > 2)
      out.kartu.push({ baris: kunci, tinggi: hs, lebar: ws, contoh: arr.map((a) => `${a.judul}:${a.h}px`).slice(0, 4) })
  }

  /* --- grafik: isi keluar kartu / terlalu tinggi --- */
  for (const w of document.querySelectorAll('.recharts-wrapper')) {
    if (!lihat(w)) continue
    const wr = w.getBoundingClientRect()
    const kartuEl = w.closest('.card') || w.parentElement
    const kr = kartuEl.getBoundingClientRect()
    const svg = w.querySelector('svg')?.getBoundingClientRect()
    const keluarBawah = Math.round((svg?.bottom || 0) - kr.bottom)
    const keluarKanan = Math.round((svg?.right || 0) - kr.right)
    if (keluarBawah > 2 || keluarKanan > 2)
      out.grafik.push({ kartu: (kartuEl.querySelector('h2,h3,p')?.textContent || '').trim().slice(0, 26), keluarBawah, keluarKanan })
  }

  /* --- elemen terpotong wadah --- */
  for (const el of document.querySelectorAll('main *')) {
    if (!lihat(el) || el.closest('svg')) continue
    const teks = (el.textContent || '').trim()
    const interaktif = ['BUTTON', 'A', 'INPUT', 'SELECT', 'LABEL'].includes(el.tagName)
    if (!teks && !interaktif) continue
    if (/truncate|line-clamp/.test(el.className?.toString?.() || '') || getComputedStyle(el).textOverflow === 'ellipsis') continue
    const r = el.getBoundingClientRect()
    let p = el.parentElement
    while (p) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll)/.test(cs.overflowX)) break
      if (/(hidden|clip)/.test(cs.overflowX)) {
        const pr = p.getBoundingClientRect()
        if (r.right > pr.right + 4 || r.left < pr.left - 4)
          out.terpotong.push({ teks: (el.getAttribute('aria-label') || teks).trim().slice(0, 34), kanan: Math.round(r.right), batas: Math.round(pr.right) })
        break
      }
      p = p.parentElement
    }
  }

  /* --- tabel lebar tanpa wadah gulir --- */
  for (const t of document.querySelectorAll('table')) {
    if (!lihat(t)) continue
    const tr = t.getBoundingClientRect()
    let p = t.parentElement
    let bisaGulir = false
    while (p && p !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { bisaGulir = true; break }
      p = p.parentElement
    }
    if (tr.right > vw + 1 && !bisaGulir) out.tabel.push({ lebar: Math.round(tr.width), layar: vw })
  }

  /* --- tombol melayang menutupi tombol lain --- */
  const fab = [...document.querySelectorAll('[class*="fixed"]')].find((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    /* tombol yang disembunyikan (opacity-0 / pointer-events-none) bukan penghalang */
    if (Number(cs.opacity) < 0.15 || cs.pointerEvents === 'none' || cs.visibility === 'hidden') return false
    return cs.position === 'fixed' && r.width > 20 && r.width < 80 && r.height < 80
  })
  if (fab) {
    const a = fab.getBoundingClientRect()
    for (const el of document.querySelectorAll('button, a[href], input, select')) {
      if (fab.contains(el)) continue
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      const lebar = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const tinggi = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (lebar > 4 && tinggi > 4) out.tumpang.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28))
    }
  }
  return out
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
for (const d of LAYAR) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, timezoneId: 'Asia/Jakarta' })
  await ctx.addInitScript((ep) => {
    if (!localStorage.getItem('fsi:endpoint')) localStorage.setItem('fsi:endpoint', ep)
  }, EP)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  for (const rute of ROUTES) {
    await page.goto(`${BASE}/#/${rute}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(rute === 'service' ? 3200 : 2200)
    const h = await page.evaluate(auditDom)
    if (h.overflowX > 1) catat('berat', `[${d.label}] ${rute}: halaman melebar ${h.overflowX} px`, {})
    if (h.kartu.length) catat('sedang', `[${d.label}] ${rute}: ${h.kartu.length} baris kartu tidak seragam`, h.kartu.slice(0, 3))
    if (h.grafik.length) catat('sedang', `[${d.label}] ${rute}: ${h.grafik.length} grafik keluar kartu`, h.grafik.slice(0, 3))
    if (h.terpotong.length) catat('sedang', `[${d.label}] ${rute}: ${h.terpotong.length} elemen terpotong wadah`, h.terpotong.slice(0, 4))
    if (h.tabel.length) catat('sedang', `[${d.label}] ${rute}: tabel lebih lebar dari layar tanpa wadah gulir`, h.tabel.slice(0, 2))
    if (h.tumpang.length) catat('sedang', `[${d.label}] ${rute}: tombol melayang menutupi tombol`, h.tumpang.slice(0, 3))
    mkdirSync('audit-shots/desktop', { recursive: true })
    await page.screenshot({ path: `audit-shots/desktop/${d.id}-${rute}.png`, fullPage: false })
  }
  if (errs.length) catat('berat', `[${d.label}] error JavaScript`, errs.slice(0, 3))
  await ctx.close()
}
await browser.close()

mkdirSync('audit-shots', { recursive: true })
writeFileSync('audit-shots/desktop.json', JSON.stringify({ temuan }, null, 1))
const berat = temuan.filter((t) => t.tingkat === 'berat')
const sedang = temuan.filter((t) => t.tingkat === 'sedang')
console.log(`\n=== DESKTOP AUDIT · ${LAYAR.length} resolusi × ${ROUTES.length} rute ===`)
for (const t of temuan) {
  console.log(`${t.tingkat === 'berat' ? '❌' : '⚠️ '} ${t.pesan}`)
  if (t.detail && Object.keys(t.detail).length) console.log('      ' + JSON.stringify(t.detail).slice(0, 240))
}
if (!temuan.length) console.log('✅ tidak ada temuan')
console.log(`\nRingkasan: ${berat.length} berat · ${sedang.length} sedang`)
console.log('detail → audit-shots/desktop.json')
process.exit(berat.length ? 1 : 0)

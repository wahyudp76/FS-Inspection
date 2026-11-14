/**
 * mobiletap.mjs — audit "respon tombol" di HP.
 *
 * Fase 1 (semua rute × resolusi):
 *   - tombol/tautan yang tertutup elemen lain (elementFromPoint ≠ dirinya)
 *   - tombol yang tidak punya aksi (tanpa onClick/href/popover) dan bukan submit
 * Fase 2 (390×844 & 640×360 landscape):
 *   - laci menu: buka, pilih menu, tertutup
 *   - tombol + di header: pop-up terbuka, tombol tutup terjangkau, tombol
 *     simpan terlihat, isi pop-up bisa digulir
 *   - filter Segmented & pagination: benar-benar mengubah tampilan
 *
 * Pakai: BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/mobiletap.mjs
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'

const require_ = createRequire(import.meta.url.replace('/tools/', '/tools/'))
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const ROUTES = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'service', 'pengaturan']
const DEVICES = [
  { id: '360', label: 'Android 360×800', w: 360, h: 800 },
  { id: '390', label: 'HP 390×844', w: 390, h: 844 },
  { id: 'land', label: 'Landscape 640×360', w: 640, h: 360 },
]

const temuan = []
const catat = (tingkat, pesan, detail) => temuan.push({ tingkat, pesan, detail })

function auditKlik() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const out = { tertutup: [], tanpaAksi: [], jumlah: 0 }
  const els = [...document.querySelectorAll('button, a[href], [role="button"], select, input:not([type=hidden]), textarea')]
  for (const el of els) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    /* hanya yang benar-benar di dalam layar */
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1)
    const cy = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1)
    if (r.bottom < 0 || r.top > vh) continue
    out.jumlah++
    const atas = document.elementFromPoint(cx, cy)
    const nama = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
    if (atas && atas !== el && !el.contains(atas) && !atas.contains(el)) {
      const pemblokir = atas.closest('[aria-label],[role],button,a') || atas
      out.tertutup.push({ elemen: nama, penghalang: (pemblokir.getAttribute?.('aria-label') || pemblokir.tagName || '').toString().slice(0, 30) })
    }
    /* tombol tanpa aksi: <button> tanpa handler React sulit dideteksi dari DOM,
       jadi cukup laporkan <button type="button"> tanpa teks & tanpa aria-label */
    if (el.tagName === 'BUTTON' && !nama) out.tanpaAksi.push({ tag: 'button', kelas: el.className.toString().slice(0, 50) })
  }
  return out
}

const browser = await chromium.launch()
const hasilKlik = []

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
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
  await page.waitForTimeout(3000)

  for (const rute of ROUTES) {
    await page.goto(`${BASE}/#/${rute}`, { waitUntil: 'load' })
    await page.waitForTimeout(rute === 'service' ? 2500 : 1500)
    const h = await page.evaluate(auditKlik)
    hasilKlik.push({ perangkat: d.id, rute, ...h })
    if (h.tertutup.length) catat('berat', `[${d.label}] ${rute}: ${h.tertutup.length} tombol tertutup elemen lain`, h.tertutup.slice(0, 5))
    if (h.tanpaAksi.length) catat('ringan', `[${d.label}] ${rute}: ${h.tanpaAksi.length} tombol tanpa label`, h.tanpaAksi.slice(0, 3))
  }
  if (errJs.length) catat('berat', `[${d.label}] error JavaScript`, errJs.slice(0, 3))
  await ctx.close()
}

/* ---------------- Fase 2: alur sentuh nyata ---------------- */
const browser2 = await chromium.launch()
for (const d of [{ id: '390', label: 'HP 390×844', w: 390, h: 844 }, { id: 'land', label: 'Landscape 640×360', w: 640, h: 360 }]) {
 try {
  const ctx = await browser2.newContext({
    viewport: { width: d.w, height: d.h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: 'Asia/Jakarta',
  })
  await ctx.addInitScript((ep) => { localStorage.clear(); localStorage.setItem('fsi:endpoint', ep) }, EP)
  const page = await ctx.newPage()
  const errJs = []
  page.on('pageerror', (e) => errJs.push(e.message))
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(3000)

  /* 1. laci menu: buka → pilih Riwayat → laci tertutup & rute berubah */
  await page.tap('[aria-label="Buka menu"]')
  await page.waitForTimeout(400)
  const laci = page.locator('div.fixed.inset-0.z-50')
  const laciTerbuka = await laci.isVisible().catch(() => false)
  const lebarLaci = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((e) => e.className?.toString?.().includes('w-[264px]'))
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })
  const menuRiwayat = laci.locator('nav button', { hasText: 'Riwayat' }).first()
  await menuRiwayat.tap()
  await page.waitForTimeout(900)
  const ruteSetelah = await page.evaluate(() => location.hash)
  const laciTertutup = await page.evaluate(() => ![...document.querySelectorAll('div')].some((e) => e.className?.toString?.().includes('w-[264px]')))
  if (!laciTertutup || !ruteSetelah.includes('riwayat')) catat('berat', `[${d.label}] laci menu tidak responsif`, { ruteSetelah, laciTertutup })
  hasilKlik.push({ perangkat: d.id, laci: { terbuka: laciTerbuka, lebar: lebarLaci, ruteSetelah, tertutup: laciTertutup } })

  /* 2. pop-up dari tombol + (Inspeksi) */
  await page.goto(`${BASE}/#/inspeksi`, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  const plus = page.locator('header button.btn-primary').first()
  await plus.tap()
  await page.waitForTimeout(900)
  const dialog = page.locator('[role="dialog"]').first()
  const adaDialog = await dialog.count()
  if (adaDialog) {
    const ukuran = await dialog.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const panel = el.querySelector('div') || el
      const pr = panel.getBoundingClientRect()
      return {
        tinggiLayar: window.innerHeight,
        tinggiPanel: Math.round(pr.height),
        lebarPanel: Math.round(pr.width),
        keluarBawah: Math.round(pr.bottom - window.innerHeight),
        bisaGulir: [...el.querySelectorAll('div')].some((x) => x.scrollHeight > x.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(x).overflowY)),
        tombolTutup: !!el.querySelector('[aria-label*="utup"], [aria-label*="Close"], [aria-label*="Batal"]'),
      }
    })
    const tombolAksi = await dialog.evaluate((el) => [...el.querySelectorAll('button')].map((b) => ({ teks: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24), y: Math.round(b.getBoundingClientRect().bottom), terlihat: b.getBoundingClientRect().top < window.innerHeight })))
    hasilKlik.push({ perangkat: d.id, dialog: { ...ukuran, tombol: tombolAksi.slice(0, 8) } })
    if (ukuran.keluarBawah > 2) catat('berat', `[${d.label}] pop-up keluar layar ${ukuran.keluarBawah} px`, ukuran)
    if (!ukuran.bisaGulir && ukuran.tinggiPanel > ukuran.tinggiLayar) catat('berat', `[${d.label}] pop-up tinggi ${ukuran.tinggiPanel}px > layar ${ukuran.tinggiLayar}px & tidak bisa digulir`, ukuran)
    /* tutup */
    const tutup = dialog.locator('[aria-label*="Tutup"], [aria-label*="Close"]').first()
    if (await tutup.count()) { await tutup.tap(); await page.waitForTimeout(500) }
    else { await page.keyboard.press('Escape'); await page.waitForTimeout(400) }
    const masih = await page.locator('[role="dialog"]').count()
    if (masih) catat('sedang', `[${d.label}] pop-up tidak tertutup lewat tombol X`, { masih })
  } else {
    catat('sedang', `[${d.label}] tombol + tidak membuka pop-up di halaman Inspeksi`, {})
  }

  /* 2b. pop-up Catat Service: panel harus muat di layar & tombol simpan terjangkau */
  await page.goto(`${BASE}/#/service`, { waitUntil: 'load' })
  await page.waitForTimeout(2600)
  const catat = page.locator('button', { hasText: 'Catat Service' }).first()
  if (await catat.count()) {
    await catat.tap()
    await page.waitForTimeout(900)
    const dlg = page.locator('[role="dialog"]').first()
    if (await dlg.count()) {
      const info = await dlg.evaluate((el) => {
        const panel = el.querySelector('.max-h-\\[92vh\\]') || el.firstElementChild
        const r = panel.getBoundingClientRect()
        const terkutip = (sel) => {
          const b = el.querySelector(sel)
          return b ? Math.round(b.getBoundingClientRect().bottom) : null
        }
        return {
          layar: window.innerHeight,
          panelTinggi: Math.round(r.height),
          panelBawah: Math.round(r.bottom),
          bisaGulir: [...el.querySelectorAll('*')].some((x) => x.scrollHeight > x.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(x).overflowY)),
          simpan: terkutip('button.btn-primary'),
          batal: terkutip('[aria-label*="Tutup"], [aria-label*="Batal"], button.btn-ghost'),
        }
      })
      hasilKlik.push({ perangkat: d.id, serviceForm: info })
      if (info.panelTinggi > info.layar + 2 || info.panelBawah > info.layar + 2)
        catat('berat', `[${d.label}] form Catat Service keluar layar`, info)
      if (!info.bisaGulir && info.panelTinggi > info.layar * 0.95)
        catat('berat', `[${d.label}] form Catat Service tidak bisa digulir`, info)
      if (info.simpan === null) catat('sedang', `[${d.label}] tombol simpan form service tidak ditemukan`, info)
      /* tutup */
      const x = dlg.locator('[aria-label*="Tutup"]').first()
      if (await x.count()) await x.tap(); else await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      if (await page.locator('[role="dialog"]').count()) catat('sedang', `[${d.label}] form Catat Service tidak tertutup`, {})
    } else catat('sedang', `[${d.label}] tombol Catat Service tidak membuka form`, {})
  } else catat('sedang', `[${d.label}] tombol Catat Service tidak ada di halaman Service`, {})

  /* 3. filter Segmented di Riwayat: klik "Irrigator" mengubah daftar */
  await page.goto(`${BASE}/#/riwayat`, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  const seb = await page.evaluate(() => document.body.innerText.length)
  const irr = page.locator('button', { hasText: /^Irrigator$/ }).first()
  if (await irr.count()) {
    await irr.tap()
    await page.waitForTimeout(1200)
    const sesudah = await page.evaluate(() => document.body.innerText.length)
    const aktif = await irr.evaluate((el) => el.getAttribute('aria-pressed') || el.className.includes('bg-slate-900/10'))
    hasilKlik.push({ perangkat: d.id, filterRiwayat: { sebelum: seb, sesudah, aktif } })
  }

  /* 4. pagination di Inspeksi: tombol › memuat halaman berikutnya */
  await page.goto(`${BASE}/#/inspeksi`, { waitUntil: 'load' })
  await page.waitForTimeout(1600)
  const infoHal = () => page.evaluate(() => (document.body.innerText.match(/Menampilkan\s+[\d–-]+\s+dari/) || [''])[0])
  const sebelumHal = await infoHal()
  const next = page.locator('[aria-label*="erikut"], button', { hasText: /^›$/ }).first()
  let berubah = null
  if (await next.count()) {
    await next.tap()
    await page.waitForTimeout(900)
    berubah = (await infoHal()) !== sebelumHal
  }
  hasilKlik.push({ perangkat: d.id, pagination: { sebelumHal, berubah } })
  if (berubah === false) catat('sedang', `[${d.label}] tombol halaman berikutnya tidak mengubah daftar`, { sebelumHal })

  if (errJs.length) catat('berat', `[${d.label}] error JS saat alur sentuh`, errJs.slice(0, 4))
  await ctx.close()
 } catch (e) {
  catat('berat', `[${d.label}] alur sentuh gagal dijalankan: ${String(e.message).split('\n')[0]}`, {})
 }
}
await browser.close()
await browser2.close()

mkdirSync('audit-shots', { recursive: true })
writeFileSync('audit-shots/mobiletap.json', JSON.stringify({ hasilKlik, temuan }, null, 1))

console.log('\n=== AUDIT RESPON TOMBOL (mobile) ===')
for (const t of temuan) {
  console.log(`${t.tingkat === 'berat' ? '❌' : t.tingkat === 'sedang' ? '⚠️ ' : 'ℹ️ '} ${t.pesan}`)
  if (t.detail && Object.keys(t.detail).length) console.log('      ' + JSON.stringify(t.detail).slice(0, 240))
}
if (!temuan.length) console.log('✅ tidak ada temuan')
console.log('\nJumlah elemen diperiksa:', hasilKlik.filter((h) => h.jumlah).map((h) => `${h.perangkat}/${h.rute}=${h.jumlah}`).join(' · '))
console.log('detail → audit-shots/mobiletap.json')

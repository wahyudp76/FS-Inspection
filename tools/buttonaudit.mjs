/**
 * buttonaudit.mjs — uji fungsi SEMUA tombol di setiap rute (desktop & HP).
 *
 * Untuk setiap jenis tombol di header + <main>:
 *   - diklik, lalu dilihat reaksinya: rute berubah? pop-up terbuka? isi berubah?
 *     dropdown/popover terbuka? pilihan aktif berubah? nilai input berubah?
 *   - error JavaScript yang muncul dicatat
 *   - tombol yang tidak bereaksi sama sekali ditandai (diulang sekali dari
 *     halaman bersih agar klik yang hanya menutup dropdown tidak dianggap mati)
 *   - pop-up yang terbuka tetapi tidak bisa ditutup ditandai
 *
 * Pakai:
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/buttonaudit.mjs
 *   MODE=desktop|mobile|both (default both) · ROUTES=dashboard,inspeksi,...
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'

const require_ = createRequire(import.meta.url.replace('/tools/', '/tools/'))
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const MODE = process.env.MODE || 'both'
const ROUTES = (process.env.ROUTES || 'dashboard,inspeksi,unit,riwayat,service,pengaturan').split(',')

const VIEW = {
  desktop: { label: 'Desktop 1440x900', w: 1440, h: 900, dpr: 1, mobile: false },
  mobile: { label: 'HP 390x844', w: 390, h: 844, dpr: 2, mobile: true },
}

const temuan = []
const catat = (tingkat, pesan, detail) => temuan.push({ tingkat, pesan, detail })

/* daftar tombol unik (jenis, bukan setiap baris tabel) */
function daftarTombol() {
  const semua = [
    ...document.querySelectorAll('header button, header a[href]'),
    ...document.querySelectorAll('main button, main a[href], main [role="button"]'),
  ]
  const unik = []
  const sudah = new Set()
  let n = 0
  for (const el of semua) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (r.width < 2 || r.height < 2) continue
    if (el.closest('[role="dialog"]')) continue
    const teks = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('href') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 46)
    const kunci = `${el.tagName}|${teks.replace(/\d+/g, '#')}`
    if (sudah.has(kunci)) continue
    sudah.add(kunci)
    el.dataset.uji = String(n++)
    unik.push({
      idx: n - 1,
      teks,
      tag: el.tagName.toLowerCase(),
      luar: el.target === '_blank' || /^https?:/.test(el.getAttribute('href') || ''),
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      pilihan: el.getAttribute('aria-pressed') !== null,
      /* tombol yang sedang aktif (tab/filter terpilih) — diklik memang tidak berubah */
      aktif:
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-selected') === 'true' ||
        /bg-slate-900\/10|ring-brand|border-brand\/50|font-semibold text-slate-900/.test(el.className?.toString?.() || ''),
    })
  }
  return { unik, total: semua.length }
}

const potret = () => {
  /* seluruh body, bukan hanya <main>: laci/panel/tooltip bisa berada di luar main */
  const t = document.body.innerText || ''
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0
  return {
    jumlah: document.body.querySelectorAll('*').length,
    hash: location.hash,
    dialog: document.querySelectorAll('[role="dialog"]').length,
    teks: h,
    panjang: t.length,
    /* dropdown / popover / pilihan aktif */
    buka: document.querySelectorAll('[role="listbox"], [role="menu"], [role="option"]').length,
    terbuka: document.querySelectorAll('[aria-expanded="true"]').length,
    pilihan: [...document.querySelectorAll('[aria-pressed="true"]')].map((e) => (e.textContent || '').trim().slice(0, 20)).join('|'),
    nilai: [...document.querySelectorAll('main input, main select')].map((e) => e.value).join('|'),
    toast: document.querySelectorAll('[role="status"]').length,
  }
}

/* Klik berdasarkan NAMA tombol, dihitung ulang setiap kali: daftar tombol bisa
   berubah setelah tombol lain ditekan (filter/pop-up), jadi indeks tidak stabil. */
function klikNama(nama) {
  const semua = [
    ...document.querySelectorAll('header button, header a[href]'),
    ...document.querySelectorAll('main button, main a[href], main [role="button"]'),
  ]
  const cocok = []
  const sudah = new Set()
  for (const el of semua) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (r.width < 2 || r.height < 2) continue
    if (el.closest('[role="dialog"]')) continue
    const teks = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('href') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 46)
    const kunci = `${el.tagName}|${teks.replace(/\d+/g, '#')}`
    if (sudah.has(kunci)) continue
    sudah.add(kunci)
    cocok.push({ el, hitungan: teks })
  }
  const target = cocok.find((c) => c.hitungan === nama)
  if (!target) return false
  target.el.scrollIntoView({ block: 'center' })
  target.el.click()
  return true
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })

for (const mode of MODE === 'both' ? ['desktop', 'mobile'] : [MODE]) {
  const v = VIEW[mode]
  for (const rute of ROUTES) {
    const ctx = await browser.newContext({
      viewport: { width: v.w, height: v.h },
      deviceScaleFactor: v.dpr,
      isMobile: v.mobile,
      hasTouch: v.mobile,
      acceptDownloads: true,
      timezoneId: 'Asia/Jakarta',
    })
    await ctx.addInitScript((ep) => {
      if (!localStorage.getItem('fsi:endpoint')) localStorage.setItem('fsi:endpoint', ep)
    }, EP)
    const url = `${BASE}/#/${rute}`
    const jeda = rute === 'service' ? 2600 : 1600
    const bukaHalaman = async () => {
      const page = await ctx.newPage()
      page.setDefaultTimeout(20000)
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(jeda)
      return page
    }

    let page = await bukaHalaman()
    const { unik, total } = await page.evaluate(daftarTombol)
    console.log(`${v.label}/${rute}: ${total} tombol · ${unik.length} jenis diuji`)
    await page.close()

    for (const t of unik) {
      /* halaman baru untuk setiap tombol → tidak ada sisa pop-up/dropdown */
      page = await bukaHalaman()
      const errs = []
      const onErr = (e) => errs.push(e.message)
      page.on('pageerror', onErr)
      let konfirmasi = null
      const onDialog = async (d) => { konfirmasi = d.type(); await d.dismiss().catch(() => {}) }
      page.on('dialog', onDialog)

      const sebelum = await page.evaluate(potret)
      const popup = page.waitForEvent('popup', { timeout: 1200 }).catch(() => null)
      const unduhan = page.waitForEvent('download', { timeout: 1200 }).catch(() => null)
      await page.evaluate(klikNama, t.teks)
      await page.waitForTimeout(700)
      const bukaTab = !!(await popup)
      const unduhFile = !!(await unduhan)
      const sesudah = await page.evaluate(potret)

      const popupTerbuka = sesudah.dialog > 0
      const berubah = (a, b) =>
        a.dialog !== b.dialog || a.teks !== b.teks || a.hash !== b.hash || a.jumlah !== b.jumlah ||
        a.buka !== b.buka || a.terbuka !== b.terbuka || a.pilihan !== b.pilihan ||
        a.nilai !== b.nilai || a.toast !== b.toast
      const adaReaksi = popupTerbuka || bukaTab || unduhFile || !!konfirmasi || berubah(sebelum, sesudah) || t.disabled || t.luar

      /* pop-up: pastikan bisa ditutup */
      if (popupTerbuka) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
        let masih = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
        if (masih) {
          const x = page.locator('[role="dialog"] [aria-label*="Tutup"], [role="dialog"] button:has-text("Batal"), [role="dialog"] button:has-text("Tutup")').first()
          if (await x.count()) await x.click({ timeout: 2500 }).catch(() => {})
          await page.waitForTimeout(350)
          masih = await page.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
        }
        if (masih) catat('sedang', `[${v.label}] ${rute}: pop-up dari "${t.teks}" tidak bisa ditutup`, { tombol: t.teks })
      }
      page.off('pageerror', onErr)
      page.off('dialog', onDialog)

      if (errs.length) catat('berat', `[${v.label}] ${rute}: error JS saat menekan "${t.teks}"`, errs.slice(0, 2))
      else if (!adaReaksi && !t.aktif) catat('sedang', `[${v.label}] ${rute}: tombol "${t.teks}" tidak bereaksi`, { tombol: t.teks, tag: t.tag })
      else if (t.pilihan && !popupTerbuka && sesudah.teks === sebelum.teks && sesudah.pilihan === sebelum.pilihan)
        catat('ringan', `[${v.label}] ${rute}: pilihan "${t.teks}" tidak mengubah isi (mungkin sudah aktif)`, { tombol: t.teks })

      await page.close()
    }
    await ctx.close()
  }
}
await browser.close()

mkdirSync('audit-shots', { recursive: true })
writeFileSync('audit-shots/buttonaudit.json', JSON.stringify({ temuan }, null, 1))
const berat = temuan.filter((t) => t.tingkat === 'berat')
const sedang = temuan.filter((t) => t.tingkat === 'sedang')
const ringan = temuan.filter((t) => t.tingkat === 'ringan')
console.log('\n=== AUDIT FUNGSI TOMBOL ===')
for (const t of [...berat, ...sedang, ...ringan]) {
  console.log(`${t.tingkat === 'berat' ? '❌' : t.tingkat === 'sedang' ? '⚠️ ' : 'ℹ️ '} ${t.pesan}`)
  if (t.detail) console.log('      ' + JSON.stringify(t.detail).slice(0, 200))
}
console.log(`\nRingkasan: ${berat.length} berat · ${sedang.length} sedang · ${ringan.length} ringan`)
console.log('detail → audit-shots/buttonaudit.json')
process.exit(berat.length ? 1 : 0)

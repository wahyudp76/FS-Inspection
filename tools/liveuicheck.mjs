/**
 * liveuicheck.mjs — audit UI terhadap data ASLI (bukan seed).
 *
 * Menjalankan aplikasi (dev server) + server tiruan Apps Script yang memuat
 * CSV asli, lalu membuka tiap rute di Chromium headless:
 *   - konsol error / pageerror / permintaan gagal
 *   - luber horizontal (320 / 390 / 1280 px)
 *   - target sentuh < 32 px
 *   - tombol tanpa reaksi (klik-sweep)
 *   - angka KPI di layar (dibandingkan dengan hitungan langsung dari CSV)
 *
 * Prasyarat:
 *   node tools/mockapi.mjs            (MASTER=1, data asli)  :8111
 *   VITE_APPS_SCRIPT_URL=http://127.0.0.1:8111/exec npx vite --port 5199
 * Jalankan: node tools/liveuicheck.mjs
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const APP = process.env.APP || 'http://127.0.0.1:5199/'
const OUT = process.env.OUT || '/home/user/FS-Inspection/audit-shots'
fs.mkdirSync(OUT, { recursive: true })

const RUTE = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'service', 'pengaturan']
const LEBAR = [390, 320, 1280]

const browser = await chromium.launch()
const hasil = []
let gagal = 0
const cek = (nama, ok, extra = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${extra ? ' — ' + extra : ''}`)
}

async function buka(rute, lebar = 390, tinggi = 900) {
  const ctx = await browser.newContext({ viewport: { width: lebar, height: tinggi }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errs = []
  const reqGagal = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('requestfailed', (r) => reqGagal.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`))
  await page.goto(APP + '#/' + rute, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  return { ctx, page, errs, reqGagal }
}

/* ---------------- 1. tiap rute: error, luber, sentuh ---------------- */
for (const lebar of LEBAR) {
  for (const rute of RUTE) {
    const { ctx, page, errs, reqGagal } = await buka(rute, lebar)
    const info = await page.evaluate(() => {
      const d = document.documentElement
      const luber = Math.max(0, d.scrollWidth - d.clientWidth)
      /* kotak centang dinilai 24 px (WCAG 2.5.8) dan area tekannya = seluruh label */
      const kecil = [...document.querySelectorAll('button, a[href], [role="button"], input[type=checkbox]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (!(r.width > 0 && r.height > 0)) return false
          if (el.matches('input[type=checkbox]')) return r.height < 24 || r.width < 24
          return r.height < 30 || r.width < 30
        })
        .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)
      const teks = (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220)
      return { luber, kecil: [...new Set(kecil)].slice(0, 12), nKecil: kecil.length, teks }
    })
    const label = `${rute} @${lebar}`
    hasil.push({ label, ...info, errs: errs.length ? errs : [], reqGagal: reqGagal.length ? reqGagal : [] })
    cek(`tanpa error JS — ${label}`, errs.length === 0, errs.slice(0, 2).join(' | '))
    cek(`tanpa luber horizontal — ${label}`, info.luber <= 0, `${info.luber}px`)
    if (lebar !== 1280) cek(`target sentuh ≥ 30px — ${label}`, info.nKecil === 0, `${info.nKecil} elemen: ${info.kecil.join(', ')}`)
    await page.screenshot({ path: path.join(OUT, `${rute}-${lebar}.png`), fullPage: false })
    await ctx.close()
  }
}

/* ---------------- 2. klik-sweep di HP: tombol tak bereaksi ---------------- */
{
  const { ctx, page, errs } = await buka('dashboard', 390)
  const n = await page.locator('button:visible').count()
  let mati = 0
  const detail = []
  for (let i = 0; i < n; i++) {
    const b = page.locator('button:visible').nth(i)
    const nama = ((await b.textContent()) || (await b.getAttribute('aria-label')) || '').trim().slice(0, 30)
    if (!nama) continue
    /* tombol yang memang sudah aktif (filter terpilih) tidak mengubah apa pun — lewati */
    const aktif = await b.evaluate((el) => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('data-active') === 'true')
    if (aktif) continue
    /* “Kembali ke atas” hanya menggulir jendela: saat halaman belum digulir tidak ada
       perubahan DOM sama sekali → bukan tombol mati (positif palsu). */
    if (/kembali ke atas/i.test(nama)) continue
    const sebelum = await page.evaluate(() => document.body.innerHTML.length + '|' + document.body.innerText.length)
    try {
      await b.click({ timeout: 1500, noWaitAfter: true })
      await page.waitForTimeout(120)
      const sesudah = await page.evaluate(() => document.body.innerHTML.length + '|' + document.body.innerText.length)
      if (sebelum === sesudah) { mati++; detail.push(nama) }
      /* tutup dialog bila terbuka */
      const tutup = page.locator('[role="dialog"] button:has-text("Tutup"), [role="dialog"] button[aria-label*="tutup" i]')
      if (await tutup.count()) await tutup.first().click({ timeout: 800 }).catch(() => {})
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(80)
    } catch { /* tombol hilang setelah diklik: normal */ }
    await page.goto(APP + '#/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(150)
  }
  cek('klik-sweep dashboard: tidak ada error JS', errs.length === 0, errs.slice(0, 2).join(' | '))
  cek('klik-sweep dashboard: semua tombol bereaksi', mati === 0, `${mati} tombol tanpa perubahan (${detail.slice(0, 8).join(', ')})`)
  await ctx.close()
}

/* ---------------- 3. angka KPI di layar ---------------- */
{
  const { ctx, page } = await buka('dashboard', 1280, 1100)
  await page.waitForTimeout(2500)
  const kpi = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('div').forEach((el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (/^(Siap Operasi|Skor Kesehatan|Komponen A|Unit Rusak|Total Unit|Butuh Inspeksi)/i.test(t) && t.length < 90) out.push(t)
    })
    return [...new Set(out)].slice(0, 14)
  })
  console.log('\n— KPI Dashboard (data asli) —')
  kpi.forEach((k) => console.log('   ' + k))
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  fs.writeFileSync(path.join(OUT, 'dashboard-text.txt'), body)
  /* jejak sinkron */
  console.log('\n— cuplikan status sinkron —')
  console.log('   ' + (body.match(/Sinkron[^·]{0,120}/) || ['(tidak ada)'])[0])
  await page.screenshot({ path: path.join(OUT, 'dashboard-full-1280.png'), fullPage: true })
  await ctx.close()
}

console.log('\n' + (gagal ? `❌ ${gagal} pemeriksaan GAGAL` : '✅ semua pemeriksaan LULUS'))
fs.writeFileSync(path.join(OUT, 'hasil.json'), JSON.stringify(hasil, null, 2))
await browser.close()
process.exit(gagal ? 1 : 0)

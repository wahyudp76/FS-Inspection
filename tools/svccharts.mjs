import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

for (const vp of [{ w: 390, h: 844, n: 'HP' }, { w: 1440, h: 950, n: 'Desktop' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700, hasTouch: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  await p.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2600)

  const info = await p.evaluate(() => {
    const t = document.body.innerText
    return {
      grafik: document.querySelectorAll('.recharts-surface').length,
      tren: /Tren Service Engine/.test(t),
      divisi: /Cakupan per Divisi/.test(t),
      urgensi: /Sebaran Urgensi/.test(t),
      top10: /10 Paling Terlambat/.test(t),
      ketepatan: /Ringkasan Ketepatan Interval/.test(t),
      peta: /Peta Minggu Service/.test(t),
      kpiTepat: /TEPAT WAKTU/i.test(t),
      scroll: Math.round(document.documentElement.scrollHeight - innerHeight),
    }
  })
  cek(`[${vp.n}] 6 grafik/panel baru tampil`, info.tren && info.divisi && info.urgensi && info.top10 && info.ketepatan && info.peta, JSON.stringify(info))
  cek(`[${vp.n}] minimal 5 kanvas grafik recharts`, info.grafik >= 5, `${info.grafik} surface`)

  // klik tile divisi → tabel tersaring
  const tile = p.locator('button[title*="Saring tabel ke divisi"]').first()
  const namaDivisi = (await tile.innerText()).split('\n')[0].trim()
  await tile.click()
  await p.waitForTimeout(700)
  const filter = await p.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/Evaluasi Service Engine\s*\n([\d.]+) dari ([\d.]+) engine/)
    return { terbaca: m ? `${m[1]}/${m[2]}` : null, chip: (t.match(/Posisi\s*\n?([A-Z0-9]{2,4})/) || [])[1] || null }
  })
  cek(`[${vp.n}] klik divisi ${namaDivisi} menyaring tabel`, !!filter.terbaca && Number(filter.terbaca.split('/')[0]) < 131, JSON.stringify(filter))

  // klik batang "10 paling terlambat" → detail terbuka
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(300)
  /* tombol daftar (tap target) → detail */
  const tombolKode = p.locator('button[title^="Buka detail"]').first()
  const adaTombol = await tombolKode.count()
  if (adaTombol) { await tombolKode.click(); await p.waitForTimeout(800) }
  const dlgTombol = await p.locator('[role="dialog"]').count()
  cek(`[${vp.n}] tombol kode engine membuka detail`, dlgTombol > 0, `dialog=${dlgTombol}`)
  if (dlgTombol) { await p.keyboard.press('Escape'); await p.waitForTimeout(400) }

  await p.evaluate(async () => {
    const kartu = [...document.querySelectorAll('div')]
      .filter((d) => /10 Paling Terlambat/.test(d.innerText || '') && d.querySelector('.recharts-bar-rectangle'))
      .sort((a, b) => a.innerText.length - b.innerText.length)[0]
    if (!kartu) return
    kartu.scrollIntoView({ block: 'center' })
    await new Promise((r) => setTimeout(r, 350))
    const rect = kartu.querySelector('.recharts-bar-rectangle')
    const bb = rect.getBoundingClientRect()
    rect.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: bb.x + bb.width / 2, clientY: bb.y + bb.height / 2 }))
    await new Promise((r) => setTimeout(r, 400))
  })
  const dlg = await p.locator('[role="dialog"]').count()
  cek(`[${vp.n}] klik batang top-terlambat membuka detail`, dlg > 0, `dialog=${dlg}`)
  if (dlg) { await p.keyboard.press('Escape'); await p.waitForTimeout(400) }

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await p.screenshot({ path: `/home/user/tools/svc-charts-${vp.n}.png`, fullPage: false })
  await ctx.close()
}
console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

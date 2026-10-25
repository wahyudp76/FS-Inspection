import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'

const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })

/* ringkasan nyata untuk pembanding: hitung dari halaman (KPI) & dari dialog */
const kasus = [
  { id: 'terlambat', kpi: 'Lewat Jadwal', judul: 'Lewat jadwal', tombol: 'Saring tabel' },
  { id: 'segera', kpi: 'Jatuh Tempo', judul: 'Jatuh tempo', tombol: 'Saring tabel' },
  { id: 'belum', kpi: 'Belum Service', judul: 'Belum pernah service', tombol: 'Saring tabel' },
]

for (const vp of [{ w: 390, h: 844, n: 'HP' }, { w: 1440, h: 950, n: 'Desktop' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700, hasTouch: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  await p.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3000)

  for (const k of kasus) {
    /* angka di kartu KPI = ekspektasi jumlah unit di pop-up */
    const kpi = await p.evaluate((label) => {
      const t = document.body.innerText
      const re = new RegExp(label + '\\s*\\n\\s*([\\d.]+)', 'i')
      const m = t.match(re)
      return m ? Number(m[1].replace(/\./g, '')) : null
    }, k.kpi)
    cek(`[${vp.n}] kartu KPI ${k.kpi} terbaca`, typeof kpi === 'number' && kpi >= 0, String(kpi))

    await p.locator(`button[aria-label^="${k.kpi}:"]`).first().click()
    await p.waitForTimeout(600)

    const isi = await p.evaluate((judul) => {
      const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => (d.getAttribute('aria-label') || '').includes('Ringkasan'))
      if (!dlg) return { ada: false }
      const t = dlg.innerText
      const m = t.match(/·\s*([\d.]+) unit/)
      const chipSemua = [...dlg.querySelectorAll('button')].find((x) => /^Semua\s/.test(x.innerText.trim()))
      /* chip divisi membawa data-div / data-jumlah (tidak perlu mengurai teks) */
      const chipDivisi = [...dlg.querySelectorAll('button[data-div]')].map((x) => ({
        posisi: x.getAttribute('data-div'),
        jumlah: Number(x.getAttribute('data-jumlah')),
      }))
      const baris = [...dlg.querySelectorAll('button')]
        .map((x) => (x.innerText.match(/^(SP[CE]|DEM|DED|DPM|DGR)\w*/) || [])[0])
        .filter(Boolean)
      const pager = (t.match(/([\d.]+)–([\d.]+) dari ([\d.]+) unit/) || []).slice(1).map((x) => Number(x.replace(/\./g, '')))
      const list = dlg.querySelector('[data-daftar-total]')
      return {
        ada: true,
        judulBenar: t.includes(judul),
        jumlah: m ? Number(m[1].replace(/\./g, '')) : null,
        semua: chipSemua ? Number((chipSemua.innerText.match(/([\d.]+)/) || [])[1].replace(/\./g, '')) : null,
        divisi: chipDivisi,
        baris,
        pager,
        daftarTotal: list ? Number(list.getAttribute('data-daftar-total')) : null,
        daftarPosisi: list ? list.getAttribute('data-daftar-posisi') : null,
        adaInsight: /paling (lama|banyak|cepat)|belum punya baris/.test(t),
        adaTombolSaring: /Saring tabel/.test(t),
        adaInfoDivisi: /dari divisi mana saja/i.test(t),
      }
    }, k.judul)

    cek(`[${vp.n}] ${k.kpi}: pop-up terbuka`, isi.ada && isi.judulBenar, JSON.stringify({ ada: isi.ada, judul: isi.judulBenar }))
    cek(
      `[${vp.n}] ${k.kpi}: jumlah unit = kartu KPI (${kpi})`,
      isi.jumlah === kpi && isi.semua === kpi,
      JSON.stringify({ dialog: isi.jumlah, chipSemua: isi.semua, kpi })
    )
    const totalDivisi = (isi.divisi || []).reduce((a, d) => a + d.jumlah, 0)
    cek(
      `[${vp.n}] ${k.kpi}: sebaran divisi tampil & totalnya cocok`,
      (isi.divisi || []).length > 0 && totalDivisi === kpi && isi.adaInfoDivisi,
      JSON.stringify(isi.divisi)
    )
    cek(`[${vp.n}] ${k.kpi}: daftar unit + ringkasan cepat tampil`, isi.baris.length > 0 && isi.adaInsight, `${isi.baris.length} baris`)

    /* klik chip divisi pertama → daftar menyempit ke divisi itu */
    if ((isi.divisi || []).length > 1) {
      const d0 = isi.divisi[0]
      await p.locator(`[role="dialog"] button:has-text("${d0.posisi}")`).first().click()
      await p.waitForTimeout(400)
      const setelah = await p.evaluate(() => {
        const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => (d.getAttribute('aria-label') || '').includes('Ringkasan'))
        const l = dlg.querySelector('[data-daftar-total]')
        const t = dlg.innerText
        const m = t.match(/Daftar unit[^\n]*/i)
        return {
          label: m ? m[0] : null,
          total: l ? Number(l.getAttribute('data-daftar-total')) : null,
          posisi: l ? l.getAttribute('data-daftar-posisi') : null,
        }
      })
      cek(
        `[${vp.n}] ${k.kpi}: klik divisi ${d0.posisi} menyaring daftar pop-up`,
        setelah.posisi === d0.posisi && setelah.total === d0.jumlah && /daftar unit\s*·/i.test(setelah.label || ''),
        JSON.stringify({ d0, setelah })
      )
      await p.locator('[role="dialog"] button:has-text("Semua")').first().click()
      await p.waitForTimeout(300)
    }

    /* klik satu unit → detail engine */
    const kode = isi.baris[0]
    await p.locator(`[role="dialog"] button:has-text("${kode}")`).first().click()
    await p.waitForTimeout(700)
    const detail = await p.evaluate((kode) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.getAttribute('aria-label') || '').includes('Detail service'))
      const ringkas = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.getAttribute('aria-label') || '').includes('Ringkasan'))
      return { ada: !!d, kodeCocok: !!d && d.innerText.includes(kode), ringkasTutup: !ringkas }
    }, kode)
    cek(`[${vp.n}] ${k.kpi}: klik unit ${kode} membuka detail engine`, detail.ada && detail.kodeCocok && detail.ringkasTutup, JSON.stringify(detail))
    await p.keyboard.press('Escape')
    await p.waitForTimeout(500)

    /* tombol “Saring tabel” → tabel tersaring */
    await p.locator(`button[aria-label^="${k.kpi}:"]`).first().click()
    await p.waitForTimeout(500)
    await p.locator('[role="dialog"] button:has-text("Saring tabel")').first().click()
    await p.waitForTimeout(800)
    const saring = await p.evaluate(() => {
      const t = document.body.innerText
      const m = t.match(/Evaluasi Service Engine\s*\n([\d.]+) dari ([\d.]+) engine/)
      const ringkas = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.getAttribute('aria-label') || '').includes('Ringkasan'))
      return { baris: m ? Number(m[1].replace(/\./g, '')) : null, popupTutup: !ringkas }
    })
    cek(
      `[${vp.n}] ${k.kpi}: tombol “Saring tabel” menyaring ke ${kpi} unit`,
      saring.baris === kpi && saring.popupTutup,
      JSON.stringify(saring)
    )
    /* bersihkan filter status untuk kasus berikutnya */
    await p.evaluate(() => {
      const t = [...document.querySelectorAll('button')].find((x) => /^Filter:\s*Service|^Filter:\s*Belum/i.test(x.innerText.trim()))
      if (t) t.click()
    })
    await p.evaluate(() => {
      /* reset lewat chip 'Semua status' pada MultiSelect bila ada */
      const ms = [...document.querySelectorAll('button')].find((x) => /Semua status/.test(x.innerText) && !/Lewat|Jatuh/i.test(x.innerText))
      if (ms) ms.click()
    })
    await p.waitForTimeout(600)
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
  }

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await p.screenshot({ path: `/home/user/tools/svc-kpi-${vp.n}.png` })
  await ctx.close()
}

console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

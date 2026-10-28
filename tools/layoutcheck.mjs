/** layoutcheck.mjs — ukur ruang kosong & tumpang-tindih grafik vs kartunya. */
import { chromium } from 'playwright-core'
const APP = 'http://127.0.0.1:5199/'
const RUTE = ['dashboard', 'riwayat', 'service']
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } })
await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
for (const r of RUTE) {
  await page.goto(APP + '#/' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)
  const info = await page.evaluate(() => {
    const out = []
    for (const wrap of document.querySelectorAll('.recharts-responsive-container')) {
      const kartu = wrap.closest('.card') || wrap.parentElement
      const wr = wrap.getBoundingClientRect()
      const kr = kartu.getBoundingClientRect()
      // bbox isi svg (grafik sebenarnya)
      const svg = wrap.querySelector('svg')
      let isi = null
      if (svg) {
        const bb = svg.getBBox()
        const sc = svg.getBoundingClientRect().width / (svg.viewBox?.baseVal?.width || bb.width || 1)
        isi = { h: Math.round(bb.height), y: Math.round(bb.y), w: Math.round(bb.width) }
      }
      out.push({
        nama: (kartu.innerText || '').split('\n')[0].slice(0, 28),
        wrapH: Math.round(wr.height), wrapW: Math.round(wr.width),
        kartuH: Math.round(kr.height),
        sisaBawah: Math.round(kr.bottom - wr.bottom),
        sisaAtas: Math.round(wr.top - kr.top),
        isi,
      })
    }
    return out
  })
  console.log('\n=== ' + r + ' ===')
  for (const x of info) {
    const isiH = x.isi ? x.isi.h : 0
    console.log(
      `${String(x.nama).padEnd(30)} kontainer ${x.wrapW}x${x.wrapH} kartu ${x.kartuH} | isi svg h=${isiH} | sisa atas ${x.sisaAtas} bawah ${x.sisaBawah} | ruang kosong dalam grafik ${Math.max(0, x.wrapH - isiH)}`
    )
  }
}
await b.close()

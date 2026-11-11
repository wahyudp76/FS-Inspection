/* Memeriksa kesimetrisan kartu: tiap baris grid harus punya tinggi kartu sama.
   Pakai: node tools/rowcheck.mjs (butuh Vite di :5199). */
import { chromium } from 'playwright-core'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
for (const r of ['dashboard', 'riwayat', 'service']) {
  await p.goto(`http://127.0.0.1:5199/#/${r}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3000)
  const data = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('div.card')]
      .filter((e) => e.getBoundingClientRect().width > 200)
    const rows = {}
    cards.forEach((e) => {
      const r = e.getBoundingClientRect()
      const key = Math.round(r.top / 10) * 10
      rows[key] = rows[key] || []
      rows[key].push(`${Math.round(r.width)}x${Math.round(r.height)}`)
    })
    return rows
  })
  console.log('==', r)
  for (const [k, v] of Object.entries(data)) console.log(' baris', k, v.join(' | '))
}
await b.close()

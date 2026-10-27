import { chromium } from 'playwright-core'
const APP = 'http://127.0.0.1:5199/'
const b = await chromium.launch()
let gagal = 0
const cek = (n, ok, x = '') => { if (!ok) gagal++; console.log(`${ok ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

const barisUnit = (page, kode) => page.evaluate((k) =>
  [...document.querySelectorAll('tr, article, .card')]
    .map((e) => (e.innerText || '').replace(/\s+/g, ' '))
    .filter((t) => t.includes(k) && /Rusak|Standby|Terpasang/.test(t))[0] || '', kode)
const chipMaster = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('button, span')].find((e) => /Master live|tekan Sinkron/.test(e.innerText || ''))
  return el ? el.innerText.replace(/\s+/g, ' ').trim() : '(tidak ada)'
})
const seed = (page, { versi, umurJam }) => page.evaluate(({ versi, umurJam }) => {
  const tua = new Date(Date.now() - umurJam * 3600 * 1000).toISOString()
  const data = { syncedAt: tua, live: { rev: 'basi', generatedAt: tua, kmap: { Mesin: ['Mesin', 'Accu'], Irrigator: [] },
    mesin: [['DEM0074', 'OP2', 'MITS. 6D19T', 'DEM', 'Standby', 'CA', '2026-03-05', '', '220', 'Sumur', '', '']], irrigator: [] } }
  if (versi) data.v = versi
  localStorage.setItem('fsi:master-live', JSON.stringify(data))
}, { versi, umurJam })

/* ---- A. cache master dari bundel lama (tanpa versi skema) → harus dibuang ---- */
for (const [nama, versi] of [['tanpa versi', null], ['versi lama', '1.8.0']]) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await seed(page, { versi, umurJam: 2 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  cek(`cache ${nama} diabaikan → master live ditarik ulang`, /Master live/.test(await chipMaster(page)), await chipMaster(page))
  await page.goto(APP + '#/unit', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.locator('input[type=text], input:not([type])').first().fill('DEM0074')
  await page.waitForTimeout(1000)
  const baris = await barisUnit(page, 'DEM0074')
  cek(`Data Unit: DEM0074 = Rusak (cache ${nama} tidak dipakai)`, /Rusak/.test(baris), baris.slice(-80))
  await ctx.close()
}

/* ---- B. cache valid tapi 2 jam + sheet tidak terbaca → peringatan jelas ---- */
{
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.route('**/exec', (r) => r.abort())
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await seed(page, { versi: '1.9.1', umurJam: 2 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const chip = await chipMaster(page)
  cek('data lama + sheet mati → chip “Master 2 jam lalu — tekan Sinkron”', /2 jam lalu — tekan Sinkron/.test(chip), chip)
  await ctx.close()
}

/* ---- C. cache baru (5 menit) → chip menyatakan live ---- */
{
  const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'domcontentloaded' })
  await seed(page, { versi: '1.9.1', umurJam: 0.08 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  cek('setelah sinkron: chip “Master live”', /Master live/.test(await chipMaster(page)), await chipMaster(page))
  await ctx.close()
}
console.log(gagal ? `\n❌ ${gagal} gagal` : '\n✅ semua cek cache lulus')
await b.close()
process.exit(gagal ? 1 : 0)

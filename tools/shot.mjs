import { chromium } from 'playwright-core'
const APP = process.env.APP || 'http://127.0.0.1:5199/'
const routes = (process.env.ROUTES || 'dashboard,inspeksi,unit,riwayat,service,pengaturan').split(',')
const w = Number(process.env.W || 1440), h = Number(process.env.H || 1000)
const tag = process.env.TAG || 'light'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', e => errs.push(e.message))
await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
for (const r of routes) {
  await page.goto(APP + '#/' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `/home/user/FS-Inspection/audit-shots/${tag}-${r}-${w}.png`, fullPage: false })
}
console.log('error JS:', errs.length ? errs.slice(0,3) : 'tidak ada')
await b.close()

import { chromium } from 'playwright-core'
const APP = 'http://127.0.0.1:5199/'
const routes = (process.env.ROUTES || 'dashboard,riwayat,service').split(',')
const w = Number(process.env.W || 1440), h = Number(process.env.H || 1000)
const tag = process.env.TAG || 'layout'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: w, height: h } })
const errs = []
page.on('pageerror', e => errs.push(e.message))
await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4500)
for (const r of routes) {
  await page.goto(APP + '#/' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `/home/user/FS-Inspection/audit-shots/${tag}-${r}-${w}.png`, fullPage: true })
}
console.log('error JS:', errs.length ? errs.slice(0,3) : 'tidak ada')
await b.close()

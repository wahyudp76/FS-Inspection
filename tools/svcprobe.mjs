import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require((process.env.PW_DIR || '/home/user/tools/node_modules') + '/playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const EP = 'http://127.0.0.1:8112/exec'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
for (const vp of [{ width: 390, height: 844, name: 'm' }, { width: 1440, height: 900, name: 'd' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 700, hasTouch: vp.width < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)) })
  await p.goto(`${process.env.BASE || 'http://127.0.0.1:8099'}/#/service`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2500)
  const info = await p.evaluate(() => {
    const t = document.body.innerText
    const num = (re) => { const m = t.match(re); return m ? m[1] : null }
    return {
      head: t.split('\n').slice(0, 4).join(' | '),
      total: num(/Total Engine\s*\n?([\d.]+)/),
      lewat: num(/Lewat Jadwal\s*\n?([\d.]+)/),
      tempo: num(/Jatuh Tempo\s*\n?([\d.]+)/),
      belum: num(/Belum Service\s*\n?([\d.]+)/),
      cakupan: num(/Cakupan Service\s*\n?([\d.]+%)/),
      rows: document.querySelectorAll('table tbody tr').length,
      scrollable: document.documentElement.scrollHeight > innerHeight,
    }
  })
  console.log(vp.name, JSON.stringify(info))
  console.log('  scroll:', await p.evaluate(async () => { window.scrollTo(0, 999999); await new Promise(r => setTimeout(r, 300)); return Math.round(scrollY) + '/' + Math.round(document.documentElement.scrollHeight - innerHeight) + ' ov=' + getComputedStyle(document.body).overflow }))
  await p.screenshot({ path: `/home/user/tools/svc-${vp.name}.png`, fullPage: false })
  console.log('  errors:', errs.slice(0, 4))
  await ctx.close()
}
await b.close()

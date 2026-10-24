import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const seed = fs.readFileSync(process.env.SEED || path.join(HERE, 'seed-cache.json'), 'utf8')
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
let fail = 0
const ck = (n, ok, x = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
await ctx.addInitScript(({ cache, ep }) => {
  try { localStorage.setItem('fsi:history-cache', cache); localStorage.setItem('fsi:endpoint', ep) } catch (e) {}
}, { cache: seed, ep: EP })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
const lock = () => p.evaluate(() => getComputedStyle(document.body).overflow)
const maxScroll = async () => {
  await p.evaluate(() => window.scrollTo(0, 999999))
  await p.waitForTimeout(250)
  return p.evaluate(() => ({ y: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight }))
}

for (const r of ['dashboard', 'riwayat', 'unit', 'inspeksi', 'pengaturan']) {
  await p.goto((process.env.BASE || 'http://127.0.0.1:8099') + `/#/${r}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1400)
  const s = await maxScroll()
  ck(`${r}: body tidak terkunci & bisa digeser penuh`, (await lock()) !== 'hidden' && s.y >= s.max - 2, `${s.y}/${s.max} · overflow ${await lock()}`)
}

/* tab Riwayat: buka-tutup pop-up ubah */
await p.goto((process.env.BASE || 'http://127.0.0.1:8099') + '/#/riwayat', { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.evaluate(() => document.querySelector('main [aria-label^="Ubah inspeksi"]')?.click())
await p.waitForTimeout(600)
ck('saat pop-up ubah terbuka: scroll dikunci', (await lock()) === 'hidden')
await p.keyboard.press('Escape')
await p.waitForTimeout(600)
const s2 = await maxScroll()
ck('setelah pop-up ditutup: scroll normal lagi', (await lock()) !== 'hidden' && s2.y >= s2.max - 2, `${s2.y}/${s2.max} · overflow ${await lock()}`)

/* buka pop-up lalu pindah tab tanpa menutup */
await p.evaluate(() => document.querySelector('main [aria-label^="Ubah inspeksi"]')?.click())
await p.waitForTimeout(500)
await p.evaluate(() => { location.hash = '#/dashboard' })
await p.waitForTimeout(900)
const s3 = await maxScroll()
ck('pindah tab saat pop-up terbuka: scroll dilepas', (await lock()) !== 'hidden' && s3.y >= s3.max - 2, `${s3.y}/${s3.max}`)

/* dashboard: pop-up distribusi + detail unit bertumpuk */
await p.evaluate(() => {
  const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
  c.scrollIntoView({ block: 'center' })
})
await p.getByRole('button', { name: /Analisa 90-100 Mesin/ }).click()
await p.waitForTimeout(600)
await p.evaluate(() => document.querySelectorAll('[role=dialog] button[aria-label^="Detail unit"]')[0].click())
await p.waitForTimeout(700)
ck('dua lapisan terbuka: tetap terkunci', (await lock()) === 'hidden')
await p.keyboard.press('Escape')
await p.waitForTimeout(400)
await p.keyboard.press('Escape')
await p.waitForTimeout(600)
ck('kedua lapisan ditutup: scroll pulih', (await lock()) !== 'hidden', await lock())

ck('tidak ada error JS', errs.length === 0, errs.slice(0, 2).join(' | '))
await b.close()
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')

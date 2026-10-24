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

for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })
  await ctx.addInitScript((d) => { try { localStorage.setItem('fsi:history-cache', d) } catch (e) {} }, seed)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://127.0.0.1:8099/#/dashboard', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
    c.scrollIntoView({ block: 'center' })
  })
  await p.waitForTimeout(400)
  /* desktop: klik batang chart · HP: tombol per rentang */
  if (w >= 640) {
    await p.evaluate(() => {
      const card = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
      const g = card.querySelectorAll('.recharts-bar')[0]
      const t = [...g.querySelectorAll('.recharts-bar-rectangle')].find((x) => x.querySelector('path,rect'))
      ;(t.querySelector('path,rect') || t).dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }))
    })
  } else {
    await p.getByRole('button', { name: /Analisa 90-100 Mesin/ }).click()
  }
  await p.waitForTimeout(700)

  const state = async () => p.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    const cards = [...d.querySelectorAll('div.rounded-xl')].filter((x) => /Inspeksi/.test(x.innerText))
    return {
      rows: cards.length,
      kodes: cards.map((c) => c.innerText.split('\n')[0].trim()),
      pager: (d.innerText.match(/(\d+) \/ (\d+)/) || []).slice(1),
      header: d.innerText.match(/menampilkan[^\n]*/i)?.[0],
    }
  })

  const a = await state()
  ck(`${label}: default 10 item per halaman`, a.rows === 10, `${a.rows} baris`)
  ck(`${label}: pager tampil 1 / N`, a.pager[0] === '1' && Number(a.pager[1]) >= 2, a.pager.join(' / '))
  ck(`${label}: info rentang unit`, /menampilkan 1.?10/i.test(a.header || ''), a.header)

  await p.locator('[role=dialog] [aria-label="Halaman berikutnya"]').click()
  await p.waitForTimeout(600)
  const bpage = await state()
  ck(`${label}: halaman 2 memuat item berbeda`, bpage.rows === 10 && bpage.kodes[0] !== a.kodes[0], `${bpage.kodes[0]} (sebelumnya ${a.kodes[0]})`)
  ck(`${label}: nomor halaman naik`, bpage.pager[0] === '2', bpage.pager.join(' / '))

  await p.locator('[role=dialog] [aria-label="Halaman sebelumnya"]').click()
  await p.waitForTimeout(500)
  const back = await state()
  ck(`${label}: kembali ke halaman 1`, back.pager[0] === '1' && back.kodes[0] === a.kodes[0])

  await p.locator('[role=dialog] button', { hasText: /^25$/ }).first().click()
  await p.waitForTimeout(600)
  const big = await state()
  ck(`${label}: ukuran 25 per halaman`, big.rows === 25, `${big.rows} baris`)

  const dim = await p.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    const r = d.getBoundingClientRect()
    return { h: Math.round(r.height), max: Math.round(innerHeight * 0.92) + 2 }
  })
  ck(`${label}: pop-up tidak melebihi 92% layar`, dim.h <= dim.max, `${dim.h}px ≤ ${dim.max}px`)
  ck(`${label}: tidak ada error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await ctx.close()
}
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')
await b.close()

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
  await p.waitForTimeout(1300)
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
    c.scrollIntoView({ block: 'center' })
  })
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
  await p.waitForTimeout(800)

  const kode = await p.evaluate(() => {
    const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /DAFTAR UNIT/i.test(x.innerText))
    const btn = d.querySelector('button[aria-label^="Detail unit"]')
    btn.click()
    return btn.textContent.trim()
  })
  await p.waitForTimeout(900)

  const after = await p.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog]')]
    const detail = dialogs.find((d) => /^Detail unit /.test(d.getAttribute('aria-label') || ''))
    return {
      hash: location.hash,
      nDialogs: dialogs.length,
      detailKode: (detail?.getAttribute('aria-label') || '').replace('Detail unit ', '').trim(),
      detailText: detail?.innerText.slice(0, 200),
      hasKomponen: detail ? /komponen/i.test(detail.innerText) : false,
      bucketStillOpen: dialogs.some((d) => /DAFTAR UNIT/i.test(d.innerText)),
    }
  })
  ck(`${label}: tetap di tab dashboard (tidak pindah ke Data Unit)`, after.hash.includes('dashboard'), after.hash)
  ck(`${label}: detail unit terbuka langsung`, !!after.detailKode, after.detailKode)
  ck(`${label}: kode yang tampil = yang diklik`, after.detailKode === kode, `klik ${kode} → tampil ${after.detailKode}`)
  ck(`${label}: detail berisi checklist komponen`, after.hasKomponen)
  ck(`${label}: daftar pop-up masih di belakang`, after.bucketStillOpen)

  /* Esc menutup detail saja, pop-up daftar tetap */
  await p.keyboard.press('Escape')
  await p.waitForTimeout(600)
  const back = await p.evaluate(() => {
    const dialogs = [...document.querySelectorAll('[role=dialog]')]
    return { n: dialogs.length, bucket: dialogs.some((d) => /DAFTAR UNIT/i.test(d.innerText)) }
  })
  ck(`${label}: Esc menutup detail, daftar tetap terbuka`, back.bucket && back.n === 1, `${back.n} dialog`)

  /* tombol Inspeksi di detail → pindah ke tab Inspeksi dengan unit yang benar */
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /DAFTAR UNIT/i.test(x.innerText))
    d.querySelector('button[aria-label^="Detail unit"]').click()
  })
  await p.waitForTimeout(700)
  await p.locator('[role=dialog] button', { hasText: /Mulai Inspeksi|Inspeksi/ }).last().click()
  await p.waitForTimeout(900)
  const nav = await p.evaluate(() => location.hash)
  ck(`${label}: tombol Inspeksi dari detail → tab inspeksi unit tsb`, /#\/inspeksi\?tipe=.*kode=/.test(nav), nav)
  ck(`${label}: tidak ada error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await ctx.close()
}
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')
await b.close()

import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
/* pakai playwright-core lokal (npm i -D playwright-core) atau dari PW_DIR */
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
import fs from 'node:fs'
import path from 'node:path'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const HERE = path.dirname(new URL(import.meta.url).pathname)
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

  /* scroll ke kartu distribusi skor */
  await p.evaluate(() => {
    const c = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
    c?.scrollIntoView({ block: 'center' })
  })
  await p.waitForTimeout(500)
  const bars = await p.locator('main .recharts-bar-rectangle').count()
  ck(`${label}: histogram punya batang`, bars > 0, `${bars} batang`)
  const legends = await p.evaluate(() => [...document.querySelectorAll('main .recharts-legend-item')].map((e) => e.textContent.trim()))
  ck(`${label}: legenda Mesin & Irrigator`, legends.some((x) => /Mesin/.test(x)) && legends.some((x) => /Irrigator/.test(x)), JSON.stringify(legends))

  /* klik batang pertama */
  const clickBar = async (typeIdx, bucketIdx) => {
    const ok = await p.evaluate(([ti, bi]) => {
      const card = [...document.querySelectorAll('main .card')].find((x) => /Distribusi Skor/.test(x.innerText))
      if (!card) return 'kartu tidak ada'
      card.scrollIntoView({ block: 'center' })
      const bars = [...card.querySelectorAll('.recharts-bar-rectangle')].filter((g) => g.querySelector('path,rect'))
      const groups = [...card.querySelectorAll('.recharts-bar')]
      if (!groups[ti]) return 'grup batang tidak ada'
      const rects = [...groups[ti].querySelectorAll('.recharts-bar-rectangle')].filter((g) => g.querySelector('path,rect'))
      const target = rects[bi] || rects[0]
      if (!target) return 'batang tidak ada'
      const node = target.querySelector('path,rect') || target
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return null
    }, [typeIdx, bucketIdx])
    if (ok) console.log('   (klik gagal:', ok + ')')
    await p.waitForTimeout(700)
    return !ok
  }
  await clickBar(0, 0)
  await p.waitForTimeout(700)
  const modal = await p.evaluate(() => {
    const d = document.querySelector('[role=dialog]')
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { title: d.querySelector('h2')?.textContent.trim(), sub: d.querySelector('h2 + p, p')?.textContent.trim().slice(0, 80), h: Math.round(r.height), w: Math.round(r.width), scrollable: d.scrollHeight > d.clientHeight, text: d.innerText }
  })
  ck(`${label}: pop-up terbuka saat batang diklik`, !!modal, modal ? `${modal.w}×${modal.h} · "${modal.title}" · teks ${modal.text?.length} char` : '')
  if (modal) {
    ck(`${label}: judul menyebut tipe`, /Mesin|Irrigator/.test(modal.title || ''), modal.title)
    ck(`${label}: ada angka ringkasan`, /jumlah unit|rata-rata/i.test(modal.text))
    ck(`${label}: ada analisa`, /analisa kategori/i.test(modal.text))
    ck(`${label}: daftar unit atau keterangan kosong`, /daftar unit|tidak ada unit/i.test(modal.text))
    ck(`${label}: pop-up tidak melebihi layar`, modal.h <= h && modal.w <= w + 1, `${modal.w}×${modal.h} di ${w}×${h}`)
  }

  /* tutup via Esc */
  await p.keyboard.press('Escape')
  await p.waitForTimeout(400)
  ck(`${label}: Esc menutup pop-up`, !(await p.evaluate(() => !!document.querySelector('[role=dialog]'))))

  /* klik batang Irrigator (index 5-9 biasanya), ambil yang legenda kedua */
  const cls = await p.evaluate(() => {
    const groups = [...document.querySelectorAll('main .recharts-bar')]
    return groups.map((g, i) => i)
  })
  if (cls.length >= 2) {
    await clickBar(1, 0)
    const t2 = await p.evaluate(() => document.querySelector('[role=dialog] h2')?.textContent.trim() || '')
    ck(`${label}: batang kedua membuka tipe lain`, /Irrigator/.test(t2), t2)
    await p.keyboard.press('Escape')
  }
  ck(`${label}: tidak ada error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await ctx.close()
}
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')
await b.close()

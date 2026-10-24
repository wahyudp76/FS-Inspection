import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
let fail = 0
const ck = (n, ok, x = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((ep) => {
  try {
    localStorage.setItem('fsi:endpoint', ep)
    localStorage.setItem('fsi:autosyncmaster', '1')
  } catch (e) {}
}, EP)
const p = await ctx.newPage()
const actions = []
p.on('request', (r) => {
  if (!r.url().includes('8111')) return
  try { actions.push(JSON.parse(r.postData() || '{}').action) } catch {}
})
const errs = []
p.on('pageerror', (e) => errs.push(e.message))

await p.goto((process.env.BASE || 'http://127.0.0.1:8099') + '/#/riwayat', { waitUntil: 'networkidle' })
await p.waitForTimeout(2500)

/* ---- EDIT harus memicu update + syncmaster + history ---- */
actions.length = 0
await p.evaluate(() => document.querySelector('main [aria-label^="Ubah inspeksi"]')?.click())
await p.waitForTimeout(700)
await p.fill('[role=dialog] input[placeholder="Nama petugas"]', 'Sync Test')
await p.click('[role=dialog] button:has-text("Simpan perubahan")')
await p.waitForTimeout(3500)
ck('edit → aksi update dikirim', actions.includes('update'), actions.join(' → '))
ck('edit → langsung sync ke master', actions.includes('syncmaster'), actions.join(' → '))
ck('edit → riwayat ditarik ulang', actions.filter((a) => a === 'history').length >= 1, actions.join(' → '))
const toastE = await p.evaluate(() => document.querySelector('[role=status]')?.innerText.replace(/\n/g, ' ').slice(0, 130) || '')
ck('toast menyebut sinkron', /sinkron/i.test(toastE), toastE)

/* ---- HAPUS harus memicu delete + syncmaster + history ---- */
actions.length = 0
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('main [aria-label^="Hapus inspeksi"]')]
    .find((x) => /Sync Test/.test(x.closest('div.rounded-xl')?.innerText || '')) || document.querySelector('main [aria-label^="Hapus inspeksi"]')
  btn.click()
})
await p.waitForTimeout(600)
await p.locator('[role=dialog] button', { hasText: /^Hapus$/ }).last().click()
await p.waitForTimeout(3500)
ck('hapus → aksi delete dikirim', actions.includes('delete'), actions.join(' → '))
ck('hapus → langsung sync ke master', actions.includes('syncmaster'), actions.join(' → '))
ck('hapus → riwayat ditarik ulang', actions.filter((a) => a === 'history').length >= 1, actions.join(' → '))

const sisa = await p.evaluate(() => document.querySelectorAll('main [aria-label^="Ubah inspeksi"]').length)
ck('daftar masih tampil setelah edit & hapus', sisa > 0, `${sisa} kartu di halaman ini`)
ck('tidak ada error JS', errs.length === 0, errs.slice(0, 2).join(' | '))
await b.close()
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')

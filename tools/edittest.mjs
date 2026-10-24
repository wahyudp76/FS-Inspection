import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PW_DIR ? process.env.PW_DIR + '/playwright-core' : 'playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const ping = async () => (await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'ping' }) })).json())
const hist = async () => (await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'history', payload: { plain: true } }) })).json())

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
let fail = 0
const ck = (n, ok, x = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

for (const [w, h, label] of [[1280, 900, 'desktop'], [390, 844, 'mobile']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto((process.env.BASE || 'http://127.0.0.1:8099') + '/#/riwayat', { waitUntil: 'networkidle' })
  await p.waitForFunction(() => /275|27\d/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 20000 })
  await p.waitForTimeout(600)

  const rows = await p.evaluate(() => document.querySelectorAll('main [aria-label^="Ubah inspeksi"]').length)
  ck(`${label}: tombol Ubah tersedia`, rows > 0, `${rows} tombol`)
  const dells = await p.evaluate(() => document.querySelectorAll('main [aria-label^="Hapus inspeksi"]').length)
  ck(`${label}: tombol Hapus tersedia`, dells > 0, `${dells} tombol`)

  /* ---- UBAH ---- */
  const kode = await p.evaluate(() => {
    const btn = document.querySelector('main [aria-label^="Ubah inspeksi"]')
    btn.scrollIntoView({ block: 'center' })
    btn.click()
    return btn.getAttribute('aria-label').replace('Ubah inspeksi ', '')
  })
  await p.waitForTimeout(700)
  const opened = await p.evaluate(() => !!document.querySelector('[role=dialog] input[placeholder="Nama petugas"]'))
  ck(`${label}: form ubah terbuka (${kode})`, opened)
  if (opened) {
    await p.fill('[role=dialog] input[placeholder="Nama petugas"]', 'Editor Uji')
    await p.fill('[role=dialog] textarea', 'catatan dari uji edit')
    /* ubah satu komponen jadi C: klik tombol grade C pertama */
    const gradeBtns = await p.locator('[role=dialog] button[aria-label$=" C"]').count()
    if (gradeBtns) await p.locator('[role=dialog] button[aria-label$=" C"]').first().click()
    await p.waitForTimeout(300)
    const skorTeks = await p.evaluate(() => document.querySelector('[role=dialog]').innerText.match(/skor ([0-9.]+)/)?.[1])
    await p.click('[role=dialog] button:has-text("Simpan perubahan")')
    await p.waitForTimeout(2500)
    const toast = await p.evaluate(() => document.querySelector('[role=status]')?.innerText?.replace(/\n/g, ' ').trim().slice(0, 80) || '')
    ck(`${label}: tersimpan (toast)`, /berhasil diperbarui/i.test(toast), toast)
    const serverRec = (await hist()).records.find((r) => r.kode === kode && r.inspector === 'Editor Uji')
    ck(`${label}: sheet benar-benar berubah`, !!serverRec, serverRec ? `petugas=${serverRec.inspector}, skor=${serverRec.skor}, catatan="${serverRec.catatan}"` : 'tidak ditemukan')
    const uiOk = await p.evaluate(() => /Editor Uji/.test(document.querySelector('main').innerText))
    ck(`${label}: daftar di layar ikut berubah`, uiOk)
  }

  /* ---- HAPUS ---- */
  const before = (await ping()).records
  const kode2 = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('main [aria-label^="Hapus inspeksi"]')].find((x) => /Editor Uji/.test(x.closest('tr, div.rounded-xl')?.innerText || ''))
      || document.querySelector('main [aria-label^="Hapus inspeksi"]')
    btn.scrollIntoView({ block: 'center' })
    btn.click()
    return btn.getAttribute('aria-label').replace('Hapus inspeksi ', '')
  })
  await p.waitForTimeout(600)
  const okDialog = await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].some((d) => /Hapus sesi inspeksi/.test(d.innerText)))
  ck(`${label}: dialog konfirmasi muncul (${kode2})`, okDialog)
  await p.locator('[role=dialog] button', { hasText: /^Hapus$/ }).last().click()
  await p.waitForTimeout(2500)
  const toastD = await p.evaluate(() => document.querySelector('[role=status]')?.innerText?.replace(/\n/g, ' ').trim().slice(0, 80) || '')
  const after = (await ping()).records
  ck(`${label}: baris sheet berkurang`, after === before - 1, `${before} → ${after}`)
  ck(`${label}: toast hapus`, /dihapus/i.test(toastD), toastD)
  const gone = !(await hist()).records.some((r) => r.kode === kode2 && r.inspector === 'Editor Uji')
  ck(`${label}: record hilang dari sheet`, gone)
  ck(`${label}: tidak ada error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await ctx.close()
}
console.log(fail ? `\n${fail} GAGAL` : '\nSEMUA LULUS')
await b.close()

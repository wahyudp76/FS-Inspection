import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require((process.env.PW_DIR || '/home/user/tools/node_modules') + '/playwright-core')
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await fetch(EP.replace('/exec', '/__reset'))
await p.goto(`${process.env.BASE || 'http://127.0.0.1:8099'}/#/service`, { waitUntil: 'networkidle' })
await p.waitForTimeout(2200)

const langkah = []
const cek = (nama, ok, info = '') => { langkah.push(`${ok ? 'LULUS' : 'GAGAL'} ${nama}${info ? ' — ' + info : ''}`) }

/* 1. buka pop-up dari tombol utama */
await p.locator('button:has-text("Catat Service")').first().click()
await p.waitForTimeout(700)
const dlg = await p.locator('[role="dialog"]').count()
cek('pop-up Catat Service terbuka', dlg > 0)
const lockKetikaBuka = await p.evaluate(() => getComputedStyle(document.body).overflow)
cek('scroll terkunci saat pop-up', lockKetikaBuka === 'hidden', lockKetikaBuka)

/* 2. pilih unit lewat daftar */
await p.fill('[role="dialog"] input[placeholder*="Cari kode"]', 'DED0017')
await p.waitForTimeout(400)
await p.click('[role="option"]:has-text("DED0017")')
await p.waitForTimeout(400)
const infoUnit = await p.evaluate(() => document.querySelector('[role="dialog"]').innerText.replace(/\n+/g, ' | ').slice(0, 400))
cek('unit terpilih + ringkasan tampil', /DED0017/.test(infoUnit))

/* 3. isi HM (HM terakhir + 120) */
const hmLama = await p.evaluate(() => {
  const t = document.querySelector('[role="dialog"]').innerText
  const m = t.match(/HM TERAKHIR[\s\S]{0,40}?([\d.]{2,})/i)
  return m ? Number(m[1].replace(/\./g, '')) : null
})
const hmBaru = (hmLama || 1546) + 120
await p.fill('[role="dialog"] input[type="number"]', String(hmBaru))
await p.waitForTimeout(400)
const siap = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('[role="dialog"] button')].find((b) => /Simpan ke Sheet/.test(b.innerText))
  const err = document.querySelector('[role="dialog"]')?.innerText.match(/harus lebih besar[^|]*/i)
  return { disabled: !!btn?.disabled, err: err ? err[0] : null, hm: document.querySelector('[role="dialog"] input[type="number"]')?.value }
})
cek('form siap disimpan', !siap.disabled && !siap.err, JSON.stringify(siap) + ` hmLama=${hmLama} hmBaru=${hmBaru}`)

/* 4. simpan */
await p.click('[role="dialog"] button:has-text("Simpan ke Sheet")')
await p.waitForTimeout(1200)
const txtSetelah = await p.evaluate(() => (document.querySelector('[role="dialog"]')?.innerText || document.body.innerText).replace(/\n+/g, ' | ').slice(0, 500))
cek('konfirmasi simpan muncul', /tercatat|Jadwal berikutnya/.test(txtSetelah), txtSetelah.slice(0, 160))

const state = await (await fetch(EP.replace('/exec', '/__state'))).json()
cek('aksi svcrecord terkirim ke "sheet"', state.hits.includes('svcrecord'), JSON.stringify(state.appends))
cek('baris baru tercatat di tb_service2 tiruan', state.appends.length === 1 && state.appends[0].kode === 'DED0017')

/* 5. pop-up menutup sendiri, halaman memuat ulang data */
await p.waitForTimeout(2600)
const dlg2 = await p.locator('[role="dialog"]').count()
cek('pop-up menutup otomatis', dlg2 === 0)
const lockSetelah = await p.evaluate(() => getComputedStyle(document.body).overflow)
cek('scroll pulih setelah pop-up', lockSetelah !== 'hidden', lockSetelah)

const setelah = await p.evaluate(() => {
  const t = document.body.innerText
  return { ded: (t.match(/DED0017/g) || []).length, total: (t.match(/131 engine/) || []).length }
})
cek('data ditarik ulang (svcread setelah catat)', state.hits.filter((h) => h === 'svcread').length >= 2, `svcread x${state.hits.filter((h) => h === 'svcread').length}`)
cek('unit muncul di halaman', setelah.ded > 0)

/* 6. buka detail dari daftar riwayat */
await p.evaluate(() => window.scrollTo(0, 999999))
await p.waitForTimeout(400)
const riwayatBtn = p.locator('button:has-text("DED0017")').last()
await riwayatBtn.click()
await p.waitForTimeout(900)
const detail = await p.evaluate(() => (document.querySelector('[role="dialog"]')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 400))
cek('detail unit terbuka dari riwayat', /riwayat service/i.test(detail), detail.slice(0, 120))
cek('detail memuat pencatatan baru', new RegExp(String(hmBaru)).test(detail.replace(/\./g, '')) || /HM/.test(detail))
await p.keyboard.press('Escape')
await p.waitForTimeout(500)
cek('Esc menutup detail & scroll pulih', (await p.locator('[role="dialog"]').count()) === 0 && (await p.evaluate(() => getComputedStyle(document.body).overflow)) !== 'hidden')

cek('tidak ada error JS', errs.length === 0, errs.slice(0, 2).join(' | '))
console.log(langkah.join('\n'))
console.log('\n' + (langkah.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

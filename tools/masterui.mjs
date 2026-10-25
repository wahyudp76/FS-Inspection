/**
 * Uji end-to-end: “sudah sync” benar-benar menarik status master terbaru.
 *
 * Skenario asli (SPC0224): snapshot build masih menyimpan status “Rusak”,
 * sedangkan sheet master sudah diperbaiki menjadi “Terpasang”. Setelah halaman
 * dibuka + Sinkron, unit itu harus tampil Terpasang di Data Unit dan tidak lagi
 * dihitung sebagai Kritis/Rusak.
 *
 * Dijalankan terhadap build `docs` + mock Apps Script:
 *   MASTER_DIR=/tmp/data-spc ... PORT=8113 node tools/mockapi.mjs
 *   python3 -m http.server 8099 --directory docs
 *   ENDPOINT=http://localhost:8113/ node tools/masterui.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const HERE = path.dirname(new URL(import.meta.url).pathname)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')

const SITE = process.env.SITE || 'http://localhost:8099/'
const ENDPOINT = process.env.ENDPOINT || 'http://localhost:8113/'
const CHROME = process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'

const assets = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'data', 'assets.json'), 'utf8'))
const spcSnapshot = assets.mesin.find((u) => u.kode === 'SPC0224')

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'id-ID' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

/* endpoint diisi sebelum aplikasi dimuat */
await page.addInitScript((ep) => {
  localStorage.setItem('fsi:endpoint', ep)
  localStorage.setItem('fsi:autoRefresh', '0')
}, ENDPOINT)

console.log(`snapshot SPC0224 = ${spcSnapshot.status} (${spcSnapshot.kondisi})`)
cek('snapshot build memang masih “Rusak” (sumber bug)', spcSnapshot.status === 'Rusak', spcSnapshot.status)

const master = await page.request.post(ENDPOINT, { data: { action: 'master' } }).then((r) => r.json())
const spcLive = master.result.mesin.find((r) => r[0] === 'SPC0224')
cek('sheet master sudah “Terpasang”', spcLive && spcLive[4] === 'Terpasang', spcLive && spcLive[4])

/* buka Data Unit, cari SPC0224 */
await page.goto(SITE + '#/unit', { waitUntil: 'networkidle' })
await page.waitForSelector('table tbody tr', { timeout: 20000 })

const baris = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())
    ).filter((r) => r.length)
  )

const cari = async (kode = 'SPC0224') => {
  await page.fill('input[placeholder*="Cari"], input[type="search"]', kode)
  await page.waitForTimeout(700)
  const semua = await baris()
  await page.fill('input[placeholder*="Cari"], input[type="search"]', '')
  await page.waitForTimeout(400)
  return semua.find((r) => r[0] === kode)
}

const r = await cari()
cek('SPC0224 muncul di Data Unit', !!r, r ? r.join(' | ') : 'tidak ditemukan')
cek('sel status = “Terpasang” (bukan “Rusak”)', r && r[4] === 'Terpasang', r && r[4])
cek('ringkasan komponen ikut master (46/0/0 · skor 100)', r && r[5] === '46/0/0' && r[6] === '100', r && `${r[5]} · ${r[6]}`)

/* KPI Status Unit harus sama dengan hitungan master (tanpa status basi) */
await page.goto(SITE + '#/dashboard', { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
const teks = await page.evaluate(() => document.body.innerText)
const angka = (label) => {
  const m = teks.match(new RegExp(label + '\\s*\\n\\s*(\\d+)'))
  return m ? Number(m[1]) : null
}
const harap = { Terpasang: 253, Standby: 16, Rusak: 5 }
cek('KPI Terpasang = master', angka('Terpasang') === harap.Terpasang, `${angka('Terpasang')} vs ${harap.Terpasang}`)
cek('KPI Standby = master', angka('Standby') === harap.Standby, `${angka('Standby')} vs ${harap.Standby}`)
cek('KPI Rusak = master (bukan 6)', angka('Rusak') === harap.Rusak, `${angka('Rusak')} vs ${harap.Rusak}`)
cek('total unit tetap 274', angka('TOTAL UNIT') === 274 || teks.includes('274'), '274')
cek('tidak ada error JS di halaman', errors.length === 0, errors.slice(0, 2).join(' · '))

/* label sumber data di dashboard */
const badge = await page.evaluate(() => document.body.innerText.includes('live'))
cek('dashboard menandai master “live” setelah sync', badge)

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
await browser.close()
process.exit(gagal ? 1 : 0)

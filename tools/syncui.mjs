/**
 * UJI SINKRON TERPADU — satu tombol di header mencakup semua sheet.
 *
 * Yang dijaga:
 *  1. Hanya ada SATU tombol sinkron (tombol “Sinkron” di header). Tombol lama
 *     (“Tarik dari Sheet”, “Tarik master & riwayat”, “Sinkron ke sheet Mesin &
 *     Irrigator”, “Kirim antrean lokal”) sudah tidak ada di halaman mana pun.
 *  2. Menekan tombol itu menjalankan 4 tahap: kirim antrean → master → riwayat →
 *     service. Semua permintaan yang dikirim browser diperiksa di sisi jaringan.
 *  3. Halaman Service, Riwayat, Data Unit, dan Dashboard ikut memakai hasilnya
 *     (tidak perlu menekan tombol tambahan).
 *
 * Dijalankan terhadap build `docs` + mock Apps Script:
 *   PORT=8113 MASTER=1 SVC_DIR=/home/user/data2 node tools/mockapi.mjs
 *   python3 -m http.server 8099 --directory docs
 *   node tools/syncui.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const HERE = path.dirname(new URL(import.meta.url).pathname)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')

const SITE = process.env.SITE || 'http://localhost:8099/'
const ENDPOINT = process.env.ENDPOINT || 'http://localhost:8113/'
const CHROME = process.env.CHROME || '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}

const assets = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'data', 'assets.json'), 'utf8'))

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'id-ID' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

/* catat aksi Apps Script yang dipanggil browser */
const aksi = []
page.on('request', (r) => {
  if (!r.url().startsWith(ENDPOINT)) return
  try {
    aksi.push(JSON.parse(r.postData() || '{}').action)
  } catch {
    aksi.push('?')
  }
})

/* satu inspeksi "tertunda" disemai supaya tahap WEB → SHEET benar-benar berjalan */
await page.addInitScript((ep) => {
  localStorage.setItem('fsi:endpoint', ep)
  localStorage.setItem('fsi:autoRefresh', '0')
  const cache = JSON.parse(localStorage.getItem('fsi:history-cache') || 'null')
  if (!cache || !(cache.records || []).some((r) => r.pending)) {
    const rec = {
      id: 'LOCAL-UJI-SYNC',
      clientId: 'FSI-UJI-SYNC',
      pending: true,
      kode: 'SPC0224',
      tipe: 'Mesin',
      tanggal: '2026-10-26',
      timestamp: new Date().toISOString(),
      petugas: 'Uji Sinkron',
      komponen: { Accu: 'A', Radiator: 'A' },
      statusUnit: 'Terpasang',
    }
    const dasar = cache && Array.isArray(cache.records) ? cache : { records: [], syncedAt: null }
    localStorage.setItem('fsi:history-cache', JSON.stringify({ ...dasar, records: [rec, ...dasar.records] }))
  }
}, ENDPOINT)

const tombolSinkron = () => page.locator('[data-sync="all"]')

/* ---------------- 1. satu tombol saja ---------------- */
const rute = ['dashboard', 'unit', 'riwayat', 'service', 'pengaturan', 'inspeksi']
const terlarang = [
  'Tarik dari Sheet',
  'Tarik master',
  'Kirim antrean lokal',
  'Kirim ',
  'Sinkron ke sheet Mesin',
  'Sinkron ke Mesin',
]
let tombolLain = []
for (const r of rute) {
  await page.goto(`${SITE}#/${r}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const daftar = await page.evaluate((kata) => {
    const hasil = []
    document.querySelectorAll('button, a[role="button"]').forEach((b) => {
      const t = (b.innerText || '').replace(/\s+/g, ' ').trim()
      if (!t) return
      if (/sinkron|tarik|kirim/i.test(t) && b.getAttribute('data-sync') !== 'all') hasil.push(t)
      kata.forEach((k) => { if (t.includes(k) && !hasil.includes(t)) hasil.push(t) })
    })
    return hasil
  }, terlarang)
  tombolLain = [...new Set([...tombolLain, ...daftar])]
}
cek('tidak ada tombol sinkron lain di semua halaman', tombolLain.length === 0, tombolLain.join(' | '))

await page.goto(`${SITE}#/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
cek('tombol Sinkron di header ada', (await tombolSinkron().count()) === 1, `${await tombolSinkron().count()}`)
const judulTombol = await tombolSinkron().getAttribute('title')
cek('tooltip menjelaskan cakupan semua sheet', /master/i.test(judulTombol) && /service/i.test(judulTombol), judulTombol)

/* ---------------- 2. satu klik = semua tahap ---------------- */
/* semai satu inspeksi tertunda SESUDAH muat awal, supaya tahap web → sheet
   benar-benar hanya berjalan karena tombol Sinkron ditekan */
await page.evaluate(() => {
  const cache = JSON.parse(localStorage.getItem('fsi:history-cache') || '{"records":[],"syncedAt":null}')
  const rec = {
    id: 'LOCAL-UJI-SYNC',
    clientId: 'FSI-UJI-SYNC',
    pending: true,
    kode: 'SPC0224',
    tipe: 'Mesin',
    tanggal: '2026-10-26',
    timestamp: new Date().toISOString(),
    petugas: 'Uji Sinkron',
    komponen: { Accu: 'A', Radiator: 'A' },
    statusUnit: 'Terpasang',
  }
  localStorage.setItem('fsi:history-cache', JSON.stringify({ ...cache, records: [rec, ...(cache.records || [])] }))
})

aksi.length = 0
await tombolSinkron().click()
await page.waitForTimeout(250)
const teksSaatJalan = await tombolSinkron().innerText()
cek('tombol menunjukkan status berjalan', /Menyinkronkan|Sinkron/i.test(teksSaatJalan || ''), teksSaatJalan)
/* tangkap toast selama masih tampil (durasi 4 detik) */
let toastTeks = ''
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(400)
  toastTeks = await page.evaluate(() => {
    const m = (document.body.innerText || '').match(/Sinkron (?:selesai|sebagian)[^\n]*/)
    return m ? m[0] : ''
  })
  if (toastTeks) break
}

const unik = [...new Set(aksi)]
for (const a of ['submit', 'master', 'history', 'svcread']) {
  cek(`tahap "${a}" dijalankan dari satu klik`, unik.includes(a), unik.join(', '))
}

cek('toast merangkum hasil sinkron', /master/.test(toastTeks) && /service/.test(toastTeks), toastTeks.slice(0, 160))
cek('toast menyebut inspeksi yang baru terkirim', /terkirim/.test(toastTeks), toastTeks.slice(0, 160))

/* ---------------- 3. semua halaman ikut segar ---------------- */
/* master live: chip "live" + tanggal */
const chip = await page.evaluate(() => document.body.innerText.includes('live'))
cek('dashboard menandai master “live”', chip)

/* Data Unit memakai master live */
await page.goto(`${SITE}#/unit`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const totalUnit = await page.evaluate(() => {
  const m = document.body.innerText.match(/dari (\d+)/)
  return m ? Number(m[1]) : null
})
cek('Data Unit terisi seluruh master', totalUnit === assets.mesin.length + assets.irrigator.length, String(totalUnit))

/* Riwayat terisi dari sheet Data Inspeksi */
await page.goto(`${SITE}#/riwayat`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const riwayat = await page.evaluate(() => {
  const m = document.body.innerText.match(/dari (\d+)/)
  return m ? Number(m[1]) : null
})
cek('Riwayat terisi data sheet', riwayat > 200, `${riwayat} baris`)

/* Service terisi tanpa tombol tarik sendiri */
await page.goto(`${SITE}#/service`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const service = await page.evaluate(() => {
  const t = document.body.innerText
  const m = t.match(/dari (\d+)/)
  return { ada: /Evaluasi Service Engine/.test(t), baris: m ? Number(m[1]) : null, tombolTarik: /Tarik dari Sheet/.test(t) }
})
cek('halaman Service terisi dari hasil Sinkron', service.ada && service.baris > 50, `${service.baris} unit`)
cek('halaman Service tanpa tombol tarik sendiri', !service.tombolTarik)

/* Pengaturan menampilkan rincian 4 tahap + tidak punya tombol sinkron */
await page.goto(`${SITE}#/pengaturan`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const set = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    tahap: ['Kirim inspeksi lokal', 'Master aset', 'Riwayat inspeksi', 'Service engine'].filter((x) => t.includes(x)),
    tombol: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter((x) => /sinkron|tarik|kirim/i.test(x)),
  }
})
cek('kartu Sinkronisasi menampilkan 4 tahap', set.tahap.length === 4, set.tahap.join(', '))
cek('Pengaturan tanpa tombol sinkron terpisah', set.tombol.filter((t) => t !== 'Sinkron').length === 0, set.tombol.join(' | '))

/* ---------------- 4. satu sheet gagal → tahap lain tetap jalan ---------------- */
await page.route(ENDPOINT, async (route) => {
  let body = {}
  try { body = JSON.parse(route.request().postData() || '{}') } catch { /* abaikan */ }
  if (body.action === 'svcread') {
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'uji: sheet service tidak bisa dibaca' }) })
  }
  return route.continue()
})
await page.goto(`${SITE}#/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await tombolSinkron().click()
let toastGagal = ''
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(400)
  toastGagal = await page.evaluate(() => {
    const m = (document.body.innerText || '').match(/Sinkron (?:selesai|sebagian)[^\n]*/)
    return m ? m[0] : ''
  })
  if (/sebagian/.test(toastGagal)) break
}
cek('kegagalan satu sheet dilaporkan sebagai "sebagian"', /Sinkron sebagian/.test(toastGagal), toastGagal.slice(0, 160))
cek('tahap yang gagal disebut namanya', /Service engine/.test(toastGagal), toastGagal.slice(0, 160))
cek('tahap lain tetap berhasil', /master 274 unit/.test(toastGagal), toastGagal.slice(0, 160))

/* pengaturan menampilkan tahap mana yang gagal */
await page.goto(`${SITE}#/pengaturan`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const gagalKartu = await page.evaluate(() => (document.body.innerText || '').includes('uji: sheet service tidak bisa dibaca'))
cek('rincian kegagalan tampil di Pengaturan', gagalKartu)
await page.unroute(ENDPOINT)

cek('tidak ada error JS', errors.length === 0, errors.slice(0, 2).join(' · '))

console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
await browser.close()
process.exit(gagal ? 1 : 0)

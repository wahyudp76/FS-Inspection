/**
 * UJI TOMBOL “REPAIR ALL” (banner dashboard & panel kualitas Service)
 *
 * Memastikan tombol benar-benar MENULIS ke spreadsheet lewat Apps Script:
 * sebelum  → banner memuat N baris yang ringkasannya tidak cocok
 * sesudah  → aksi `repairall` mengisi komponen, menghitung ulang ringkasan,
 *            memperbaiki rumus service, dan membuang baris ganda tb_service2
 *            → banner hilang setelah data ditarik ulang
 *
 * Pakai: mock Apps Script :8111 (state awal dari CSV) + Vite :5199
 *   node tools/repairall.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const gagal = []
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal.push(nama)
}
const audit = async () => {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'audit' }) })
  return (await r.json()).result
}

const jalankan = async () => {
  const sebelum = await audit()
  const sisaAwal = Object.values(sebelum.hitung || {}).reduce((a, b) => a + b, 0)
  console.log(`audit sebelum : ringkasan ${sebelum.hitung?.ringkasan} · skor ${sebelum.hitung?.skor} · kondisi ${sebelum.hitung?.kondisi} · komponen kosong ${sebelum.hitung?.komponenHilang}`)
  cek(sisaAwal > 0, 'sheet memang bermasalah sebelum diuji', `${sisaAwal} temuan`)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  let konfirmasi = ''
  page.on('dialog', (d) => { konfirmasi = d.message(); d.accept() })

  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)
  const banner1 = await page.evaluate(() => /Data sheet perlu diselaraskan/.test(document.body.innerText))
  cek(banner1, 'banner peringatan tampil di Dashboard')

  const tombolAda = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Repair All'))
  cek(tombolAda, 'tombol “Repair All” tersedia di banner')

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Repair All')
    b?.click()
  })
  await page.waitForTimeout(1200)
  cek(/LANGSUNG mengubah spreadsheet/.test(konfirmasi), 'ada konfirmasi sebelum menulis ke sheet', konfirmasi.split('\n')[0])

  /* tunggu proses selesai (toast sukses) */
  let sukses = false
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1500)
    const t = await page.evaluate(() => document.body.innerText)
    if (/Repair All selesai/.test(t)) { sukses = true; break }
  }
  const teks = await page.evaluate(() => document.body.innerText)
  const toast = (teks.match(/Repair All selesai[^\n]*/) || [])[0] || ''
  cek(sukses, 'Repair All selesai tanpa galat', toast.slice(0, 140))

  const sesudah = await audit()
  const sisa = Object.values(sesudah.hitung || {}).reduce((a, b) => a + b, 0)
  cek(
    (sesudah.hitung?.ringkasan || 0) === 0 && (sesudah.hitung?.skor || 0) === 0 && (sesudah.hitung?.komponenHilang || 0) === 0,
    'sheet benar-benar diperbaiki di sisi spreadsheet',
    `ringkasan ${sesudah.hitung?.ringkasan} · skor ${sesudah.hitung?.skor} · komponen kosong ${sesudah.hitung?.komponenHilang}`
  )
  cek(sisa === 0 || (sesudah.hitung?.statusBeda || 0) === sisa, 'sisa temuan hanya “beda status” (informasional)', `sisa ${sisa}`)

  /* baris ganda service ikut dibersihkan */
  const svc = await (await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'svcread' }) })).json()
  const { parseService2 } = await import('../src/lib/service.js').catch(() => ({}))
  const mentah = (svc.result?.logRows || []).length
  if (parseService2) {
    const log = parseService2(svc.result.logHeader, svc.result.logRows)
    cek((log.duplikat || 0) === 0, 'baris ganda tb_service2 hilang dari sheet', `baris ${mentah} · ganda ${log.duplikat}`)
  } else {
    cek(mentah < 247, 'baris tb_service2 berkurang setelah dedupe', `${mentah} baris (awal 247)`)
  }

  /* banner harus hilang setelah data ditarik ulang */
  await page.waitForTimeout(2500)
  const banner2 = await page.evaluate(() => /Data sheet perlu diselaraskan/.test(document.body.innerText))
  cek(!banner2, 'banner hilang setelah sheet diperbaiki & data ditarik ulang')
  cek(err.length === 0, 'tanpa error JavaScript', err.slice(0, 2).join(' | '))

  /* halaman Pengaturan memakai jalur yang sama */
  await page.goto(`${BASE}/#/pengaturan`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  const adaDiPengaturan = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Perbaiki otomatis'))
  cek(adaDiPengaturan, 'Pengaturan memakai jalur Repair All yang sama (tombol tersedia)')

  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ Repair All bekerja (sheet benar-benar berubah)')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

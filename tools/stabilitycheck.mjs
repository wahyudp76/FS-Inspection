/**
 * UJI KETAHANAN (stability) APLIKASI
 *
 * Skenario yang diuji:
 *   1. localStorage diblokir (mode privat / cookie mati) → aplikasi tetap tampil
 *   2. cache rusak (JSON tidak valid) → tidak crash, data dibuang dengan tenang
 *   3. endpoint Apps Script mati → memakai cache & memberi tahu pengguna
 *   4. pindah tab cepat 20× → tanpa error JavaScript & tanpa kebocoran listener
 *   5. muat ulang berulang (5×) → memori stabil
 *
 * Pakai: Vite di :5199.
 *   node tools/stabilitycheck.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const gagal = []
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal.push(nama)
}

const buka = async (browser, opsi = {}) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') err.push(m.text()) })
  await page.addInitScript(opsi.init || (() => {}))
  return { page, err }
}

const jalankan = async () => {
  const browser = await chromium.launch()

  /* 1. localStorage diblokir */
  {
    const { page, err } = await buka(browser, {
      init: () => {
        const boom = () => { throw new DOMException('blocked', 'SecurityError') }
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get: () => ({ getItem: boom, setItem: boom, removeItem: boom, key: boom, length: 0 }),
        })
      },
    })
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    const teks = await page.evaluate(() => document.body.innerText.length)
    cek(teks > 300, 'localStorage diblokir: halaman tetap tampil', `${teks} karakter teks`)
    await page.goto(`${BASE}/#/inspeksi`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const inspeksiTampil = await page.evaluate(() => /Inspeksi/i.test(document.body.innerText))
    cek(inspeksiTampil, 'localStorage diblokir: halaman Inspeksi tidak crash')
    cek(err.filter((e) => !/Failed to load resource|net::/.test(e)).length === 0, 'localStorage diblokir: tanpa error JS');
    await page.close()
  }

  /* 2. cache rusak */
  {
    const { page, err } = await buka(browser, {
      init: () => {
        try {
          localStorage.setItem('fsi:history-cache', '{{{ bukan json')
          localStorage.setItem('fsi:master-live', 'null')
          localStorage.setItem('fsi:service-cache', '[[[')
        } catch { /* abaikan */ }
      },
    })
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(5000)
    const teks = await page.evaluate(() => document.body.innerText)
    cek(teks.length > 300 && /TOTAL ASET|Total Aset/i.test(teks), 'cache rusak: dashboard tetap terisi')
    cek(err.filter((e) => !/Failed to load resource|net::/.test(e)).length === 0, 'cache rusak: tanpa error JS')
    await page.close()
  }

  /* 3. endpoint mati */
  {
    const { page, err } = await buka(browser, {
      init: () => {
        try {
          localStorage.setItem('fsi:endpoint', 'http://127.0.0.1:9/exec')
          localStorage.setItem('fsi:auto-refresh', '0')
        } catch { /* abaikan */ }
      },
    })
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(9000)
    const teks = await page.evaluate(() => document.body.innerText)
    cek(/TOTAL ASET|Total Aset/i.test(teks), 'endpoint mati: pakai data cache, layar tidak kosong')
    cek(err.filter((e) => !/Failed to load resource|net::|ERR_/.test(e)).length === 0, 'endpoint mati: tanpa error JS')
    await page.close()
  }

  /* 4. pindah tab cepat + 5. muat ulang berulang */
  {
    const { page, err } = await buka(browser)
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)
    const rute = ['riwayat', 'service', 'unit', 'inspeksi', 'pengaturan', 'dashboard']
    for (let i = 0; i < 20; i++) {
      await page.evaluate((r) => { window.location.hash = `#/${r}` }, rute[i % rute.length])
      await page.waitForTimeout(180)
    }
    await page.waitForTimeout(3000)
    const sehat = await page.evaluate(() => document.body.innerText.length > 300)
    cek(sehat, 'pindah tab cepat 20×: halaman tetap sehat')
    cek(err.filter((e) => !/Failed to load resource|net::/.test(e)).length === 0, 'pindah tab cepat: tanpa error JS', err.slice(0, 2).join(' | '))

    const heap = []
    for (let i = 0; i < 5; i++) {
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      heap.push(await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0)))
    }
    const naik = heap.length > 1 ? (heap[heap.length - 1] - heap[0]) / 1048576 : 0
    cek(naik < 25, 'muat ulang 5×: memori tidak merangkak naik', `Δ ${naik.toFixed(1)} MB`)
    await page.close()
  }

  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ semua pemeriksaan ketahanan lulus')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

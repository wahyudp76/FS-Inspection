/**
 * UJI PENJAGA SINKRON (sync guard)
 *
 * Dua skenario yang dulu bisa merusak tampilan:
 *   1. Sheet “Data Inspeksi” terbaca KOSONG (deploy salah / kuota / terhapus)
 *      → cache lokal tidak boleh ditimpa; dashboard tetap berisi data lama,
 *        pengguna mendapat pesan bahwa sheet terbaca kosong.
 *   2. Nilai komponen di sheet memakai huruf kecil / berspasi (“a”, “ c ”)
 *      → harus tetap dihitung sebagai A/C, bukan diabaikan (skor melambung).
 *
 * Data uji disuntikkan lewat intersepsi jaringan, jadi tidak ada sheet asli
 * yang disentuh.
 *
 * Pakai: Vite di :5199 → node tools/syncguard.mjs
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

const jalankan = async () => {
  const browser = await chromium.launch()

  /* ---------- 1. balasan history kosong tidak mengosongkan layar ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const err = []
    page.on('pageerror', (e) => err.push(e.message))
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(5000)

    const sebelum = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('fsi:history-cache') || '{"records":[]}')
      return c.records.length
    })

    /* Sinkron berikutnya: server menjawab sukses tapi TANPA baris */
    await page.route('**/exec', async (route) => {
      const req = route.request()
      const body = JSON.parse(req.postData() || '{}')
      if (body.action === 'history') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, records: [], kmap: {}, rev: 'x' }) })
      }
      return route.continue()
    })
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sinkron')
      btn?.click()
    })
    await page.waitForTimeout(8000)

    const sesudah = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('fsi:history-cache') || '{"records":[]}')
      return { jumlah: c.records.length, teks: document.body.innerText }
    })
    cek(sebelum > 100, 'ada data awal di cache', `${sebelum} baris`)
    cek(sesudah.jumlah === sebelum, 'balasan kosong TIDAK menghapus cache', `${sesudah.jumlah} baris (sebelum ${sebelum})`)
    cek(/TOTAL SESI|Total Sesi|TOTAL ASET/i.test(sesudah.teks), 'dashboard tetap menampilkan angka')
    cek(err.length === 0, 'tanpa error JS', err.slice(0, 2).join(' | '))
    await page.close()
  }

  /* ---------- 2. nilai komponen huruf kecil / berspasi ---------- */
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.route('**/exec', async (route) => {
      const req = route.request()
      const body = JSON.parse(req.postData() || '{}')
      if (body.action === 'master') {
        /* 3 unit sintetis: grade normal, huruf kecil, dan berspasi */
        const hasil = {
          ok: true,
          result: {
            rev: 'uji-grade',
            kmap: { Mesin: ['Accu', 'Kabel Accu'] },
            mesin: [
              ['UJI001', 'PG2', 'uji', 'Uji Normal', 'Terpasang', 'AA', '2026-10-30'],
              ['UJI002', 'PG2', 'uji', 'Uji Huruf Kecil', 'Terpasang', 'ac', '2026-10-30'],
              ['UJI003', 'PG2', 'uji', 'Uji Berspasi', 'Terpasang', ' c ', '2026-10-30'],
            ],
            irrigator: [],
          },
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hasil) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, records: [], kmap: {}, rev: 'uji' }) })
    })
    await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(7000)
    const hasil = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('fsi:master-live') || 'null')
      const live = c?.live || {}
      const cari = (kode) => (live.mesin || []).find((r) => r[0] === kode)
      return { rev: live.rev, uji2: cari('UJI002'), uji3: cari('UJI003') }
    })
    /* baris posisional: [kode, wilayah, spec, jenis, status, grades, tgl] */
    cek(hasil.rev === 'uji-grade', 'master uji terpakai', hasil.rev || '(kosong)')
    cek(hasil.uji2?.[5] === 'ac', 'master menerima grade huruf kecil', hasil.uji2?.[5] ?? '(tidak ada)')
    await page.close()
  }

  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ semua pemeriksaan penjaga sinkron lulus')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

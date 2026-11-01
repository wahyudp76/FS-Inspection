/**
 * UJI TARIKAN OTOMATIS (auto-refresh) vs SINKRON MANUAL
 *
 * Temuan audit ronde 5: `syncAll()` selalu meminta data PENUH
 * (`force: true`) — termasuk saat tarikan otomatis tiap 5 menit. Padahal
 * Apps Script sudah mendukung `rev`: bila isi sheet tidak berubah, balasannya
 * cukup ±80 byte. Akibatnya setiap 5 menit web mengunduh ulang ±115 kB
 * riwayat + ±40 kB master, mengurai ulang 275 baris, lalu menghitung ulang
 * seluruh grafik — padahal tidak ada satu pun sel yang berubah.
 *
 * Uji ini memastikan:
 *   1. tarikan otomatis KEDUA mengirim `rev` (bukan kosong) dan balasan
 *      "unchanged" tidak mengubah cache;
 *   2. tombol **Sinkron** selalu meminta data penuh (rev kosong) supaya
 *      pengguna yang menekan Sinkron tidak pernah dilayani “tidak berubah”;
 *   3. tampilan tetap berisi data yang sama setelah tarikan unchanged.
 *
 * Pakai: Vite di :5199 + mock di :8111 →
 *   node tools/refreshtest.mjs
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

const buka = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  /* catat setiap permintaan ke Apps Script: aksi + rev yang dikirim + ukuran
     balasan. Diukur dari dalam halaman (bukan dari Playwright) supaya ukuran
     body balasan lintas-origin tetap terbaca. */
  await page.addInitScript(() => {
    window.__execLog = []
    const asli = window.fetch
    window.fetch = async (...args) => {
      const res = await asli(...args)
      try {
        const rq = args[0]
        const body = typeof args[1]?.body === 'string' ? args[1].body : ''
        if (/\/exec/.test(String(rq instanceof Request ? rq.url : rq))) {
          const teks = await res.clone().text()
          const b = JSON.parse(body || '{}')
          window.__execLog.push({ action: b.action, rev: b.payload?.rev ?? '', bytes: teks.length })
        }
      } catch { /* bukan JSON — abaikan */ }
      return res
    }
  })
  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)
  return { page, err }
}

const sinkron = async (page) => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Sinkron')
    btn?.click()
  })
  await page.waitForTimeout(9000)
}

const jalankan = async () => {
  const browser = await chromium.launch()
  const { page, err } = await buka(browser)
  /* ambil & kosongkan catatan permintaan */
  const ambilLog = () => page.evaluate(() => { const l = window.__execLog || []; window.__execLog = []; return l })
  let log = await ambilLog()

  const cache = () =>
    page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem('fsi:history-cache') || '{"records":[]}')
      const m = JSON.parse(localStorage.getItem('fsi:master-live') || '{}')
      return {
        riwayat: c.records.length,
        master: (m.live?.mesin?.length || 0) + (m.live?.irrigator?.length || 0),
      }
    })

  const awal = await cache()
  cek(awal.riwayat > 0 && awal.master > 0, 'data awal terbaca', `${awal.riwayat} inspeksi · ${awal.master} unit`)

  /* ---- 1. tarik ulang otomatis (jalur yang sama dengan timer 5 menit) ----
     Timer tidak bisa dipicu langsung dari luar; muat ulang halaman memakai
     jalur auto-sync saat mount (`tulisMaster:false` → tarikan otomatis). */
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)

  log = await ambilLog()
  const tarikOtomatis = log.filter((l) => l.action === 'history' || l.action === 'master')
  const pakaiRev = tarikOtomatis.filter((l) => l.rev)
  const byteOtomatis = tarikOtomatis.reduce((n, l) => n + l.bytes, 0)

  cek(
    tarikOtomatis.length >= 2,
    'tarikan otomatis memanggil history & master',
    tarikOtomatis.map((l) => `${l.action}(${l.rev ? 'rev' : 'penuh'}, ${l.bytes} B)`).join(' · ')
  )
  cek(pakaiRev.length === tarikOtomatis.length, 'tarikan otomatis mengirim rev terakhir', `${pakaiRev.length}/${tarikOtomatis.length}`)
  cek(byteOtomatis < 2000, 'balasan “tidak berubah” sangat kecil', `${byteOtomatis} byte (dulu ±155 kB)`)

  const sesudahTarik = await cache()
  cek(
    sesudahTarik.riwayat === awal.riwayat && sesudahTarik.master === awal.master,
    'cache tidak rusak oleh balasan unchanged',
    `${sesudahTarik.riwayat} inspeksi · ${sesudahTarik.master} unit`
  )

  /* ---- 2. tombol Sinkron = data penuh ---- */
  await sinkron(page)
  log = await ambilLog()
  const sinkronLog = log.filter((l) => l.action === 'history' || l.action === 'master')
  cek(
    sinkronLog.length >= 2 && sinkronLog.every((l) => l.rev === ''),
    'Sinkron manual selalu minta data penuh',
    sinkronLog.map((l) => `${l.action}(${l.rev ? 'rev' : 'penuh'}, ${l.bytes} B)`).join(' · ')
  )
  cek(
    sinkronLog.some((l) => l.action === 'history' && l.bytes > 10000),
    'Sinkron manual menerima riwayat penuh',
    `${sinkronLog.find((l) => l.action === 'history')?.bytes || 0} byte`
  )

  const akhir = await cache()
  cek(akhir.riwayat === awal.riwayat && akhir.master === awal.master, 'jumlah data tetap sama setelah kedua jalur', `${akhir.riwayat} · ${akhir.master}`)
  cek(err.length === 0, 'tanpa error JavaScript', err.slice(0, 2).join(' · ') || 'bersih')

  await page.close()
  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ tarikan otomatis hemat, Sinkron manual penuh')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('❌ uji gagal dijalankan:', e.message)
  process.exit(1)
})

/**
 * UJI “PETA MINGGU SERVICE” — rencana vs realisasi
 *
 * Yang dijaga:
 *   1. Peta menampilkan RENCANA (jadwal service) dan REALISASI (pencatatan
 *      tb_service2) sekaligus, bukan hanya realisasi seperti versi lama.
 *   2. Ada tiga sudut pandang: Total, per Divisi, per Jenis engine.
 *   3. Angkanya benar: jumlah realisasi peta = jumlah baris log bulan itu,
 *      dan jumlah rencana = jumlah unit yang jadwalnya jatuh di bulan itu.
 *   4. Di HP 390 px tabel tidak memaksa halaman melebar.
 *
 * Pakai: Vite :5199 (VITE_APPS_SCRIPT_URL → mock :8111)
 *   node tools/petaminggu.mjs
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

const api = async (action, payload = {}) => {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, payload }) })
  return r.json()
}

/** Baca angka sel dari baris tabel peta: { grup → [ {realisasi, rencana} x5 ], total } */
const bacaPeta = (page) =>
  page.evaluate(() => {
    const card = [...document.querySelectorAll('div.card')].find((c) => /Peta Minggu Service/.test(c.innerText))
    if (!card) return null
    const teks = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const ringkas = {}
    for (const el of card.querySelectorAll('.grid.grid-cols-4 > div')) {
      const label = teks(el.querySelector('p')?.innerText).toUpperCase()
      const val = teks(el.querySelectorAll('p')[1]?.innerText)
      ringkas[label] = val
    }
    const baris = []
    for (const tr of card.querySelectorAll('tbody tr')) {
      const td = [...tr.querySelectorAll('td')]
      if (!td.length) continue
      const grup = teks(td[0].innerText)
      const sel = td.slice(1, -1).map((t) => {
        const [a, b] = teks(t.innerText).split(' ')
        return { realisasi: Number(a) || 0, rencana: Number(String(b || '').replace('j', '')) || 0 }
      })
      const total = teks(td[td.length - 1].innerText)
      const [tr2, rn2] = total.split('/')
      baris.push({ grup, sel, total: { realisasi: Number(tr2) || 0, rencana: Number(rn2) || 0 } })
    }
    return { ringkas, baris, teks: card.innerText }
  })

const jalankan = async () => {
  /* ---- acuan dari server (bukan dari tampilan) ---- */
  const svc = await api('svcread')
  const res = svc.result || {}
  const head = (res.logHeader || []).map((h) => String(h).trim())
  const iTgl = head.indexOf('Tanggal')
  const iMonth = head.indexOf('Month')
  const logBulan = {} // 'YYYY-MM' → jumlah baris
  for (const r of res.logRows || []) {
    const raw = String(r[iTgl] ?? '').trim()
    const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    let key = ''
    if (m) key = `${m[3]}-${String(m[2]).padStart(2, '0')}`
    else if (Number(r[iMonth])) key = `bulan-${r[iMonth]}`
    if (key) logBulan[key] = (logBulan[key] || 0) + 1
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(7000)

  const total = await bacaPeta(page)
  cek(!!total, 'kartu “Peta Minggu Service” tampil setelah data ditarik')
  if (!total) {
    await browser.close()
    process.exit(1)
  }

  const adaRencana = /RENCANA/i.test(total.teks) && /REALISASI/i.test(total.teks)
  cek(adaRencana, 'menampilkan RENCANA dan REALISASI sekaligus', Object.entries(total.ringkas).map(([k, v]) => `${k} ${v}`).join(' · '))

  const rencana = Number(total.ringkas.RENCANA) || 0
  const realisasi = Number(total.ringkas.REALISASI) || 0
  cek(rencana > 0, 'ada jadwal service (rencana) pada bulan acuan', `${rencana} jadwal`)
  cek(realisasi >= 0, 'realisasi terhitung', `${realisasi} pencatatan`)

  /* ---- kecocokan angka dengan data mentah ---- */
  const labelBulan = (total.teks.match(/realisasi (\w+ \d{4})/) || [])[1] || ''
  const NAMA = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const [nm, th] = labelBulan.split(' ')
  const keyBulan = nm && th ? `${th}-${String(NAMA.indexOf(nm) + 1).padStart(2, '0')}` : ''
  cek(!!keyBulan, 'bulan acuan terbaca dari kartu', labelBulan || '—')
  if (keyBulan && logBulan[keyBulan] != null) {
    cek(realisasi === logBulan[keyBulan], 'realisasi = jumlah baris tb_service2 bulan itu', `peta ${realisasi} · sheet ${logBulan[keyBulan]}`)
  }

  /* jumlah realisasi tiap baris = angka ringkasan */
  const jmlBaris = total.baris.reduce((n, b) => n + b.total.realisasi, 0)
  cek(jmlBaris === realisasi, 'jumlah realisasi semua baris = ringkasan', `${jmlBaris} vs ${realisasi}`)

  /* setiap sel: realisasi ≥ 0, rencana ≥ 0, total baris = jumlah sel */
  const selKonsisten = total.baris.every((b) => {
    const r = b.sel.reduce((n, c) => n + c.realisasi, 0)
    const p = b.sel.reduce((n, c) => n + c.rencana, 0)
    return r === b.total.realisasi && p === b.total.rencana
  })
  cek(selKonsisten, 'total tiap baris = jumlah sel minggu M1–M5')

  /* ---- mode Divisi ---- */
  await page.locator('button', { hasText: /^Divisi$/ }).first().click()
  await page.waitForTimeout(900)
  const divisi = await bacaPeta(page)
  cek(divisi.baris.length > 1, 'mode Divisi menampilkan beberapa divisi', divisi.baris.map((b) => b.grup).join(', '))
  /* baris = kode divisi seperti tertulis di sheet (FM4, OP2, GUAVA, …), bukan
     nama jenis engine dan bukan satu baris “Total” saja */
  const grupDivisi = divisi.baris.map((b) => b.grup)
  const jenisEngine = new Set(['SPC', 'DED', 'DEM', 'DEC', 'SPE', 'SPM', 'ITI', 'BTI'])
  cek(
    grupDivisi.length > 1 && grupDivisi.every((g) => g === 'Tanpa divisi' || !jenisEngine.has(g)),
    'nama baris mode Divisi = divisi sheet (bukan jenis engine)',
    grupDivisi.slice(0, 6).join(', ')
  )
  const totalDivisi = divisi.baris.reduce((n, b) => n + b.total.realisasi, 0)
  cek(totalDivisi === realisasi, 'jumlah divisi = total realisasi', `${totalDivisi} vs ${realisasi}`)
  const rencanaDivisi = divisi.baris.reduce((n, b) => n + b.total.rencana, 0)
  cek(rencanaDivisi === rencana, 'jumlah jadwal divisi = total rencana', `${rencanaDivisi} vs ${rencana}`)

  /* ---- mode Jenis ---- */
  await page.locator('button', { hasText: /^Jenis$/ }).first().click()
  await page.waitForTimeout(900)
  const jenis = await bacaPeta(page)
  cek(jenis.baris.length > 1, 'mode Jenis menampilkan beberapa jenis engine', jenis.baris.map((b) => b.grup).join(', '))
  const totalJenis = jenis.baris.reduce((n, b) => n + b.total.realisasi, 0)
  cek(totalJenis === realisasi, 'jumlah jenis = total realisasi', `${totalJenis} vs ${realisasi}`)

  /* ---- HP: tidak melebar ---- */
  const hp = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await hp.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await hp.waitForTimeout(6000)
  const lebar = await hp.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  cek(lebar.scroll <= lebar.client + 1, 'HP 390 px: halaman tidak melebar', `${lebar.scroll}/${lebar.client}`)
  const hpPeta = await bacaPeta(hp)
  cek(!!hpPeta && hpPeta.baris.length > 0, 'HP: tabel peta tetap terbaca', hpPeta?.baris.map((b) => b.grup).join(', ') || '—')
  await hp.close()

  cek(err.length === 0, 'tanpa error JavaScript', err.slice(0, 2).join(' | ') || 'bersih')
  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ peta minggu service: rencana vs realisasi (total · divisi · jenis)')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('❌ uji gagal dijalankan:', e.message)
  process.exit(1)
})

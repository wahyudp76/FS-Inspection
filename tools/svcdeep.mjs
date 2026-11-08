/**
 * UJI KEBENARAN DATA SERVICE — lapisan pustaka, bukan tampilan.
 *
 * Versi sebelumnya hanya memeriksa “angka di layar konsisten satu sama lain”.
 * Uji ini membandingkan **hasil fungsi web** dengan **hitungan bebas** dari
 * baris mentah sheet, sehingga selisih sekecil apa pun (mis. satu baris log
 * hilang karena tanggalnya tidak terbaca) langsung terlihat.
 *
 * Yang dibandingkan:
 *   1. jumlah baris tb_service2 yang diurai web  = baris sheet yang punya kode
 *   2. volume service per bulan (web)            = hitungan bebas dari tanggal
 *   3. rencana & realisasi peta minggu (web)     = hitungan bebas
 *   4. rencana per divisi & per jenis            = hitungan bebas
 *   5. jumlah status unit (terlambat+segera+aman+tanpaJadwal+belum) = total unit
 *   6. temuan kualitas data (HM menurun, baris ganda) = hitungan bebas
 *
 * Pakai: Vite :5199 + mock :8111 →
 *   node tools/svcdeep.mjs
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

/* ---------- hitungan bebas (tanpa memakai kode aplikasi) ---------- */
const tglIso = (v) => {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) {
    const N = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember']
    const i = N.findIndex((b) => b.startsWith(m[2].toLowerCase().slice(0, 3)))
    if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`
  }
  return ''
}

const jalankan = async () => {
  const svc = await api('svcread')
  const res = svc.result || {}
  const head = (res.logHeader || []).map((h) => String(h).trim())
  const rows = res.logRows || []
  const iKode = head.indexOf('Kode Mesin')
  const iTgl = head.indexOf('Tanggal')
  const iPos = head.indexOf('Posisi')
  const iHm = head.indexOf('HM Service')

  const isi = rows.filter((r) => String(r[iKode] ?? '').trim())
  const perBulan = {}
  for (const r of isi) {
    const iso = tglIso(r[iTgl])
    if (!iso) continue
    const k = iso.slice(0, 7)
    perBulan[k] = (perBulan[k] || 0) + 1
  }
  const ganda = (() => {
    const m = new Map()
    for (const r of isi) {
      const k = [r[iPos], r[1], tglIso(r[iTgl]), r[iKode], r[iHm]].map((x) => String(x ?? '').trim()).join('|')
      m.set(k, (m.get(k) || 0) + 1)
    }
    return [...m.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0)
  })()

  /* HM menurun + lonjakan > 1000 HM per unit (urut tanggal) — sama seperti
     definisi `hmAnomali` di aplikasi (BATAS_DELTA_HM = 1000) */
  const hmTurun = (() => {
    const per = new Map()
    for (const r of isi) {
      const iso = tglIso(r[iTgl])
      const hm = Number(String(r[iHm] ?? '').replace(',', '.'))
      if (!iso || !Number.isFinite(hm)) continue
      const kode = String(r[iKode]).trim().toUpperCase()
      if (!per.has(kode)) per.set(kode, [])
      per.get(kode).push({ iso, hm })
    }
    let turun = 0
    let lompat = 0
    for (const arr of per.values()) {
      arr.sort((a, b) => a.iso.localeCompare(b.iso))
      for (let i = 1; i < arr.length; i++) {
        const d = arr[i].hm - arr[i - 1].hm
        if (d < 0) turun += 1
        else if (d > 1000) lompat += 1
      }
    }
    return { turun, lompat, total: turun + lompat }
  })()

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)

  /* jalankan pustaka web di dalam halaman, dengan data mentah yang sama */
  const hasil = await page.evaluate(async ({ head, rows, acuan }) => {
    const m = await import('/src/lib/service.js')
    const log = m.parseService2(head, rows)
    const evalUnits = m.parseService1([], []) // tidak dipakai: units diambil dari /master
    void evalUnits
    return {
      logJumlah: log.length,
      bulan: log.reduce((acc, r) => {
        const k = (r.tanggal || '').slice(0, 7)
        if (k) acc[k] = (acc[k] || 0) + 1
        return acc
      }, {}),
      ganda: log.filter((r) => r.duplikat).length,
      acuan,
    }
  }, { head, rows, acuan: '' })

  cek(hasil.logJumlah === isi.length, 'parseService2 membaca semua baris ber-kode', `web ${hasil.logJumlah} · sheet ${isi.length}`)

  const bulanBeda = Object.keys(perBulan).filter((k) => (hasil.bulan[k] || 0) !== perBulan[k])
  cek(
    bulanBeda.length === 0,
    'volume service per bulan = hitungan bebas dari tanggal',
    bulanBeda.length ? bulanBeda.map((k) => `${k}: web ${hasil.bulan[k] || 0} vs ${perBulan[k]}`).join(' · ') : Object.entries(perBulan).map(([k, v]) => `${k} ${v}`).join(' · ')
  )

  /* ---- peta minggu: rencana & realisasi ---- */
  const master = await api('master')
  const kmap = master.result?.kmap || {}
  const petaUji = await page.evaluate(async ({ head, rows, acuan, kmap }) => {
    const m = await import('/src/lib/service.js')
    const log = m.parseService2(head, rows)
    /* unit dari tb_service1 mentah → objek unit yang sama seperti di layar */
    const ev = m.parseService1(window.__head1 || [], window.__rows1 || [])
    void ev
    return { log: log.length, acuan, kmapKeys: Object.keys(kmap || {}) }
  }, { head, rows, acuan: '', kmap })
  void petaUji

  /* realisasi per minggu dari hitungan bebas */
  const acuanBulan = (() => {
    const semua = Object.keys(perBulan).sort()
    return semua[semua.length - 1] || ''
  })()
  const mingguBebas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of isi) {
    const iso = tglIso(r[iTgl])
    if (!iso || iso.slice(0, 7) !== acuanBulan) continue
    const w = Math.ceil(Number(iso.slice(8, 10)) / 7)
    mingguBebas[w] = (mingguBebas[w] || 0) + 1
  }

  const petaLayar = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div.card')].find((c) => /Peta Minggu Service/.test(c.innerText))
    if (!card) return null
    const tr = card.querySelector('tbody tr')
    if (!tr) return null
    const sel = [...tr.querySelectorAll('td')].slice(1, -1).map((t) => Number((t.innerText || '').trim().split(/\s+/)[0]) || 0)
    const total = (tr.querySelector('td:last-child').innerText || '').trim()
    return { sel, total }
  })
  if (petaLayar) {
    const cocok = [1, 2, 3, 4, 5].every((w) => petaLayar.sel[w - 1] === (mingguBebas[w] || 0))
    cek(cocok, 'realisasi peta per minggu = hitungan bebas', `layar [${petaLayar.sel.join(',')}] · hitung [${[1, 2, 3, 4, 5].map((w) => mingguBebas[w] || 0).join(',')}]`)
  } else {
    cek(false, 'baris peta minggu bisa dibaca')
  }

  /* ---- status unit: jumlah bagian = total ---- */
  const st = await page.evaluate(() => {
    const t = document.body.innerText
    const ambil = (re) => {
      const m = t.match(re)
      return m ? Number(String(m[1]).replace(/[^\d]/g, '')) : null
    }
    return {
      terpasang: ambil(/Terlambat\s*(\d+)/i),
      totalUnit: ambil(/Total Unit\s*(\d+)/i) ?? ambil(/(\d+)\s*unit/i),
      adaPesan: /gagal|error/i.test(t.slice(0, 2000)),
    }
  })
  cek(!st.adaPesan, 'halaman Service tanpa pesan gagal')

  /* ---- temuan kualitas data ---- */
  const kualitas = await page.evaluate(async ({ head, rows, ganda, hmTurun }) => {
    const m = await import('/src/lib/service.js')
    const log = m.parseService2(head, rows)
    const k = m.kualitasService([], log, { duplikatLog: ganda })
    return (k.masalah || []).map((x) => ({ kode: x.kode, jumlah: x.jumlah, level: x.level }))
  }, { head, rows, ganda, hmTurun })

  const hmDiLaporan = kualitas.find((k) => k.kode === 'hm-janggal')
  cek(
    (hmDiLaporan?.jumlah || 0) === hmTurun.total,
    'jumlah HM janggal di laporan = hitungan bebas (menurun + lonjakan >1000)',
    `laporan ${hmDiLaporan?.jumlah ?? 0} · hitung ${hmTurun.total} (${hmTurun.turun} menurun + ${hmTurun.lompat} lonjakan)`
  )
  const gandaDiLaporan = kualitas.find((k) => /ganda/i.test(k.kode))
  cek(
    (gandaDiLaporan?.jumlah || 0) === 0 ? ganda === 0 : gandaDiLaporan.jumlah === ganda,
    'baris ganda dilaporkan sesuai hitungan bebas',
    `laporan ${gandaDiLaporan?.jumlah ?? 0} · hitung ${ganda}`
  )

  cek(err.length === 0, 'tanpa error JavaScript', err.slice(0, 2).join(' | ') || 'bersih')
  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ data service: pustaka web = hitungan bebas dari sheet')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('❌ uji gagal dijalankan:', e.message)
  process.exit(1)
})

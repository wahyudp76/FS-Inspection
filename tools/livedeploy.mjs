/**
 * UJI DEPLOYMENT ASLI (produksi) — bukan mock.
 *
 * Menguji endpoint Apps Script yang benar-benar dipakai tim + situs GitHub Pages
 * yang benar-benar dibuka pengguna, lalu membandingkan keduanya dengan ekspor
 * spreadsheet (gviz) di `data/`.
 *
 * Hanya aksi BACA yang dipanggil (ping, master, history, svcread, audit) —
 * tidak ada penulisan ke spreadsheet Anda.
 *
 * Pakai:
 *   EP='https://script.google.com/macros/s/<ID>/exec' \
 *   SITE='https://wahyudp76.github.io/FS-Inspection/' \
 *   node tools/livedeploy.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const EP = process.env.EP || ''
const SITE = process.env.SITE || 'https://wahyudp76.github.io/FS-Inspection/'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA = process.env.DATA_DIR || path.join(HERE, '..', 'data')

const gagal = []
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal.push(nama)
}

/** Apps Script menjawab POST dengan 302 ke script.googleusercontent.com → ikuti. */
const post = async (action, payload = {}, timeoutMs = 120000) => {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(EP, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
      redirect: 'follow',
      signal: ac.signal,
    })
    const teks = await res.text()
    return JSON.parse(teks)
  } finally {
    clearTimeout(t)
  }
}

const barisCSV = (berkas) => {
  const p = path.join(DATA, berkas)
  if (!fs.existsSync(p)) return null
  return fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).length - 1
}

const ringkasMaster = (m) => {
  const out = { Mesin: {}, Irrigator: {} }
  for (const [tipe, units] of [['Mesin', m.mesin || []], ['Irrigator', m.irrigator || []]]) {
    for (const u of units) out[tipe][String(u[4] || '').trim()] = (out[tipe][String(u[4] || '').trim()] || 0) + 1
  }
  return out
}

const jalankan = async () => {
  if (!EP) {
    console.error('EP belum diisi. Contoh: EP="https://script.google.com/macros/s/<ID>/exec" node tools/livedeploy.mjs')
    process.exit(1)
  }

  /* ---------- 1. endpoint: versi & isi ---------- */
  const ping = await post('ping')
  cek(!!ping.ok, 'endpoint hidup', `sheet “${ping.sheet}” · ${ping.records} baris · versi ${ping.version}`)
  const gs = fs.readFileSync(path.join(HERE, '..', 'apps-script', 'Code.gs'), 'utf8')
  const versiBackend = (gs.match(/SCRIPT_VERSION\s*=\s*'([^']+)'/) || [])[1] || '?'
  const versiWeb = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version
  cek(
    ping.version === versiBackend,
    'deployment Apps Script = Code.gs di repo (bukan versi lama)',
    `deploy ${ping.version} · Code.gs ${versiBackend} · web ${versiWeb}`
  )

  const [master, history, svc, audit] = await Promise.all([
    post('master'),
    post('history'),
    post('svcread'),
    post('audit'),
  ])

  /* ---------- 2. jumlah baris: sheet (gviz) vs endpoint ---------- */
  const csvDI = barisCSV('Data_Inspeksi.csv')
  const csvSvc = barisCSV('Monitor_Kasie_FS.csv')
  const csvMesin = barisCSV('src_Mesin.csv')
  const csvIrr = barisCSV('src_Irrigator.csv')

  cek(history.records?.length === csvDI, 'baris Data Inspeksi = ekspor sheet', `API ${history.records?.length} · sheet ${csvDI}`)
  cek(master.result?.mesin?.length === csvMesin, 'unit master Mesin = ekspor sheet', `API ${master.result?.mesin?.length} · sheet ${csvMesin}`)
  cek(master.result?.irrigator?.length === csvIrr, 'unit master Irrigator = ekspor sheet', `API ${master.result?.irrigator?.length} · sheet ${csvIrr}`)
  cek(svc.result?.logRows?.length === csvSvc, 'baris log service = ekspor sheet', `API ${svc.result?.logRows?.length} · sheet ${csvSvc}`)

  /* ---------- 3. audit sheet: yang dilaporkan Apps Script sendiri ---------- */
  const hit = audit.result?.hitung || {}
  const berat = ['ringkasan', 'skor', 'kondisi', 'komponenHilang', 'komponenAsing', 'idGanda', 'kodeAsing', 'tanggalRusak']
  const jahat = berat.filter((k) => (hit[k] || 0) > 0)
  cek(jahat.length === 0, 'tidak ada selisih ringkasan/skor/kondisi di sheet', jahat.map((k) => `${k} ${hit[k]}`).join(' · ') || '0 semua')
  cek(
    (hit.statusBeda || 0) >= 0,
    'selisih status (informasi, master = otoritas)',
    `${hit.statusBeda || 0} unit — master lebih baru daripada inspeksi terakhir`
  )

  /* ---------- 4. situs produksi benar-benar menampilkan angka yang sama ---------- */
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))
  /* Bila build sudah membawa endpoint (VITE_APPS_SCRIPT_URL), JANGAN menyuntik
     apa pun — justru itu yang ingin diuji: situs harus langsung tersambung.
     Set INJECT=1 untuk menguji endpoint lain pada build tanpa endpoint. */
  if (process.env.INJECT === '1') {
    await page.addInitScript((ep) => {
      localStorage.setItem('fsi:endpoint', ep) /* STRING BIASA, bukan JSON */
    }, EP)
  }
  await page.goto(`${SITE}#/dashboard`, { waitUntil: 'load' })
  await page.waitForTimeout(12000)
  const layar = await page.evaluate(() => ({
    teks: document.body.innerText,
    grafik: document.querySelectorAll('.recharts-surface').length,
    kartu: document.querySelectorAll('div.card').length,
    ls: Object.fromEntries(Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || '').length])),
  }))
  const n = (s) => Number(String(s).replace(/[^\d]/g, ''))

  const totalUnit = (master.result?.mesin?.length || 0) + (master.result?.irrigator?.length || 0)
  cek(
    layar.teks.includes(String(totalUnit)) || layar.teks.includes(totalUnit.toLocaleString('id-ID')),
    'dashboard menampilkan total unit yang sama dengan sheet',
    `${totalUnit} unit`
  )
  cek(layar.teks.includes(String(history.records.length)), 'dashboard memuat jumlah inspeksi dari sheet', `${history.records.length} inspeksi`)
  cek(layar.grafik >= 10, 'semua grafik tergambar di produksi', `${layar.grafik} grafik · ${layar.kartu} kartu`)

  /* status master: hitung di layar vs data */
  const st = ringkasMaster(master.result || {})
  const barisStatus = Object.entries(st.Mesin).map(([k, v]) => `${k} ${v}`).join(' · ')
  cek(!!barisStatus, 'status master terbaca', barisStatus)

  /* riwayat halaman (Data Unit) */
  await page.goto(`${SITE}#/riwayat`, { waitUntil: 'load' })
  await page.waitForTimeout(6000)
  const riwayat = await page.evaluate(() => ({ teks: document.body.innerText.slice(0, 4000), baris: document.querySelectorAll('tbody tr').length }))
  cek(riwayat.baris > 0, 'halaman Riwayat terisi dari sheet', `${riwayat.baris} baris terlihat`)

  /* halaman service */
  await page.goto(`${SITE}#/service`, { waitUntil: 'load' })
  await page.waitForTimeout(8000)
  const svcHal = await page.evaluate(() => ({ teks: document.body.innerText.slice(0, 6000), grafik: document.querySelectorAll('.recharts-surface').length }))
  cek(svcHal.grafik >= 5, 'grafik service tergambar di produksi', `${svcHal.grafik} grafik`)
  cek(!/gagal|error|endpoint belum/i.test(svcHal.teks), 'tidak ada pesan gagal di halaman service')

  cek(err.length === 0, 'tanpa error JavaScript di situs produksi', err.slice(0, 3).join(' | ') || 'bersih')
  /* endpoint boleh berasal dari build (VITE_APPS_SCRIPT_URL) atau dari Pengaturan,
     yang penting data sheet benar-benar tersimpan di perangkat. */
  cek(
    (layar.ls['fsi:history-cache'] || 0) > 10000 && !/endpoint belum diatur/i.test(layar.teks),
    'situs produksi tersambung ke sheet tanpa penyetelan manual',
    `riwayat ${Math.round((layar.ls['fsi:history-cache'] || 0) / 1024)} kB · endpoint LS ${layar.ls['fsi:endpoint'] || 0} B`
  )

  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ deployment asli & situs produksi cocok dengan spreadsheet')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('❌ uji gagal dijalankan:', e.message)
  process.exit(1)
})

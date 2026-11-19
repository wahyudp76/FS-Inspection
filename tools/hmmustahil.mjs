/**
 * hmmustahil.mjs — HM di luar batas wajar (salah ketik digit) harus
 * dilaporkan dan TIDAK dipakai sebagai acuan jadwal service.
 *
 * Kasus nyata di sheet (13 & 19 Nov 2026):
 *   SPC0193 HM 623.031 · SPC0062 382.733 → 394.822 · SPC0117 101.064
 * Angka seperti ini lolos dari deteksi lama karena hanya dinilai dari selisih
 * (naik/turun), bukan dari kewajaran nilainya.
 *
 * Pakai: BASE=http://127.0.0.1:8111 EP=http://127.0.0.1:8111/exec node tools/hmmustahil.mjs
 */
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const BATAS = 60000
const RASIO = 8

const gagal = []
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal.push(nama)
}

/* 1. hitungan bebas dari CSV */
const csv = readFileSync(process.env.CSV || 'data/Monitor_Kasie_FS.csv', 'utf8').trim().split(/\r?\n/)
const kepala = csv[0].split(',').map((h) => h.replace(/^"|"$/g, ''))
const ixHm = kepala.indexOf('HM Service')
const ixKode = kepala.indexOf('Kode Mesin')
const luar = []
const perUnit = new Map()
for (const baris of csv.slice(1)) {
  const kol = baris.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((k) => k.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')) || []
  const hm = Number(String(kol[ixHm] || '').replace(/\./g, '').replace(',', '.'))
  const kode = (kol[ixKode] || '').trim()
  if (!Number.isFinite(hm) || hm <= 0) continue
  if (!perUnit.has(kode)) perUnit.set(kode, [])
  perUnit.get(kode).push(hm)
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const t = s.length >> 1; return s.length % 2 ? s[t] : (s[t - 1] + s[t]) / 2 }
const dasar = (arr) => { const w = arr.filter((h) => h <= BATAS); return median(w.length ? w : arr) }
for (const [kode, arr] of perUnit) {
  const med = dasar(arr)
  for (const hm of arr) if (hm > BATAS && (!med || hm > med * RASIO)) luar.push({ kode, hm })
}
const unikCsv = [...new Set(luar.map((x) => `${x.kode}@${x.hm}`))]

/* 2. yang dilaporkan web (lewat API svcread + pustaka web di halaman Service) */
const panggil = async (action, payload = {}) => {
  const r = await fetch(`${EP}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
    redirect: 'follow',
  })
  return r.json()
}

const svc = await panggil('svcread')
const baris = svc.result?.logRows || []
const luarApi = []
{
  const per = new Map()
  for (const r of baris) {
    const hm = Number(String(r[7] ?? '').replace(/\./g, '').replace(',', '.'))
    const kode = String(r[6] || '').trim()
    if (!Number.isFinite(hm) || hm <= 0) continue
    if (!per.has(kode)) per.set(kode, [])
    per.get(kode).push(hm)
  }
  for (const [kode, arr] of per) {
    const w = arr.filter((h) => h <= BATAS)
    const med = median(w.length ? w : arr)
    for (const hm of arr) if (hm > BATAS && (!med || hm > med * RASIO)) luarApi.push(`${kode}@${hm}`)
  }
}

cek(luarApi.length === luar.length, 'jumlah HM di luar batas wajar: sheet = API', `sheet ${luar.length} · API ${luarApi.length}`)
cek(
  unikCsv.length > 0,
  'contoh kasus nyata terdeteksi dari sheet',
  [...new Set(luarApi)].slice(0, 5).join(', ') || 'tidak ada'
)

/* 3. halaman Service harus memunculkan peringatan & tidak memakai angka itu
      sebagai HM acuan (cek langsung di DOM) */
const { createRequire } = await import('node:module')
const require_ = createRequire(import.meta.url.replace('/tools/', '/tools/'))
const { chromium } = require_('playwright-core')
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta' })
await ctx.addInitScript((ep) => {
  localStorage.clear()
  localStorage.setItem('fsi:endpoint', ep)
}, EP)
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`${BASE}/#/service`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)

/* buka panel kualitas data */
const tombol = page.locator('button', { hasText: /catatan kualitas data/i }).first()
if (await tombol.count()) await tombol.click()
await page.waitForTimeout(600)
const panel = await page.evaluate(() => document.body.innerText)
cek(/HM mustahil/i.test(panel), 'panel kualitas data menyebut temuan “HM mustahil”', (panel.split('\n').find((l) => /HM mustahil/i.test(l)) || '').slice(0, 120))
const angkaContoh = unikCsv.slice(0, 2).map((x) => x.split('@')[0])
const contohPanel = (panel.split('\n').find((l) => /HM mustahil/i.test(l)) || '')
cek(/@/.test(contohPanel), 'panel menyebut contoh unit + nilainya', contohPanel.slice(-70))

/* unit dengan HM mustahil tidak boleh menampilkan HM acuan di atas batas */
const hmBesar = await page.evaluate(([batas, rasio]) => {
  const t = document.body.innerText
  const hasil = []
  for (const baris of t.split('\n')) {
    const m = baris.match(/\bHM\s+([\d.]+)\b/)
    if (m && Number(m[1].replace(/\./g, '')) > batas * rasio) hasil.push(baris.slice(0, 60))
  }
  return hasil
}, [BATAS, RASIO])
cek(hmBesar.length === 0, 'tidak ada HM > batas wajar yang ditampilkan sebagai acuan', hmBesar.slice(0, 3).join(' | '))
cek(errs.length === 0, 'tanpa error JavaScript', errs.slice(0, 2).join(' | '))

await b.close()
console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ HM mustahil dilaporkan & tidak dipakai sebagai acuan jadwal')
process.exit(gagal.length ? 1 : 0)

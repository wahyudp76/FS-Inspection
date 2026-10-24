import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const R = (...p) => path.join(HERE, ...p)
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const seed = JSON.parse(fs.readFileSync(R('seed-cache.json'), 'utf8'))
const recs = seed.records
let fail = 0
const ck = (n, ok, x = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`) }

/* ---- ekspektasi dihitung independen di Node ---- */
const ms = (v) => {
  const s = String(v || '')
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - 7 * 3600000
  const d = Date.parse(s)
  return Number.isNaN(d) ? NaN : d
}
const latest = new Map()
for (const r of recs) {
  const k = `${r.tipe}:${r.kode}`
  const cur = latest.get(k)
  if (!cur || ms(r.timestamp) > ms(cur.timestamp)) latest.set(k, r)
}
const expUnits = latest.size
const expRusak = [...latest.values()].filter((r) => r.kondisi === 'Kritis').length
const sorted = [...recs].sort((a, b) => ms(b.timestamp) - ms(a.timestamp))

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await ctx.addInitScript((d) => { try { localStorage.setItem('fsi:history-cache', d) } catch (e) {} }, JSON.stringify(seed))
const p = await ctx.newPage()
const text = async (sel = 'main') => (await p.locator(sel).innerText()).replace(/\s+/g, ' ')

/* ---- Riwayat: jumlah sesi & urutan ---- */
await p.goto('http://127.0.0.1:8099/#/riwayat', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
let t = await text()
ck('jumlah sesi = 275', t.includes('275'), t.slice(0, 90))

const firstRowKode = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('main tbody tr')]
  const hit = tr.map((r) => r.innerText).find((x) => /[A-Z]{3}\d{4}/.test(x))
  return hit ? hit.slice(0, 60).replace(/\n/g, ' ') : ''
})
ck('baris pertama = record terbaru', firstRowKode.includes(sorted[0].kode), `${firstRowKode} | harap ${sorted[0].kode} ${sorted[0].tanggal}`)

/* ---- filter tipe ---- */
await p.getByRole('button', { name: 'Mesin', exact: true }).first().click()
await p.waitForTimeout(500)
/* mobile memakai kartu: hitung chip tipe di daftar */
const tipeCount = async () => p.evaluate(() => {
  const txt = [...document.querySelectorAll('main .chip, main span')].map((e) => e.textContent.trim())
  return { mesin: txt.filter((x) => x === 'Mesin').length, irr: txt.filter((x) => x === 'Irrigator').length }
})
const cnt = await tipeCount()
ck('filter Mesin menyaring baris', cnt.irr === 0, JSON.stringify(cnt))

/* ---- pager ---- */
await p.getByRole('button', { name: 'Berikutnya', exact: true }).first().click()
await p.waitForTimeout(500)
const page2 = await text()
ck('tombol Berikutnya berpindah halaman', /2 \/ \d+/.test(page2), (page2.match(/\d+ \/ \d+/) || [''])[0])

/* ---- Unit: inspeksi terakhir per unit ---- */
await p.goto('http://127.0.0.1:8099/#/unit', { waitUntil: 'networkidle' })
await p.waitForTimeout(900)
t = await text()
ck(`unit unik = ${expUnits}`, t.includes(String(expUnits)), t.match(/\d+ unit/)?.[0] || '')

const rows = await p.evaluate(() => [...document.querySelectorAll('main tbody tr')].slice(0, 8).map((r) => r.innerText.replace(/\s+/g, ' ')))
let bad = []
for (const row of rows) {
  const m = row.match(/\b([A-Z]{3}\d{4})\b/)
  if (!m) continue
  const kode = m[1]
  const exp = [...latest.values()].find((r) => r.kode === kode)
  if (!exp) continue
  const tglOk = row.includes(exp.tanggal)
  if (!tglOk) bad.push(`${kode}: tabel "${row.slice(-40)}" vs harap ${exp.tanggal}`)
}
ck('tanggal inspeksi terakhir sesuai record terbaru', bad.length === 0, bad.slice(0, 3).join(' | '))

/* ---- Dashboard: KPI konsisten ---- */
await p.goto('http://127.0.0.1:8099/#/dashboard', { waitUntil: 'networkidle' })
await p.waitForTimeout(1000)
t = await text()
ck('KPI total aset = 274', t.includes('274'), '')
ck('KPI kritis/prioritas wajar', !/NaN|undefined|Infinity/.test(t), (/NaN|undefined/.test(t) ? 'ADA NaN/undefined' : 'bersih'))

/* ---- tidak ada duplikat tampil ---- */
const dupCheck = await p.evaluate(() => {
  const ids = [...document.querySelectorAll('main tbody tr, main li')].map((e) => e.innerText).filter((x) => x.length > 10)
  return ids.length - new Set(ids).size
})
ck('tidak ada baris kembar di tabel', dupCheck === 0, `${dupCheck} kembar`)

console.log(fail === 0 ? '\nDATA KONSISTEN' : `\n${fail} MASALAH DATA`)
await b.close()
process.exit(fail ? 1 : 0)

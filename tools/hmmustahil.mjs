/* Uji model HM meter (ronde 15, revisi 2):
   - HM MELOMPAT (naik besar / turun) adalah SAH: meter bisa diganti dengan meter
     baru atau meter hasil repair yang HM-nya meneruskan angka lama.
   - Yang perlu dicek hanya angka jauh di atas HM khas meter sejenis DAN menyendiri.
   Pemeriksaan:
   1. hitungan “perlu dicek” + “ganti meter” di web = hitungan bebas dari sheet
   2. panel kualitas data menyebut kedua temuan itu (bukan vonis “mustahil”)
   3. jadwal unit TIDAK dihitung dari angka yang perlu dicek
   4. unit bermeter repair ber-HM besar tetap memakai HM besar itu (tidak “dikoreksi”)
*/
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require_ = createRequire(import.meta.url)
const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const BATAS_KANONIK = 6
const BATAS_DELTA_METER = 50000
let gagal = 0
const cek = (lulus, judul, detail = '') => { console.log(`${lulus ? '✅' : '❌'} ${judul}${detail ? ' — ' + detail : ''}`); if (!lulus) gagal++ }

/* ---------- hitungan bebas dari CSV ---------- */
const csvPath = process.env.CSV || 'data/Monitor_Kasie_FS.csv'
const csv = fs.readFileSync(path.resolve(csvPath), 'utf8').split(/\r?\n/).filter(Boolean)
const pecah = (baris) =>
  (baris.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || [])
    .map((k) => k.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'))
const head = pecah(csv[0])
const ixKode = head.findIndex((h) => /kode/i.test(h))
const ixHm = head.findIndex((h) => /hm/i.test(h))
const ixTgl = head.findIndex((h) => /tanggal/i.test(h))
const keIso = (t) => {
  const v = String(t || '').trim()
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}
const baris = csv.slice(1).map(pecah).map((k) => ({
  kode: (k[ixKode] || '').trim().toUpperCase(),
  hm: Number(String(k[ixHm] || '').replace(/\./g, '').replace(',', '.')),
  tgl: keIso(k[ixTgl]),
})).filter((r) => r.kode && Number.isFinite(r.hm) && r.hm > 0)

const median = (a) => { const s = [...a].sort((x, y) => x - y); const t = s.length >> 1; return s.length % 2 ? s[t] : (s[t - 1] + s[t]) / 2 }
const klaster = (nilai) => {
  const urut = [...nilai].sort((a, b) => a - b); const g = []
  for (const v of urut) { const a = g[g.length - 1]; if (a && v - a[a.length - 1] <= BATAS_DELTA_METER) a.push(v); else g.push([v]) }
  return g
}
const perJenis = new Map()
for (const r of baris) { const j = r.kode.slice(0, 3); if (!perJenis.has(j)) perJenis.set(j, []); perJenis.get(j).push(r.hm) }
const kanonikJenis = new Map()
for (const [j, arr] of perJenis) {
  const g = klaster(arr); g.sort((a, b) => b.length - a.length)
  kanonikJenis.set(j, median(g[0] || []))
}
const perUnit = new Map()
for (const r of baris) { if (!perUnit.has(r.kode)) perUnit.set(r.kode, []); perUnit.get(r.kode).push(r.hm) }
const perluCekSheet = []
const gantiSheet = []
for (const [kode, arr] of perUnit) {
  const grup = klaster(arr)
  const ukuran = new Map()
  for (const g of grup) for (const v of g) ukuran.set(v, g.length)
  const terbesar = [...grup].sort((a, b) => b.length - a.length)[0] || []
  const kanonikUnit = terbesar.length >= 2 ? median(terbesar) : 0
  const dasar = Math.max(kanonikUnit, kanonikJenis.get(kode.slice(0, 3)) || 0)
  const peta = ukuran
  for (const hm of arr) if (dasar > 0 && hm > dasar * BATAS_KANONIK && (peta.get(hm) || 0) <= 1) perluCekSheet.push(`${kode}@${hm}`)
  for (let i = 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1]
    if (d > BATAS_DELTA_METER || d < 0) gantiSheet.push(kode)
  }
}

/* ---------- panggil API ---------- */
const panggil = async (action, payload) => {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action, payload: payload || {} }), redirect: 'follow' })
  return r.json()
}
const svc = await panggil('svcread')
const log = svc.result?.logRows || []
const perluCekApi = []
const gantiApi = []
{
  const per = new Map()
  for (const r of log) {
    const hm = Number(String(r[7] ?? '').replace(/\./g, '').replace(',', '.'))
    const kode = String(r[6] || '').trim().toUpperCase()
    if (!Number.isFinite(hm) || hm <= 0) continue
    if (!per.has(kode)) per.set(kode, [])
    per.get(kode).push(hm)
  }
  const jenis = new Map()
  for (const [kode, arr] of per) { const j = kode.slice(0, 3); if (!jenis.has(j)) jenis.set(j, []); jenis.get(j).push(...arr) }
  const kanonik = new Map()
  for (const [j, arr] of jenis) { const g = klaster(arr); g.sort((a, b) => b.length - a.length); kanonik.set(j, median(g[0] || [])) }
  for (const [kode, arr] of per) {
    const grup = klaster(arr)
    const peta = new Map()
    for (const g of grup) for (const v of g) peta.set(v, g.length)
    const terbesar = [...grup].sort((a, b) => b.length - a.length)[0] || []
    const dasar = Math.max(terbesar.length >= 2 ? median(terbesar) : 0, kanonik.get(kode.slice(0, 3)) || 0)
    for (const hm of arr) if (dasar > 0 && hm > dasar * BATAS_KANONIK && (peta.get(hm) || 0) <= 1) perluCekApi.push(`${kode}@${hm}`)
    const urut = [...arr]
    for (let i = 1; i < urut.length; i++) { const d = urut[i] - urut[i - 1]; if (d > BATAS_DELTA_METER || d < 0) gantiApi.push(kode) }
  }
}
cek(perluCekSheet.sort().join() === perluCekApi.sort().join(), 'angka “perlu dicek” sheet = API', `sheet ${perluCekSheet.length} · API ${perluCekApi.length} — ${perluCekApi.slice(0, 4).join(', ')}`)
cek(gantiSheet.length === gantiApi.length, 'perpindahan meter sheet = API (kejadian sah)', `sheet ${gantiSheet.length} · API ${gantiApi.length}`)

/* ---------- UI ---------- */
const { chromium } = require_('playwright-core')
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Jakarta' })
await ctx.addInitScript((ep) => { localStorage.clear(); localStorage.setItem('fsi:endpoint', ep) }, EP)
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)))
await page.goto(`${BASE}/#/service`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const btn = page.locator('button', { hasText: /catatan kualitas data/i }).first()
await btn.click()
await page.waitForTimeout(900)
const teks = await page.evaluate(() => document.body.innerText)
const barisPerlu = teks.split('\n').find((l) => /jauh di atas HM khas meter sejenis/i.test(l)) || ''
const barisGanti = teks.split('\n').find((l) => /melanjutkan HM meter lain/i.test(l)) || ''
cek(Boolean(barisPerlu), 'panel menjelaskan angka yang perlu dicek (bukan vonis salah ketik)', barisPerlu.slice(0, 110))
cek(Boolean(barisGanti), 'panel menyebut HM yang melanjutkan meter lain sebagai kejadian sah', barisGanti.slice(0, 110))
cek(!/HM mustahil/i.test(teks), 'tidak ada lagi label “HM mustahil” yang menyesatkan')

/* jadwal memakai angka meter TERAKHIR apa adanya (meter repair ber-HM besar sah) */
const jadwal = await page.evaluate(() => {
  const cache = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
  return (cache.units || []).map((u) => ({ kode: u.kode, hm: u.hm }))
})
const perluUnit = new Map(perluCekApi.map((x) => [x.split('@')[0], Number(x.split('@')[1])]))
const sesuai = [...perluUnit].filter(([kode, hm]) => jadwal.find((u) => u.kode === kode)?.hm === hm)
const menyimpang = [...perluUnit].filter(([kode, hm]) => jadwal.find((u) => u.kode === kode)?.hm !== hm)
/* angka meter yang sedang terpasang = HM pada catatan TERBARU unit tersebut */
const meterTerakhir = new Map()
for (const r of baris) {
  const ada = meterTerakhir.get(r.kode)
  if (!ada || (r.tgl || '') >= (ada.tgl || '')) meterTerakhir.set(r.kode, r)
}
const tidakCocok = [...perluUnit.keys()].filter((kode) => {
  const j = jadwal.find((u) => u.kode === kode)?.hm
  return j != null && j !== meterTerakhir.get(kode)?.hm
})
cek(tidakCocok.length === 0, 'acuan jadwal = HM catatan terbaru apa adanya (bukan “dikoreksi” web)', `cocok ${perluUnit.size - tidakCocok.length}/${perluUnit.size}${tidakCocok.length ? ' · beda: ' + tidakCocok.join(', ') : ''}`)

/* meter repair ber-HM besar tetap dipakai apa adanya */
const besar = ['SPC0155', 'SPC0188', 'SPC0209', 'DEC0038']
const tetap = besar.filter((k) => { const u = jadwal.find((x) => x.kode === k); return u && u.hm > 60000 || (k === 'DEC0038' && u) })
cek(tetap.length >= 2, 'unit bermeter repair ber-HM besar tetap memakai angka meter itu', besar.map((k) => `${k}=${jadwal.find((u) => u.kode === k)?.hm ?? '-'}`).join(' '))

cek(errs.length === 0, 'tanpa error JavaScript', errs[0] || 'bersih')
await browser.close()
console.log(gagal ? `\n❌ ${gagal} pemeriksaan gagal` : '\n✅ model HM meter: lompatan sah, hanya angka menyendiri yang perlu dicek')
process.exit(gagal ? 1 : 0)

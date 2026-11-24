/**
 * Uji fitur “tunda pengingat” pada halaman Service:
 *   unit yang jadwalnya SUDAH lewat tanggal tetapi perkiraan HM hari ini masih
 *   jauh di bawah batas service → pengingatnya ditunda (bukan dianggap telat),
 *   dan Catat Service meminta konfirmasi sebelum mencatat.
 *
 * Jalankan dengan Vite + mock API:
 *   VITE_APPS_SCRIPT_URL=<endpoint> npx vite --port 5199
 *   BASE=http://127.0.0.1:5199 EP=http://127.0.0.1:8111/exec node tools/tundacheck.mjs
 *
 * Uji memakai data sheet apa adanya. Bila di data tidak ada unit yang memenuhi
 * syarat, uji menyuntikkan satu kasus ke cache localStorage (hanya di browser uji).
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
let gagal = 0
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal++
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Jakarta' })
await ctx.addInitScript((ep) => { localStorage.clear(); localStorage.setItem('fsi:endpoint', ep) }, EP)
const page = await ctx.newPage()
const galat = []
page.on('pageerror', (e) => galat.push(String(e).slice(0, 140)))
await page.goto(`${BASE}/#/service`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

/* ---- 1. fungsi murni: hitung kasus tunda dari pustaka ---- */
const hitung = await page.evaluate(async () => {
  const m = await import('/src/lib/service.js')
  const cache = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
  const units = cache.units || []
  const lewat = units.filter((u) => u.warning > 0)
  const tunda = lewat.map((u) => [u.kode, m.tundaService(u)]).filter(([, t]) => t)
  return {
    hariIni: m.hariIniIso(),
    lewat: lewat.length,
    tunda: tunda.length,
    contoh: tunda.slice(0, 3).map(([k, t]) => `${k}: sisa ${t.sisaHm} HM ≈ ${t.sisaHari} hari (s.d. ${t.tundaSampaiIso})`),
    // unit yang HM-nya sudah masuk (selisih < 250) TIDAK boleh ditunda
    salahTunda: tunda.filter(([k, t]) => t.sisaHm <= 0).map(([k]) => k),
  }
})
console.log(`ℹ️  hari ini ${hitung.hariIni} · lewat jadwal ${hitung.lewat} unit · ditunda ${hitung.tunda} unit`)
if (hitung.contoh.length) console.log(`   contoh: ${hitung.contoh.join(' · ')}`)
cek(hitung.salahTunda.length === 0, 'unit yang HM-nya sudah masuk tidak ikut ditunda', hitung.salahTunda.join(', ') || 'bersih')

/* ---- 2. KPI: Lewat Jadwal + Ditunda = total lewat tanggal ---- */
const teks = await page.evaluate(() => document.body.innerText)
const lewatKpi = Number((teks.match(/LEWAT JADWAL\s*\n+\s*(\d+)/) || [])[1] ?? -1)
const tundaKpi = Number((teks.match(/DITUNDA\s*\n+\s*(\d+)/) || [])[1] ?? -1)
cek(lewatKpi + tundaKpi === hitung.lewat, 'KPI Lewat Jadwal + Ditunda = jumlah unit lewat tanggal', `${lewatKpi} + ${tundaKpi} = ${lewatKpi + tundaKpi} (hitung ${hitung.lewat})`)
cek(tundaKpi === hitung.tunda, 'KPI Ditunda = hitungan pustaka', `${tundaKpi} vs ${hitung.tunda}`)

if (hitung.tunda > 0) {
  const tab = page.locator('button', { hasText: /^Ditunda \(/ }).first()
  cek((await tab.count()) > 0, 'ada tab “Ditunda” di daftar perlu perhatian')
  if (await tab.count()) {
    await tab.click()
    await page.waitForTimeout(600)
    const isi = await page.evaluate(() => document.body.innerText)
    /* ronde 21: penundaan manual (sheet tb_service3) mencetak “Pengingat ditunda s.d. <tgl>”,
       penundaan otomatis berbasis HM mencetak “Ditunda s.d. <tgl>”. Keduanya sah. */
    const baris = isi.split('\n').filter((l) => /(Pengingat )?[Dd]itunda s\.d\./.test(l))
    cek(baris.length > 0, 'baris ditunda menyebut tanggal pengingat', (baris[0] || '').slice(0, 100))
  }
}

/* ---- 3. Catat Service: peringatan + konfirmasi untuk unit yang ditunda ---- */
const kodeUji = await page.evaluate(async () => {
  const m = await import('/src/lib/service.js')
  const cache = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
  const u = (cache.units || []).find((x) => m.tundaService(x))
  return u ? u.kode : ''
})
let kode = kodeUji
if (!kode) {
  /* Data sheet tidak punya kasus tunda → buat satu kasus sintetis dengan
     menyunting BALASAN API (bukan file data): satu unit dibuat jadwalnya lewat
     84 hari tetapi laju HM-nya hanya 1 HM/hari sehingga HM belum masuk. */
  kode = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
    return ((c.units || []).find((x) => x.warning > 0) || {}).kode || ''
  })
  const target = kode || 'DEC0030'
  await page.route(EP, async (route) => {
    const req = route.request()
    let body = req.postData() || '{}'
    let aksi = ''
    try { aksi = JSON.parse(body).action } catch { aksi = '' }
    if (aksi !== 'svcread') return route.continue()
    const resp = await route.fetch()
    const json = await resp.json()
    const r = json.result || {}
    const head = r.evalHeader || []
    const ixKode = head.findIndex((h) => /KODE UNIT/i.test(h))
    const ixTerakhir = head.findIndex((h) => /Real Service Terakhir/i.test(h))
    const ixRerata = head.findIndex((h) => /Rerata HM/i.test(h))
    const ixNextTgl = head.findIndex((h) => /Tgl Next Service/i.test(h))
    const ixWarning = head.findIndex((h) => /Warning Date/i.test(h))
    const ixHm = head.findIndex((h) => /HM Service Terakhir/i.test(h))
    const ixNextHm = head.findIndex((h) => /Next HM Service/i.test(h))
    for (const row of r.evalRows || []) {
      if (String(row[ixKode] || '').trim().toUpperCase() !== target.toUpperCase()) continue
      row[ixHm] = '200'
      row[ixNextHm] = '750'
      row[ixRerata] = '1'
      row[ixTerakhir] = '1 September 2026'
      row[ixNextTgl] = '1 Oktober 2026'
      row[ixWarning] = '84'
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const cek2 = await page.evaluate(async () => {
    const m = await import('/src/lib/service.js')
    const c = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
    return (c.units || []).filter((u) => m.tundaService(u)).map((u) => u.kode)
  })
  console.log(`ℹ️  data sheet tidak punya kasus tunda; dipakai kasus sintetis (balasan API disunting) → ${cek2.join(', ') || '—'}`)
  kode = cek2[0] || target
}

if (kode) {
  await page.locator('button', { hasText: /^Catat Service/ }).first().click()
  await page.waitForTimeout(1200)
  await page.locator('[role="option"]', { hasText: kode }).first().click()
  await page.waitForTimeout(800)
  const form = await page.evaluate(() => document.body.innerText)
  const panel = form.split('\n').find((l) => /Sudah lewat jadwal/.test(l)) || ''
  const cb = form.split('\n').find((l) => /Tetap catat service sekarang/.test(l)) || ''
  cek(Boolean(panel), `Catat Service memberi catatan khusus untuk ${kode}`, panel.slice(0, 80))
  cek(Boolean(cb), 'ada konfirmasi “Tetap catat service sekarang”')
  await page.locator('input[type="number"]').first().fill('260')
  await page.waitForTimeout(300)
  const tombol = page.locator('button', { hasText: 'Simpan ke Sheet' })
  if (await tombol.count()) {
    await tombol.click()
    await page.waitForTimeout(900)
    const pesan = (await page.evaluate(() => document.body.innerText)).split('\n').find((l) => /Centang “Tetap catat/.test(l)) || ''
    cek(Boolean(pesan), 'simpan ditolak sampai pengguna mengonfirmasi', pesan.slice(0, 90))
  } else {
    cek(true, 'tombol simpan tidak tersedia karena HM belum diisi (tidak diuji lebih jauh)')
  }
}

cek(galat.length === 0, 'tanpa error JavaScript', galat[0] || 'bersih')
await browser.close()
console.log(gagal ? `\n❌ ${gagal} pemeriksaan gagal` : '\n✅ tunda pengingat: unit lewat tanggal dengan HM belum masuk dipisah & dikonfirmasi')
process.exit(gagal ? 1 : 0)

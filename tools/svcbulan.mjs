import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('/home/user/tools/node_modules/playwright-core')
const CHROME = process.env.CHROME || process.env.HOME + '/.cache/ms-playwright/chromium-1117/chrome-linux/chrome'
const BASE = process.env.BASE || 'http://127.0.0.1:8099'
const EP = process.env.EP || 'http://127.0.0.1:8112/exec'
const FX = JSON.parse(fs.readFileSync(process.env.SVC_FIXTURE || new URL('./svc-fixture.json', import.meta.url).pathname, 'utf8'))

/* ---------- hitung ekspektasi langsung dari fixture (acuan Oktober 2026) ---------- */
const key = (iso) => (iso || '').slice(0, 7)
const prevKey = (k) => { const [y, m] = k.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}` }
const nextKey = (k) => { const [y, m] = k.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

/* fixture tb_service2 memakai format DD/MM/YYYY */
const keIso = (v) => {
  const s = String(v || '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) { const i = BULAN.findIndex((b) => b.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3))); if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return ''
}

const s1 = FX.evalRows, s2 = FX.logRows
const logByUnit = new Map()
for (const r of s2) {
  const kode = String(r[6] || '').trim().toUpperCase()
  const iso = keIso(r[2])
  if (!kode || !iso) continue
  const arr = logByUnit.get(kode) || []
  arr.push(iso)
  logByUnit.set(kode, arr)
}
function hitung(acuan) {
  const K = acuan, L = prevKey(acuan), D = nextKey(acuan)
  const out = { servisIni: 0, servisLalu: 0, jadwalIni: 0, jadwalDepan: 0, lain: 0 }
  const sudah = new Set()
  for (const r of s1) {
    const kode = String(r[1] || '').trim().toUpperCase()
    if (!kode || sudah.has(kode)) continue /* aplikasi memakai 1 baris per kode */
    sudah.add(kode)
    const terakhir = String(r[4] || '')
    const belum = !terakhir || /belum/i.test(terakhir)
    const arr = logByUnit.get(kode) || []
    const ini = arr.filter((x) => key(x) === K).length
    const lalu = arr.filter((x) => key(x) === L).length
    const nKey = key(keIso(r[7]))
    const jIni = !belum && nKey === K
    const jDepan = !belum && nKey === D
    if (ini) out.servisIni++
    else if (lalu) out.servisLalu++
    else if (jIni) out.jadwalIni++
    else if (jDepan) out.jadwalDepan++
    else out.lain++
  }
  return out
}
/* hitungan non-eksklusif: unit dengan next service di bulan tersebut (bukan 'belum service') */
function hitungJadwal(acuan) {
  const K = acuan
  const seen = new Set()
  let n = 0
  let belumKerja = 0
  for (const r of s1) {
    const kode = String(r[1] || '').trim().toUpperCase()
    if (!kode || seen.has(kode)) continue
    seen.add(kode)
    const belum = !String(r[4] || '').trim() || /belum/i.test(String(r[4] || ''))
    if (belum) continue
    if (key(keIso(r[7])) !== K) continue
    n++
    const arr = logByUnit.get(kode) || []
    if (!arr.some((x) => key(x) === acuan)) belumKerja++
  }
  return { n, belumKerja }
}
const jadwalOkt = hitungJadwal('2026-10')
const jadwalNov = hitungJadwal('2026-11')
const expOkt = hitung('2026-10')
const expSep = hitung('2026-09')
const jadwalSep = hitungJadwal('2026-09')
const sesiOkt = s2.filter((r) => key(keIso(r[2])) === '2026-10').length
const sesiSep = s2.filter((r) => key(keIso(r[2])) === '2026-09').length
const unitUnik = new Set(s1.map((r) => String(r[1] || '').trim().toUpperCase()).filter(Boolean)).size
console.log('unit unik tb_service1:', unitUnik, '· baris:', s1.length, '· duplikat:', s1.length - unitUnik)
console.log('jadwal (non-eksklusif) — Sep:', JSON.stringify(jadwalSep), 'Okt:', JSON.stringify(jadwalOkt), 'Nov:', JSON.stringify(jadwalNov))
console.log('ekspektasi fixture → Okt:', JSON.stringify(expOkt), `(${sesiOkt} sesi) | Sep:`, JSON.stringify(expSep), `(${sesiSep} sesi)`)

const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
const hasil = []
const cek = (n, ok, info = '') => hasil.push(`${ok ? 'LULUS' : 'GAGAL'} ${n}${info ? ' — ' + info : ''}`)

for (const vp of [{ w: 390, h: 844, n: 'HP' }, { w: 1440, h: 950, n: 'Desktop' }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700, hasTouch: vp.w < 700 })
  await ctx.addInitScript((ep) => { try { localStorage.setItem('fsi:endpoint', ep) } catch (e) {} }, EP)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)) })
  await p.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(2600)

  /* 1. filter bulan ada & default bulan berjalan (Oktober 2026) */
  const sel = await p.evaluate(() => {
    const s = document.querySelector('#bulan-acuan')
    return s ? { ada: true, nilai: s.value, teks: s.options[s.selectedIndex]?.textContent?.trim(), jumlahOpsi: s.options.length } : { ada: false }
  })
  cek(`[${vp.n}] filter bulan tersedia & default bulan ini`, sel.ada && sel.nilai === '2026-10', JSON.stringify(sel))

  /* 2. angka kartu aktivitas = hasil hitungan fixture */
  const kartu = await p.evaluate(() => {
    const t = document.body.innerText
    const grab = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/\./g, '')) : null }
    return {
      judul: (t.match(/Aktivitas Bulan ([A-Za-z]+ \d{4})/) || [])[1] || null,
      lalu: grab(/service september 2026\s*\n?\s*([\d.]+)/i),
      ini: grab(/service oktober 2026\s*\n?\s*([\d.]+)/i),
      jadwalIni: grab(/jadwal oktober 2026\s*\n?\s*([\d.]+)/i),
      depan: grab(/jadwal november 2026\s*\n?\s*([\d.]+)/i),
    }
  })
  cek(`[${vp.n}] kartu aktivitas Oktober tampil`, kartu.judul === 'Oktober 2026', JSON.stringify(kartu))
  cek(
    `[${vp.n}] angka kartu sesuai perhitungan sheet`,
    kartu.lalu === expOkt.servisLalu && kartu.ini === expOkt.servisIni && kartu.jadwalIni === jadwalOkt.n && kartu.depan === jadwalNov.n,
    `UI ${JSON.stringify({ lalu: kartu.lalu, ini: kartu.ini, jadwalIni: kartu.jadwalIni, depan: kartu.depan })} vs exp ${JSON.stringify(expOkt)}`
  )

  /* 3. klik kartu "Service September" → tabel tersaring sebanyak angka itu */
  await p.locator('button[title*="service september"]').first().click().catch(async () => {
    await p.locator('button:has-text("Service September 2026")').first().click()
  })
  await p.waitForTimeout(700)
  const tersaring = await p.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/Evaluasi Service Engine\s*\n([\d.]+) dari ([\d.]+) engine/)
    return { baris: m ? Number(m[1].replace(/\./g, '')) : null, total: m ? Number(m[2].replace(/\./g, '')) : null, chip: /Filter: Service bulan lalu/.test(t) }
  })
  cek(`[${vp.n}] klik kartu menyaring tabel (${expOkt.servisLalu} engine)`, tersaring.baris === expOkt.servisLalu && tersaring.chip, JSON.stringify(tersaring))

  /* 4. baris tabel punya kolom/badge aktivitas */
  const badge = await p.evaluate(() => {
    const t = document.body.innerText
    return { servisSep: (t.match(/Servis Sep/g) || []).length, servisOkt: (t.match(/Servis Okt/g) || []).length, jadwalNov: (t.match(/Jadwal Nov/g) || []).length }
  })
  /* 4b. klik tile jadwal bulan ini → tersaring sebanyak hitungan jadwal */
  await p.locator('button[title*="jadwal"]').first().click()
  await p.waitForTimeout(700)
  const tersaringJadwal = await p.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/Evaluasi Service Engine\s*\n([\d.]+) dari ([\d.]+) engine/)
    return { baris: m ? Number(m[1].replace(/\./g, '')) : null, chip: /Filter:\s*Jadwal/i.test(t) }
  })
  cek(`[${vp.n}] tile jadwal menyaring tabel (${jadwalOkt.n} engine)`, tersaringJadwal.baris === jadwalOkt.n && tersaringJadwal.chip, JSON.stringify(tersaringJadwal))
  await p.locator('button[title*="jadwal"]').first().click()
  await p.waitForTimeout(500)

  cek(`[${vp.n}] label aktivitas muncul di daftar`, badge.servisSep > 0, JSON.stringify(badge))

  /* 5. reset filter + ganti bulan ke September → angka berubah sesuai hitungan */
  await p.locator('button:has-text("Filter: Service bulan lalu")').first().click().catch(() => {})
  await p.selectOption('#bulan-acuan', '2026-09')
  await p.waitForTimeout(800)
  const kartuSep = await p.evaluate(() => {
    const t = document.body.innerText
    const grab = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/\./g, '')) : null }
    return {
      judul: (t.match(/Aktivitas Bulan ([A-Za-z]+ \d{4})/) || [])[1] || null,
      lalu: grab(/service agustus 2026\s*\n?\s*([\d.]+)/i),
      ini: grab(/service september 2026\s*\n?\s*([\d.]+)/i),
      jadwalIni: grab(/jadwal september 2026\s*\n?\s*([\d.]+)/i),
      depan: grab(/jadwal oktober 2026\s*\n?\s*([\d.]+)/i),
    }
  })
  cek(
    `[${vp.n}] ganti bulan ke September menghitung ulang`,
    kartuSep.judul === 'September 2026' && kartuSep.lalu === expSep.servisLalu && kartuSep.ini === expSep.servisIni && kartuSep.jadwalIni === jadwalSep.n && kartuSep.depan === jadwalOkt.n,
    `${JSON.stringify(kartuSep)} vs exp ${JSON.stringify(expSep)}`
  )

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await p.screenshot({ path: `/home/user/tools/svc-bulan-${vp.n}.png` })
  await ctx.close()
}
console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

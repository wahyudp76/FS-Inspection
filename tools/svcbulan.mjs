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
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  /* tahun 2 digit (ketik manual di sheet): "17/09/26" → 2026-09-17 */
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/)
  if (m) {
    const yy = Number(m[3])
    const y = yy >= 70 ? 1900 + yy : 2000 + yy
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (m) { const i = BULAN.findIndex((b) => b.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3))); if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return ''
}

/* sumber ekspektasi = data yang benar-benar disajikan mock API (fallback: file fixture) */
let SRC = { evalRows: FX.evalRows, logRows: FX.logRows }
try {
  const r = await fetch(EP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'svcread' }),
  })
  const j = await r.json()
  if (j?.ok && j.result?.logRows?.length) SRC = { evalRows: j.result.evalRows, logRows: j.result.logRows }
  console.log(`sumber ekspektasi: API mock — ${SRC.evalRows.length} baris eval, ${SRC.logRows.length} pencatatan`)
} catch (e) {
  console.log(`sumber ekspektasi: file fixture — ${FX.evalRows.length} baris eval, ${FX.logRows.length} pencatatan`)
}
const s1 = SRC.evalRows, s2 = SRC.logRows
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


/* ================= ekspektasi grafik “kondisi per bulan” ================= */
const pad2 = (n) => String(n).padStart(2, '0')
const hariIni = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` })()
const akhirBulan = (k) => { const [y, m] = k.split('-').map(Number); return `${y}-${pad2(m)}-${pad2(new Date(y, m, 0).getDate())}` }
const refBulan = (k) => { const a = akhirBulan(k); return hariIni < a ? hariIni : a }
const tambahHari = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const angka = (v) => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null }

/* satu baris per kode: HM terbesar (sama seperti aplikasi) */
const sheet = new Map()
for (const r of s1) {
  const kode = String(r[1] || '').trim().toUpperCase()
  if (!kode) continue
  const hm = angka(r[5])
  const ada = sheet.get(kode)
  const lebihBaru =
    !ada ||
    (hm ?? -1) > (angka(ada[5]) ?? -1) ||
    ((hm ?? -1) === (angka(ada[5]) ?? -1) && keIso(r[4]) > keIso(ada[4]))
  if (lebihBaru) sheet.set(kode, r)
}

/* semua baris log + selisih HM kronologis (untuk ketepatan interval) */
const logAll = s2
  .map((r) => ({ kode: String(r[6] || '').trim().toUpperCase(), iso: keIso(r[2]), hm: angka(r[7]) }))
  .filter((r) => r.kode && r.iso)
const logAsc = [...logAll].sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))
const prevHm = new Map()
for (const r of logAsc) {
  const p0 = prevHm.get(r.kode)
  r.delta = p0 != null && r.hm != null ? r.hm - p0 : null
  if (r.hm != null) prevHm.set(r.kode, r.hm)
}

/** status semua engine “per refIso” — reimplementasi independen */
function statusAsOf(refIso) {
  const last = new Map()
  for (const r of logAll) {
    if (r.iso > refIso) continue
    const ada = last.get(r.kode)
    if (!ada || r.iso > ada.iso) last.set(r.kode, r)
  }
  const out = { terlambat: 0, segera: 0, aman: 0, tanpaJadwal: 0, belum: 0 }
  const detail = []
  for (const [kode, row] of sheet) {
    const L = last.get(kode)
    if (!L) { out.belum += 1; continue }
    const rerata = angka(row[6])
    let nextIso = ''
    if (L.iso === keIso(row[4])) nextIso = keIso(row[7])
    else if (rerata > 0) nextIso = tambahHari(L.iso, Math.ceil(250 / rerata))
    if (!nextIso || !(rerata > 0)) { out.tanpaJadwal += 1; continue }
    const warning = Math.round((new Date(refIso + 'T00:00:00Z') - new Date(nextIso + 'T00:00:00Z')) / 86400000)
    if (warning > 0) out.terlambat += 1
    else if (warning >= -7) out.segera += 1
    else out.aman += 1
    detail.push({ kode, warning })
  }
  detail.sort((a, b) => b.warning - a.warning)
  const top10 = detail.slice(0, 10)
  return { ...out, total: sheet.size, top: top10.map((d) => d.kode), topTelat: top10[0]?.warning ?? null }
}

function ketepatanBulan(acuan) {
  const rows = logAll.filter((r) => key(r.iso) === acuan && r.delta != null && r.delta >= 0 && r.delta <= 1000)
  const tepat = rows.filter((r) => r.delta >= 225 && r.delta <= 275).length
  const telat = rows.filter((r) => r.delta > 275).length
  const awal = rows.filter((r) => r.delta < 225).length
  return { dinilai: rows.length, tepat, telat, awal, pct: rows.length ? Math.round((tepat / rows.length) * 100) : 0 }
}

const asofOkt = statusAsOf(refBulan('2026-10'))
const asofSep = statusAsOf(refBulan('2026-09'))
const ketOkt = ketepatanBulan('2026-10')
const ketSep = ketepatanBulan('2026-09')
console.log('as-of Okt:', JSON.stringify(asofOkt), '\nas-of Sep:', JSON.stringify(asofSep))
console.log('ketepatan Okt:', JSON.stringify(ketOkt), '| Sep:', JSON.stringify(ketSep))

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

  /* ---------- pembaca grafik (dipakai sebelum & sesudah ganti bulan) ---------- */
  const bacaGrafik = () =>
    p.evaluate(() => {
      const t = document.body.innerText
      const num = (re) => { const m = t.match(re); return m ? Number(String(m[1]).replace(/\./g, '')) : null }
      const kartuTop = [...document.querySelectorAll('div')]
        .filter((d) => d.textContent.includes('10 Paling Terlambat') && /[A-Z]{3}\d{3,4}/.test(d.textContent))
        .sort((a, b) => a.textContent.length - b.textContent.length)[0]
      const pasangan = kartuTop ? [...kartuTop.innerText.matchAll(/([A-Z]{3}\d{3,4})\s+(\d+)h/g)].map((m) => ({ kode: m[1], telat: Number(m[2]) })) : []
      const m = t.match(/Evaluasi Service Engine\s*\n([\d.]+) dari ([\d.]+) engine/)
      return {
        ref: ((t.match(/Komposisi Status\s*\nKondisi per ([^\n(]+)/) || [])[1] || '').trim() || null,
        ketSub: ((t.match(/Ringkasan Ketepatan Interval\s*\n([^\n]+)/) || [])[1] || '').trim() || null,
        petaSub: ((t.match(/Peta Minggu Service\s*\n([^\n]+)/) || [])[1] || '').trim() || null,
        lewat: num(/Lewat jadwal\s+([\d.]+)\s+\d+%/i),
        tempo: num(/Jatuh tempo\s+([\d.]+)\s+\d+%/i),
        aman: num(/Aman\s+([\d.]+)\s+\d+%/i),
        hmKurang: num(/Data HM kurang\s+([\d.]+)\s+\d+%/i),
        belum: num(/Belum pernah service\s+([\d.]+)\s+\d+%/i),
        tepat: num(/Tepat 225–275 HM\s+([\d.]+)/),
        telat: num(/Terlambat > 275 HM\s+([\d.]+)/),
        awal: num(/Lebih awal < 225 HM\s+([\d.]+)/),
        peta: ((t.match(/Peta Minggu Service\s*\n[^\n]*?·\s*([\d.]+) pencatatan/) || [])[1] || null),
        topKode: pasangan.length ? pasangan[pasangan.length - 1].kode : null,
        topSet: pasangan.map((x) => x.kode).sort().join(','),
        topMax: pasangan.length ? Math.max(...pasangan.map((x) => x.telat)) : null,
        tabel: m ? `${m[1]} dari ${m[2]}` : null,
        kpiLewat: num(/LEWAT JADWAL\s+([\d.]+)\s+unit/),
        kpiBelum: num(/BELUM SERVICE\s+([\d.]+)\s+unit/),
      }
    })

  /* 5. reset filter + ganti bulan ke September → angka berubah sesuai hitungan */
  await p.locator('button:has-text("Filter: Service bulan lalu")').first().click().catch(() => {})
  await p.waitForTimeout(400)
  const grafikOkt = await bacaGrafik()
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

  /* 6. grafik “kondisi per bulan” ikut bulan acuan */
  const grafikSep = await bacaGrafik().catch(() => ({}))
  const totalSep = (grafikSep.lewat || 0) + (grafikSep.tempo || 0) + (grafikSep.aman || 0) + (grafikSep.hmKurang || 0) + (grafikSep.belum || 0)
  cek(
    `[${vp.n}] komposisi status ikut bulan (Sep: lewat ${asofSep.terlambat} / tempo ${asofSep.segera} / aman ${asofSep.aman} / belum ${asofSep.belum})`,
    grafikSep.lewat === asofSep.terlambat && grafikSep.tempo === asofSep.segera && grafikSep.aman === asofSep.aman &&
      grafikSep.hmKurang === asofSep.tanpaJadwal && grafikSep.belum === asofSep.belum && totalSep === asofSep.total,
    JSON.stringify({ ui: grafikSep, exp: asofSep, totalSep })
  )
  cek(
    `[${vp.n}] label periode komposisi = 30 Sep 2026`,
    /30 Sep 2026/.test(grafikSep.ref || ''),
    String(grafikSep.ref)
  )
  cek(
    `[${vp.n}] cakupan per divisi & sebaran urgensi ikut bulan`,
    grafikOkt.lewat !== grafikSep.lewat && grafikOkt.aman !== grafikSep.aman && totalSep === 127,
    `Okt lewat ${grafikOkt.lewat}/aman ${grafikOkt.aman} vs Sep lewat ${grafikSep.lewat}/aman ${grafikSep.aman}`
  )
  cek(
    `[${vp.n}] top 10 terlambat ikut bulan (${asofSep.top.length} engine, maks ${asofSep.topTelat})`,
    grafikSep.topMax === asofSep.topTelat &&
      grafikSep.topSet.split(',').filter(Boolean).every((k) => asofSep.top.includes(k)) &&
      grafikSep.topMax !== grafikOkt.topMax,
    `Sep ${grafikSep.topMax}h/${grafikSep.topKode} · Okt ${grafikOkt.topMax}h/${grafikOkt.topKode} vs exp ${asofSep.topTelat}h`
  )
  cek(
    `[${vp.n}] ringkasan ketepatan ikut bulan (Sep: tepat ${ketSep.tepat} / telat ${ketSep.telat} / awal ${ketSep.awal})`,
    grafikSep.tepat === ketSep.tepat && grafikSep.telat === ketSep.telat && grafikSep.awal === ketSep.awal &&
      new RegExp(`September 2026`).test(grafikSep.ketSub || ''),
    JSON.stringify({ ui: { tepat: grafikSep.tepat, telat: grafikSep.telat, awal: grafikSep.awal, sub: grafikSep.ketSub }, exp: ketSep })
  )
  cek(
    `[${vp.n}] peta minggu service ikut bulan (Sep: ${sesiSep} pencatatan)`,
    Number(grafikSep.peta) === sesiSep && /September 2026/.test(grafikSep.petaSub || '') && Number(grafikOkt.peta) === sesiOkt,
    `Sep ${grafikSep.peta} vs ${sesiSep} · Okt ${grafikOkt.peta} vs ${sesiOkt}`
  )
  cek(
    `[${vp.n}] tren service engine & KPI tidak terpengaruh bulan`,
    grafikSep.tabel === grafikOkt.tabel && grafikSep.kpiLewat === grafikOkt.kpiLewat && grafikSep.kpiBelum === grafikOkt.kpiBelum,
    `tabel ${grafikOkt.tabel} → ${grafikSep.tabel} · KPI lewat ${grafikOkt.kpiLewat} → ${grafikSep.kpiLewat}`
  )

  cek(`[${vp.n}] tanpa error JS`, errs.length === 0, errs.slice(0, 2).join(' | '))
  await p.screenshot({ path: `/home/user/tools/svc-bulan-${vp.n}.png` })
  await ctx.close()
}
console.log(hasil.join('\n'))
console.log('\n' + (hasil.every((l) => l.startsWith('LULUS')) ? 'SEMUA LULUS' : 'ADA YANG GAGAL'))
await b.close()

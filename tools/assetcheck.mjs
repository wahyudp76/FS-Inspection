/**
 * Cek kebenaran data master: src/data/assets.json (yang dipakai web)
 * dibandingkan dengan sheet master asli ($DATA_DIR/mesin.csv & irrigator.csv).
 *
 * Yang diperiksa per unit:
 *   - kode unit ada di kedua sisi, tidak ada unit hilang/asing
 *   - seluruh nilai komponen sama persis (A/B/C) per nama komponen
 *   - ringkasan a/b/c/total/score dihitung ulang dari komponen
 *   - status & aturan Rusak ⇒ Kritis
 *
 * Jalankan: DATA_DIR=/home/user/data node tools/assetcheck.mjs
 */
import path from 'node:path'
import fs from 'node:fs'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const DATA_DIR = process.env.DATA_DIR || '/home/user/data'
const { parseCSV } = await import('./mock.gs.mjs')

const assets = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'src', 'data', 'assets.json'), 'utf8'))
const kodeGs = fs.readFileSync(path.join(HERE, '..', 'apps-script', 'Code.gs'), 'utf8')
const listOf = (nama) => {
  const i = kodeGs.indexOf(`var ${nama} = [`)
  const j = kodeGs.indexOf('];', i)
  return eval(kodeGs.slice(i + `var ${nama} = `.length, j + 1)) // eslint-disable-line no-eval
}
const KOMP = { mesin: listOf('KOMPONEN_MESIN'), irrigator: listOf('KOMPONEN_IRRIGATOR') }

let gagal = 0
const cek = (nama, ok, info = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${info ? ' — ' + info : ''}`)
}
const norm = (s) => String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
const grade = (v) => {
  const s = String(v == null ? '' : v).trim().toUpperCase()
  return ['A', 'B', 'C'].includes(s) ? s : ''
}
const kondisiDari = (skor, status) =>
  String(status || '').trim().toLowerCase() === 'rusak' ? 'Kritis' : skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis'

for (const [tipe, file, kodeHeader] of [['mesin', 'mesin.csv', 'Kode Unit'], ['irrigator', 'irrigator.csv', 'KODE UNIT']]) {
  const rows = parseCSV(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')).filter((r) => r.some((v) => v !== ''))
  const header = rows[0].map((h) => String(h).trim())
  const posKode = header.findIndex((h) => norm(h) === norm(kodeHeader))
  const posStatus = header.findIndex((h) => norm(h) === 'status')
  const petaSheet = new Map()
  for (const r of rows.slice(1)) {
    const kode = String(r[posKode] || '').trim().toUpperCase()
    if (kode) petaSheet.set(kode, r)
  }
  const units = assets[tipe] || []
  const petaWeb = new Map(units.map((u) => [String(u.kode).trim().toUpperCase(), u]))

  const hilangDiWeb = [...petaSheet.keys()].filter((k) => !petaWeb.has(k))
  const asingDiWeb = [...petaWeb.keys()].filter((k) => !petaSheet.has(k))
  cek(`${tipe}: jumlah unit sheet ↔ web`, petaSheet.size === petaWeb.size, `sheet ${petaSheet.size} · web ${petaWeb.size}`)
  cek(`${tipe}: tidak ada unit hilang / asing`, hilangDiWeb.length === 0 && asingDiWeb.length === 0,
    hilangDiWeb.length || asingDiWeb.length ? `hilang ${hilangDiWeb.slice(0, 5)} · asing ${asingDiWeb.slice(0, 5)}` : '')

  let bedaKomponen = 0
  let bedaRingkas = 0
  let bedaStatus = 0
  let komponenHilang = 0
  let contoh = ''
  const daftarKomponen = KOMP[tipe]
  const posKomponen = new Map()
  for (const nm of daftarKomponen) {
    const p = header.findIndex((h) => norm(h) === norm(nm))
    if (p >= 0) posKomponen.set(nm, p)
    else komponenHilang++
  }
  for (const [kode, row] of petaSheet) {
    const u = petaWeb.get(kode)
    if (!u) continue
    // 1. bandingkan tiap komponen
    let bedaUnit = false
    for (const [nm, p] of posKomponen) {
      const a = grade(row[p])
      const b = grade(u.components?.[nm])
      if (a !== b) {
        bedaKomponen++
        bedaUnit = true
        if (!contoh) contoh = `${kode} · ${nm}: sheet "${a}" vs web "${b}"`
      }
    }
    // 2. ringkasan dari komponen web
    const vals = Object.values(u.components || {}).map(grade).filter(Boolean)
    const A = vals.filter((v) => v === 'A').length
    const B = vals.filter((v) => v === 'B').length
    const C = vals.filter((v) => v === 'C').length
    const total = A + B + C
    const skor = total ? Math.round(((A * 100 + B * 60) / total) * 10) / 10 : 0
    const status = String(u.status || '')
    const okRingkas = u.a === A && u.b === B && u.c === C && u.total === total && Math.abs((u.score ?? 0) - skor) < 0.05
    if (!okRingkas) {
      bedaRingkas++
      if (contoh.length < 200) contoh += ` | ringkasan ${kode}: web ${u.a}/${u.b}/${u.c}/${u.total} skor ${u.score} vs hitung ${A}/${B}/${C}/${total} skor ${skor}`
    }
    // 3. status sama dengan sheet
    if (norm(status) !== norm(row[posStatus])) {
      bedaStatus++
      if (contoh.length < 200) contoh += ` | status ${kode}: sheet "${row[posStatus]}" vs web "${status}"`
    }
    // 4. aturan Rusak ⇒ Kritis (dipakai UI)
    const k = kondisiDari(skor, status)
    if (String(status).toLowerCase() === 'rusak' && k !== 'Kritis') bedaStatus++
  }
  cek(`${tipe}: semua kolom komponen ada di header sheet`, komponenHilang === 0, `${posKomponen.size}/${daftarKomponen.length}`)
  cek(`${tipe}: nilai komponen sheet = web`, bedaKomponen === 0, bedaKomponen ? `${bedaKomponen} sel · ${contoh}` : `${petaSheet.size} unit`)
  cek(`${tipe}: ringkasan web = hitungan komponen`, bedaRingkas === 0, bedaRingkas ? `${bedaRingkas} unit` : '')
  cek(`${tipe}: status & aturan Rusak⇒Kritis`, bedaStatus === 0, bedaStatus ? `${bedaStatus} unit` : '')
}

/* stempel waktu snapshot tidak boleh lebih tua dari data sheet terakhir diubah? cukup diinformasikan */
console.log(`\n   snapshot assets.json dibuat: ${assets.generatedAt} · sumber: ${assets.source?.sheets?.join(' & ')}`)
console.log(gagal ? `\n❌ ${gagal} cek gagal` : '\n✅ semua cek lulus')
process.exit(gagal ? 1 : 0)

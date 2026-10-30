/**
 * DATA QUALITY & KONSISTENSI SHEET ↔ WEB
 *
 * Memeriksa dua hal sekaligus:
 *   A. Kebersihan data di spreadsheet (duplikat, tanggal, HM, ringkasan basi,
 *      kode asing, unit dengan komponen kosong).
 *   B. Kecocokan angka yang dipakai WEB dengan isi sheet, memakai Apps Script
 *      asli (tools/mockapi.mjs) + data CSV asli di `data/`.
 *
 * Pakai:
 *   node tools/mockapi.mjs          # terminal lain (port 8111)
 *   node tools/dataquality.mjs      # EP=http://127.0.0.1:8111/exec (default)
 *
 * Keluaran: tabel temuan + ringkasan PASS/FAIL, disimpan ke audit-shots/dataquality.json
 */
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.join(HERE, '..')
const DIR = process.env.DATA_DIR || path.join(ROOT, 'data')
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const OUT = path.join(ROOT, 'audit-shots')

/* ---------------- CSV ---------------- */
function parseCSV(txt) {
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (q) {
      if (c === '"') {
        if (txt[i + 1] === '"') { cur += '"'; i++ } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((v) => v !== ''))
}

const baca = (nama) => {
  const p = path.join(DIR, nama)
  if (!fs.existsSync(p)) return { header: [], rows: [] }
  const all = parseCSV(fs.readFileSync(p, 'utf8'))
  return { header: (all[0] || []).map((h) => h.trim()), rows: all.slice(1) }
}

const pad = (n) => String(n).padStart(2, '0')
/** Tanggal fleksibel (ISO, dd/mm/yyyy, dd/mm/yy) — cermin parseTanggal() di app. */
export function tglMs(v) {
  const s = String(v ?? '').trim()
  let m
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/))) return Date.UTC(+m[3], +m[2] - 1, +m[1])
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/))) {
    const y = +m[3] >= 70 ? 1900 + +m[3] : 2000 + +m[3]
    return Date.UTC(y, +m[2] - 1, +m[1])
  }
  return null
}
const isoDari = (v) => {
  const t = tglMs(v)
  if (t == null) return ''
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const angka = (v) => Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0
const norm = (s) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/* ---------------- API ---------------- */
async function api(body) {
  const res = await fetch(EP, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  })
  const teks = await res.text()
  try { return JSON.parse(teks) } catch { throw new Error(`balasan bukan JSON (${teks.slice(0, 120)})`) }
}

/* ---------------- pemeriksaan ---------------- */
const temuan = []
const cek = []
const tambah = (level, bidang, pesan, jumlah = 1, contoh = []) =>
  temuan.push({ level, bidang, pesan, jumlah, contoh })
const cocok = (nama, harap, dapat, catatan = '') =>
  cek.push({ nama, harap, dapat, lulus: String(harap) === String(dapat), catatan })

const META_MASTER = new Set([
  'no', 'kode unit', 'spec', 'nozzle', 'pump', 'asal mesin', 'wilayah', 'jenis', 'unit', 'power',
  'pompa', 'status', 'komoditi', 'keterangan', 'tgl inspeksi terakhir', 'jam', 'skor', 'kondisi',
  'petugas', 'temuan (b/c)', 'a', 'b', 'c', '',
])

const main = async () => {
  /* ---------- 1. MASTER (Mesin & Irrigator) ---------- */
  const master = {}
  for (const [tipe, file, kodeH, statusH] of [
    ['Mesin', 'mesin.csv', 'Kode Unit', 'Status'],
    ['Irrigator', 'irrigator.csv', 'KODE UNIT', 'Status'],
  ]) {
    const { header, rows } = baca(file)
    const ix = (n) => header.findIndex((h) => norm(h) === norm(n))
    const kk = ix(kodeH)
    const sk = ix(statusH)
    const komp = header.map((h, i) => [h, i]).filter(([h]) => !META_MASTER.has(norm(h)))
    const isi = rows.filter((r) => String(r[kk] || '').trim())

    const kode = isi.map((r) => String(r[kk]).trim().toUpperCase())
    const ganda = kode.filter((k, i) => kode.indexOf(k) !== i)
    if (ganda.length) tambah('error', `master ${tipe}`, `${ganda.length} kode unit ganda`, ganda.length, [...new Set(ganda)].slice(0, 5))

    const status = {}
    const statusAneh = []
    for (const r of isi) {
      const s = String(r[sk] || '').trim()
      status[s || '(kosong)'] = (status[s || '(kosong)'] || 0) + 1
      if (!['Terpasang', 'Standby', 'Rusak'].includes(s)) statusAneh.push(`${r[kk]}: “${s}”`)
    }
    if (statusAneh.length) tambah('warn', `master ${tipe}`, `${statusAneh.length} status tidak baku`, statusAneh.length, statusAneh.slice(0, 5))

    /* nilai komponen di luar A/B/C */
    const nilaiAneh = new Map()
    let kosong = 0
    for (const r of isi) {
      for (const [h, i] of komp) {
        const v = String(r[i] ?? '').trim()
        if (!v) { kosong++; continue }
        if (!['A', 'B', 'C'].includes(v)) nilaiAneh.set(v, (nilaiAneh.get(v) || 0) + 1)
      }
    }
    if (nilaiAneh.size) {
      tambah('warn', `master ${tipe}`, `${[...nilaiAneh.keys()].length} nilai komponen bukan A/B/C`, [...nilaiAneh.values()].reduce((a, b) => a + b, 0), [...nilaiAneh.keys()].slice(0, 5))
    }

    /* unit dengan komponen sangat sedikit (skor dihitung dari data tak lengkap) */
    const tipis = isi.filter((r) => komp.filter(([, i]) => ['A', 'B', 'C'].includes(String(r[i] ?? '').trim())).length < komp.length * 0.6)
    if (tipis.length) {
      tambah('info', `master ${tipe}`, `${tipis.length} unit punya komponen terisi < 60% (skor berbasis data tak lengkap)`, tipis.length, tipis.slice(0, 5).map((r) => r[kk]))
    }

    master[tipe] = { unit: isi.length, status, komponen: komp.length, kosong, tipis: tipis.length, kodes: new Set(kode) }
  }

  /* ---------- 2. DATA INSPEKSI ---------- */
  const di = baca('Data_Inspeksi.csv')
  const H = di.header
  const c = (n) => H.findIndex((h) => norm(h) === norm(n))
  const cKode = c('Kode Unit')
  const cTipe = c('Tipe Aset')
  const cTgl = c('Tanggal')
  const cSkor = c('Skor')
  const cA = c('A')
  const cB = c('B')
  const cC = c('C')
  const cTotal = c('Total')
  const cKond = c('Kondisi')
  const cStatus = c('Status Unit')
  const cId = c('ID Inspeksi')
  const cat = c('Catatan')
  const compIdx = H.map((h, i) => i).slice(c('Accu'), cat > 0 ? cat : H.length)

  let selisihRingkasan = 0
  let selisihSkor = 0
  let selisihKondisi = 0
  let tanggalRusak = 0
  const idGanda = new Map()
  const kodeAsing = []
  let komponenKosong = 0
  for (const r of di.rows) {
    const komp = compIdx.map((i) => String(r[i] ?? '').trim()).filter((v) => ['A', 'B', 'C'].includes(v))
    const a = komp.filter((v) => v === 'A').length
    const b = komp.filter((v) => v === 'B').length
    const cc = komp.filter((v) => v === 'C').length
    const total = a + b + cc
    const skor = total ? Math.round(((a * 100 + b * 60) / total) * 10) / 10 : 0
    if (angka(r[cA]) !== a || angka(r[cB]) !== b || angka(r[cC]) !== cc || angka(r[cTotal]) !== total) selisihRingkasan++
    if (Math.abs(angka(r[cSkor]) - skor) > 0.05) selisihSkor++
    const kondisi = String(r[cStatus] || '').trim().toLowerCase() === 'rusak'
      ? 'Kritis'
      : skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis'
    if (String(r[cKond] || '').trim() !== kondisi) selisihKondisi++
    if (!isoDari(r[cTgl])) tanggalRusak++
    if (!komp.length) komponenKosong++
    const id = String(r[cId] || '').trim()
    if (id) idGanda.set(id, (idGanda.get(id) || 0) + 1)
    const tipe = String(r[cTipe] || '').trim()
    const kode = String(r[cKode] || '').trim().toUpperCase()
    const m = master[tipe === 'Irrigator' ? 'Irrigator' : 'Mesin']
    if (kode && m && !m.kodes.has(kode)) kodeAsing.push(`${tipe}/${kode}`)
  }
  const gandaId = [...idGanda.entries()].filter(([, n]) => n > 1)

  if (selisihRingkasan) tambah('error', 'Data Inspeksi', `${selisihRingkasan} baris: kolom A/B/C/Total tidak cocok dengan nilai komponen`, selisihRingkasan)
  if (selisihSkor) tambah('error', 'Data Inspeksi', `${selisihSkor} baris: kolom Skor tidak cocok dengan hitungan komponen`, selisihSkor)
  if (selisihKondisi) tambah('warn', 'Data Inspeksi', `${selisihKondisi} baris: kolom Kondisi tidak cocok (mis. status Rusak tapi tertulis Baik)`, selisihKondisi)
  if (tanggalRusak) tambah('error', 'Data Inspeksi', `${tanggalRusak} baris: tanggal tidak terbaca`, tanggalRusak)
  if (gandaId.length) tambah('error', 'Data Inspeksi', `${gandaId.length} ID inspeksi ganda`, gandaId.length, gandaId.slice(0, 5).map(([k]) => k))
  if (kodeAsing.length) tambah('error', 'Data Inspeksi', `${kodeAsing.length} kode unit tidak ada di master`, kodeAsing.length, kodeAsing.slice(0, 5))
  if (komponenKosong) tambah('warn', 'Data Inspeksi', `${komponenKosong} baris tanpa nilai komponen sama sekali`, komponenKosong)

  /* ---------- 3. LOG SERVICE (tb_service2) ---------- */
  const log = baca('Monitor_Kasie_FS.csv')
  const lh = log.header
  const li = (n) => lh.findIndex((h) => norm(h) === norm(n))
  const lPosisi = li('Posisi')
  const lKode = li('Kode Mesin')
  const lTgl = li('Tanggal')
  const lHm = li('HM Service')
  const kunci = new Map()
  let tanggalLogRusak = 0
  const kodeLogAsing = new Set()
  for (const r of log.rows) {
    const kode = String(r[lKode] || '').trim().toUpperCase()
    if (!kode) continue
    const iso = isoDari(r[lTgl])
    if (!iso) { tanggalLogRusak++; continue }
    const key = [String(r[lPosisi] || '').trim().toUpperCase(), kode, iso, angka(r[lHm])].join('|')
    kunci.set(key, (kunci.get(key) || 0) + 1)
    if (!master.Mesin.kodes.has(kode) && !master.Irrigator.kodes.has(kode)) kodeLogAsing.add(kode)
  }
  /* baris unik per bulan (kunci sama dengan yang dipakai web: posisi|kode|tgl|HM) */
  const unikPerBulan = {}
  const sudah = new Set()
  for (const r of log.rows) {
    const kode = String(r[lKode] || '').trim().toUpperCase()
    if (!kode) continue
    const iso = isoDari(r[lTgl])
    if (!iso) continue
    const key = [String(r[lPosisi] || '').trim().toUpperCase(), kode, iso, angka(r[lHm])].join('|')
    if (sudah.has(key)) continue
    sudah.add(key)
    const bln = iso.slice(0, 7)
    unikPerBulan[bln] = (unikPerBulan[bln] || 0) + 1
  }

  const gandaLog = [...kunci.values()].filter((n) => n > 1)
  const barisBerlebih = gandaLog.reduce((a, n) => a + n - 1, 0)
  if (barisBerlebih) tambah('error', 'Log service', `${barisBerlebih} baris ganda (posisi+kode+tanggal+HM sama) → volume service membengkak`, barisBerlebih, gandaLog.slice(0, 5))
  if (tanggalLogRusak) tambah('error', 'Log service', `${tanggalLogRusak} tanggal tidak terbaca`, tanggalLogRusak)
  if (kodeLogAsing.size) tambah('warn', 'Log service', `${kodeLogAsing.size} kode unit tidak ada di master`, kodeLogAsing.size, [...kodeLogAsing].slice(0, 5))

  /* HM menurun per unit (urut dd/mm yang benar) */
  const perUnit = new Map()
  for (const r of log.rows) {
    const kode = String(r[lKode] || '').trim().toUpperCase()
    const ms = tglMs(r[lTgl])
    if (!kode || ms == null) continue
    if (!perUnit.has(kode)) perUnit.set(kode, [])
    perUnit.get(kode).push({ ms, hm: angka(r[lHm]), raw: r[lTgl] })
  }
  let hmTurun = 0
  const contohHm = []
  for (const [kode, arr] of perUnit) {
    arr.sort((a, b) => a.ms - b.ms)
    for (let i = 1; i < arr.length; i++) {
      if (arr[i - 1].hm > 0 && arr[i].hm > 0 && arr[i].hm < arr[i - 1].hm) {
        hmTurun++
        if (contohHm.length < 5) contohHm.push(`${kode}: ${arr[i - 1].raw} ${arr[i - 1].hm} → ${arr[i].raw} ${arr[i].hm}`)
      }
    }
  }
  if (hmTurun) tambah('warn', 'Log service', `${hmTurun} catatan HM menurun (salah input / HM di-reset setelah overhaul)`, hmTurun, contohHm)

  /* ---------- 4. COCOKKAN DENGAN WEB (Apps Script asli) ---------- */
  let apiOk = true
  let hasilApi = {}
  try {
    const [h, m, s] = await Promise.all([
      api({ action: 'history', payload: {} }),
      api({ action: 'master', payload: {} }),
      api({ action: 'svcread' }),
    ])
    hasilApi = { history: h, master: m, svcread: s }
    const rec = h.records || []
    const mesinApi = (m.result?.mesin || []).length
    const irrApi = (m.result?.irrigator || []).length
    cocok('jumlah riwayat (web) = baris sheet', di.rows.length, rec.length)
    cocok('unit master Mesin (web) = sheet', master.Mesin.unit, mesinApi)
    cocok('unit master Irrigator (web) = sheet', master.Irrigator.unit, irrApi)
    cocok('baris log service dikirim web', log.rows.filter((r) => String(r[lKode] || '').trim()).length, (s.result?.logRows || []).length)

    /* status unit yang dipakai web (dari master live) harus sama dengan sheet */
    const statusWeb = {}
    for (const row of m.result?.mesin || []) {
      const st = String(row[4] || '').trim()
      statusWeb[st] = (statusWeb[st] || 0) + 1
    }
    for (const k of ['Terpasang', 'Standby', 'Rusak']) {
      cocok(`status Mesin “${k}” (web) = sheet`, master.Mesin.status[k] || 0, statusWeb[k] || 0)
    }

    /* Catatan: dedupe log dilakukan di sisi web (parseService2). Angka acuan
       dihitung di sini dari CSV; kecocokannya diverifikasi di UI oleh
       tools/svcquality.mjs (butuh browser). */
  } catch (e) {
    apiOk = false
    tambah('error', 'API', `tidak bisa memanggil Apps Script: ${e.message}`)
  }

  /* ---------- 5. LAPORAN ---------- */
  console.log('\n=== TEMUAN KUALITAS DATA ===')
  if (!temuan.length) console.log('   (tidak ada temuan)')
  const urut = { error: 0, warn: 1, info: 2 }
  temuan.sort((a, b) => urut[a.level] - urut[b.level])
  for (const t of temuan) {
    const tanda = t.level === 'error' ? '⛔' : t.level === 'warn' ? '⚠️ ' : 'ℹ️ '
    console.log(`   ${tanda} [${t.bidang}] ${t.pesan}${t.contoh?.length ? ` — mis. ${t.contoh.join(', ')}` : ''}`)
  }

  console.log('\n=== KECOCOKAN SHEET ↔ WEB ===')
  for (const k of cek) {
    console.log(`   ${k.lulus ? '✅' : '❌'} ${k.nama}: sheet ${k.harap} · web ${k.dapat}${k.catatan ? ` (${k.catatan})` : ''}`)
  }

  const gagal = cek.filter((k) => !k.lulus).length
  const err = temuan.filter((t) => t.level === 'error').length
  console.log(
    `\nRingkasan: ${temuan.length} temuan (${err} error) · ${cek.length - gagal}/${cek.length} kecocokan lulus` +
      (apiOk ? '' : ' · API tidak dapat dihubungi')
  )

  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(
    path.join(OUT, 'dataquality.json'),
    JSON.stringify(
      {
        waktu: new Date().toISOString(),
        sheet: {
          master: { Mesin: master.Mesin.unit, Irrigator: master.Irrigator.unit },
          inspeksi: di.rows.length,
          logService: log.rows.length,
        },
        log: { barisMentah: log.rows.length, barisUnik: sudah.size, ganda: barisBerlebih, unikPerBulan },
        temuan,
        cek,
      },
      null,
      1
    )
  )
  console.log('(detail disimpan ke audit-shots/dataquality.json)')
  process.exit(gagal || err ? 1 : 0)
}

main().catch((e) => {
  console.error('gagal:', e)
  process.exit(1)
})

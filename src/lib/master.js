/**
 * Sumber kebenaran data aset.
 *
 * Kondisi ideal: sheet master (tb_mesin / tb_irrigator) selalu terbaru. Kenyataannya
 * aplikasi memuat `src/data/assets.json` yang dibekukan saat build. Supaya dashboard
 * tidak "basi", hasil inspeksi yang LEBIH BARU dari snapshot diterapkan kembali ke
 * setiap unit: komponen, skor, A/B/C, status, dan tanggal inspeksi terakhir.
 *
 * Aturan:
 *  - record dengan waktu inspeksi ≤ waktu snapshot TIDAK dipakai (master sudah
 *    memuatnya, dan master dianggap lebih lengkap untuk metadata).
 *  - satu unit memakai record terbaru; bila ada dua record di hari yang sama,
 *    dipakai yang id-nya paling besar agar hasilnya deterministik.
 *  - unit yang tidak punya record baru dibiarkan apa adanya.
 */
import { recordMs, tsMs, dayKeyWIB } from './time'

const SCORE_A = 100
const SCORE_B = 60
const SCORE_C = 0

/** Kunci hari (YYYY-MM-DD WIB) sebuah record inspeksi. */
const hariRecord = (r) => dayKeyWIB(recordMs(r))

/** Hitung A/B/C/skor dari objek komponen {nama: 'A'|'B'|'C'} */
export function rekapKomponen(komponen = {}) {
  let a = 0
  let b = 0
  let c = 0
  for (const v of Object.values(komponen)) {
    if (v === 'A') a++
    else if (v === 'B') b++
    else if (v === 'C') c++
  }
  const total = a + b + c
  const score = total ? Math.round(((a * SCORE_A + b * SCORE_B + c * SCORE_C) / total) * 10) / 10 : 0
  return { a, b, c, total, score }
}

/** Kondisi mengikuti aturan aplikasi: status "Rusak" SELALU Kritis. */
export const kondisiDari = (score, statusUnit) => {
  if (String(statusUnit || '').trim().toLowerCase() === 'rusak') return 'Kritis'
  return score >= 90 ? 'Baik' : score >= 70 ? 'Perlu Perhatian' : 'Kritis'
}

/** Waktu snapshot assets.json (epoch ms); 0 bila tak terbaca. */
export const snapshotMs = (generatedAt) => {
  const t = Date.parse(generatedAt || '')
  return Number.isNaN(t) ? 0 : t
}

/**
 * Status unit baku: `Terpasang` / `Standby` / `Rusak` ('' bila tidak dikenal).
 * Sheet sering ditulis dengan spasi ganda, NBSP, atau HURUF BESAR semua
 * (“RUSAK”), yang membuat filter & hitungan KPI tidak mengenali unit Rusak.
 */
export function normalStatus(v) {
  const t = String(v == null ? '' : v)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!t) return ''
  const rapat = t.replace(/\s+/g, '')
  if (rapat.includes('rusak') || rapat.includes('perbaikan') || rapat.includes('repair') || rapat.includes('breakdown')) return 'Rusak'
  if (rapat.includes('terpasang') || rapat === 'pasang' || rapat === 'installed') return 'Terpasang'
  if (rapat.includes('standby') || rapat.includes('cadangan') || rapat.includes('siaga')) return 'Standby'
  return ''
}

/**
 * Ubah balasan aksi `master` (bentuk posisional) menjadi objek unit web.
 *
 * mesin    : [kode, wilayah, spec, jenis, status, grades, tgl, pump, power, pompa, komoditi, keterangan]
 * irrigator: [kode, wilayah, jenis, status, grades, tgl, nozzle]
 */
export function bacaMasterLive(live, tipe) {
  if (!live || !Array.isArray(live[tipe === 'Mesin' ? 'mesin' : 'irrigator'])) return []
  const kmap = live.kmap?.[tipe] || []
  const daftar = live[tipe === 'Mesin' ? 'mesin' : 'irrigator']
  /* Apps Script versi lama mengirim objek (bukan baris posisional) — tetap didukung */
  if (daftar.length && !Array.isArray(daftar[0]) && typeof daftar[0] === 'object') {
    return daftar.filter((o) => o && o.kode).map((o) => {
      const komp = o.components || {}
      const rekap = rekapKomponen(komp)
      const unit = {
        ...o,
        id: o.id || `${tipe === 'Mesin' ? 'M' : 'I'}-${o.kode}`,
        kode: String(o.kode || '').trim(),
        status: normalStatus(o.status) || o.status || '',
        components: komp,
        a: rekap.a,
        b: rekap.b,
        c: rekap.c,
        total: rekap.total,
        score: rekap.score,
        kondisi: kondisiDari(rekap.score, o.status),
        dariMasterLive: true,
      }
      return unit
    })
  }
  return daftar.filter((r) => r && String(r[0] || '').trim()).map((r) => {
    const grades = String(r[5] || '')
    const components = {}
    for (let i = 0; i < kmap.length; i++) {
      const g = grades[i]
      if (g === 'A' || g === 'B' || g === 'C') components[kmap[i]] = g
    }
    const rekap = rekapKomponen(components)
    const status = normalStatus(r[4]) || String(r[4] || '').trim()
    const unit = {
      id: `${tipe === 'Mesin' ? 'M' : 'I'}-${r[0]}`,
      kode: String(r[0] || '').trim(),
      wilayah: r[1] || '',
      unit: r[3] || '',
      status,
      components,
      a: rekap.a,
      b: rekap.b,
      c: rekap.c,
      total: rekap.total,
      score: rekap.score,
      kondisi: kondisiDari(rekap.score, status),
      inspeksiTerakhir: String(r[6] || '').trim(),
      dariMasterLive: true,
    }
    if (tipe === 'Mesin') {
      unit.spec = r[2] || ''
      unit.pump = r[7] || ''
      unit.power = r[8] || ''
      unit.pompa = r[9] || ''
      unit.komoditi = r[10] || ''
      unit.keterangan = r[11] || ''
    } else {
      /* irrigator: [kode, wilayah, spec, jenis, status, grades, tgl, nozzle] */
      unit.spec = r[2] || ''
      unit.nozzle = r[7] !== undefined ? String(r[7] || '') : ''
    }
    return unit
  })
}

/**
 * Timpa data snapshot dengan keadaan master terkini (hasil aksi `master`).
 *
 * Master adalah acuan kebenaran: status, komponen, dan ringkasannya diambil dari
 * spreadsheet. Unit yang hanya ada di master ikut ditambahkan; unit yang hilang
 * dari master tetap ditampilkan (dilaporkan lewat `unitHilang`) supaya riwayat
 * inspeksinya tidak lenyap.
 *
 * @param {Object} assets data snapshot (`assets.json`)
 * @param {Object} live   balasan aksi `master`
 * @returns {{mesin: Array, irrigator: Array, diterapkan: number, unitBaru: string[], unitHilang: string[], rev: string, generatedAt: string}}
 */
export function gabungMasterLive(assets = {}, live = null) {
  const mesinLama = assets.mesin || []
  const irrLama = assets.irrigator || []
  if (!live || live.unchanged || (!live.mesin && !live.irrigator)) {
    const rapi = (daftar) => daftar.map((u) => ({ ...u, status: normalStatus(u.status) || u.status }))
    return {
      mesin: rapi(mesinLama),
      irrigator: rapi(irrLama),
      diterapkan: 0,
      unitBaru: [],
      unitHilang: [],
      rev: live?.rev || '',
      generatedAt: assets.generatedAt || '',
    }
  }

  const olah = (daftarLama, tipe) => {
    const baru = bacaMasterLive(live, tipe)
    const peta = new Map(baru.map((u) => [u.kode.toUpperCase(), u]))
    const dipakai = new Set()
    let diterapkan = 0
    const hasil = daftarLama.map((lama) => {
      const u = peta.get(String(lama.kode).trim().toUpperCase())
      if (!u) return { ...lama, status: normalStatus(lama.status) || lama.status }
      dipakai.add(u.kode.toUpperCase())
      diterapkan++
      /* urutan kunci: metadata snapshot dulu, lalu nilai master terkini */
      return { ...lama, ...u, id: lama.id || u.id, status: normalStatus(u.status) || u.status, dariMasterLive: true }
    })
    const unitBaru = baru.filter((u) => !dipakai.has(u.kode.toUpperCase())).map((u) => u.kode)
    const dikenal = new Set(hasil.map((u) => String(u.kode).trim().toUpperCase()))
    const unitHilang = daftarLama.filter((u) => !peta.has(String(u.kode).trim().toUpperCase())).map((u) => u.kode)
    return { hasil: [...hasil, ...baru.filter((u) => !dikenal.has(u.kode.toUpperCase()))], diterapkan, unitBaru, unitHilang }
  }

  const m = olah(mesinLama, 'Mesin')
  const i = olah(irrLama, 'Irrigator')
  return {
    mesin: m.hasil,
    irrigator: i.hasil,
    diterapkan: m.diterapkan + i.diterapkan,
    unitBaru: [...m.unitBaru, ...i.unitBaru],
    unitHilang: [...m.unitHilang, ...i.unitHilang],
    rev: live.rev || '',
    generatedAt: live.generatedAt || assets.generatedAt || '',
  }
}

/**
 * Terapkan inspeksi yang lebih baru dari snapshot ke daftar aset.
 *
 * @param {{mesin: Array, irrigator: Array, generatedAt?: string}} data
 * @param {Array} records record inspeksi (dari sheet "Data Inspeksi")
 * @returns {{mesin: Array, irrigator: Array, diterapkan: number, kodeBaru: string[], tanggalTerbaru: string}}
 */
export function terapkanInspeksiTerbaru(data = {}, records = []) {
  const batas = snapshotMs(data.generatedAt)
  const batasHari = batas ? dayKeyWIB(batas) : ''
  const daftar = Array.isArray(records) ? records : []

  /* Batas per unit: tanggal inspeksi terakhir yang SUDAH tercatat di master.
     Record hanya dipakai bila HARI-nya lebih baru dari itu — jadi perbaikan
     manual di spreadsheet (mis. status unit yang diubah jadi “Rusak”) tidak
     dibatalkan oleh baris inspeksi lama, sementara inspeksi baru tetap menang.
     Catatan perbaikan v1.9.1:
       · dulu ambangnya `max(tanggal master, waktu snapshot)` sehingga record
         yang lebih baru dari master tetapi lebih lama dari build snapshot
         dibuang, dan record di hari yang sama (jam berapa pun) selalu menang
         sehingga status master hasil edit manual bisa “kembali” ke status lama;
       · sekarang: unit yang punya tanggal inspeksi di master → ambang = tanggal
         itu saja, dan perbandingan memakai HARI (bukan jam). */
  const batasUnit = (unit) => {
    const t = tsMs(unit?.inspeksiTerakhir)
    return Number.isNaN(t) ? { ms: batas, dariMaster: false } : { ms: t, dariMaster: true }
  }
  const mesin = data.mesin || []
  const irrigator = data.irrigator || []

  /* tanggal inspeksi terakhir per unit (dari master/snapshot) */
  const tglUnit = new Map()
  const isiBatas = (daftar, tipe) => {
    for (const u of daftar) {
      if (!u || !u.kode) continue
      tglUnit.set(`${tipe}:${String(u.kode).trim().toUpperCase()}`, batasUnit(u))
    }
  }
  isiBatas(mesin, 'Mesin')
  isiBatas(irrigator, 'Irrigator')

  /* record terbaru per unit yang lebih baru dari snapshot */
  const terbaru = new Map()
  let tanggalTerbaru = ''
  for (const r of daftar) {
    if (!r || !r.kode) continue
    const ms = recordMs(r)
    if (!Number.isFinite(ms)) continue
    /* Record tanpa jam (mis. baris lama / ketik manual) dibandingkan per HARI,
       supaya inspeksi tanggal yang sama dengan snapshot tidak salah dibuang. */
    const adaJam = !Number.isNaN(tsMs(r.timestamp))
    const hari = hariRecord(r)
    const key = `${r.tipe === 'Irrigator' ? 'Irrigator' : 'Mesin'}:${String(r.kode).trim().toUpperCase()}`
    const info = tglUnit.has(key) ? tglUnit.get(key) : { ms: batas, dariMaster: false }
    const ambang = info.ms
    const ambangHari = ambang ? dayKeyWIB(ambang) : batasHari
    /* Master sudah punya tanggal inspeksi → hanya inspeksi di HARI YANG LEBIH BARU
       yang menimpa master (master hasil sinkron/ edit manual menang untuk hari itu).
       Tanpa tanggal master (baris lama) → pakai perbandingan waktu seperti dulu. */
    const lebihBaru = info.dariMaster
      ? ambangHari
        ? hari > ambangHari
        : true
      : adaJam
      ? ms > ambang
      : ambangHari
      ? hari >= ambangHari
      : true
    if (!lebihBaru) continue
    const ada = terbaru.get(key)
    if (!ada || ms > recordMs(ada) || (ms === recordMs(ada) && String(r.id) > String(ada.id))) terbaru.set(key, r)
    if (hari && hari > tanggalTerbaru) tanggalTerbaru = hari
  }
  if (!terbaru.size) return { mesin, irrigator, diterapkan: 0, kodeBaru: [], tanggalTerbaru: '' }

  const kodeBaru = []
  let diterapkan = 0

  const pakai = (aset, tipe) => {
    const key = `${tipe}:${String(aset.kode).trim().toUpperCase()}`
    const rec = terbaru.get(key)
    if (!rec) return aset
    /* record harus punya komponen; kalau kosong (baris lama), cukup status & tanggal */
    const komponen = rec.komponen && Object.keys(rec.komponen).length ? rec.komponen : aset.components || {}
    const rekap = rekapKomponen(komponen)
    const score = rec.komponen && Object.keys(rec.komponen).length ? rekap.score : aset.score ?? rekap.score
    const status = normalStatus(rec.statusUnit) || normalStatus(aset.status) || String(rec.statusUnit || aset.status || '').trim()
    diterapkan++
    return {
      ...aset,
      components: komponen,
      a: rekap.total ? rekap.a : aset.a,
      b: rekap.total ? rekap.b : aset.b,
      c: rekap.total ? rekap.c : aset.c,
      total: rekap.total || aset.total,
      score,
      kondisi: kondisiDari(score, status),
      status,
      inspeksiTerakhir: rec.tanggal || hariRecord(rec),
      dariInspeksi: true,
    }
  }

  const mesinBaru = mesin.map((u) => pakai(u, 'Mesin'))
  const irrBaru = irrigator.map((u) => pakai(u, 'Irrigator'))

  /* inspeksi untuk unit yang belum ada di master (mis. unit baru) → diabaikan dari
     daftar aset, tapi dilaporkan supaya bisa dibetulkan di sheet */
  const dikenal = new Set([
    ...mesin.map((u) => `Mesin:${String(u.kode).trim().toUpperCase()}`),
    ...irrigator.map((u) => `Irrigator:${String(u.kode).trim().toUpperCase()}`),
  ])
  for (const key of terbaru.keys()) if (!dikenal.has(key)) kodeBaru.push(key.split(':')[1])

  return { mesin: mesinBaru, irrigator: irrBaru, diterapkan, kodeBaru, tanggalTerbaru }
}

/**
 * Ringkasan kualitas data lintas sheet untuk ditampilkan di UI.
 * `masalah` berisi item {level: 'error'|'warn', kode, pesan}.
 */
export function ringkasKualitasMaster({ mesin = [], irrigator = [], diterapkan = 0, kodeBaru = [], snapshot = '' } = {}) {
  const masalah = []
  const semua = [...mesin, ...irrigator]

  /* 1. unit dengan komponen kosong (tidak bisa dinilai) */
  const tanpaKomponen = semua.filter((u) => !u.components || !Object.keys(u.components).length)
  if (tanpaKomponen.length) {
    masalah.push({
      level: 'warn',
      kode: 'komponen-kosong',
      pesan: `${tanpaKomponen.length} unit belum punya nilai komponen di master (${tanpaKomponen.slice(0, 3).map((u) => u.kode).join(', ')})`,
    })
  }

  /* 2. nilai komponen di luar A/B/C */
  const nilaiAneh = new Set()
  for (const u of semua) {
    for (const v of Object.values(u.components || {})) if (!['A', 'B', 'C'].includes(v)) nilaiAneh.add(String(v))
  }
  if (nilaiAneh.size) {
    masalah.push({ level: 'warn', kode: 'nilai-asing', pesan: `nilai komponen tak dikenal: ${[...nilaiAneh].slice(0, 5).join(', ')}` })
  }

  /* 3. unit berstatus Rusak tapi skornya tinggi (sumber: master, sebelum aturan Kritis) */
  const rusakSkorTinggi = semua.filter((u) => String(u.status).toLowerCase() === 'rusak' && (u.score || 0) >= 90)
  if (rusakSkorTinggi.length) {
    masalah.push({
      level: 'warn',
      kode: 'rusak-skor',
      pesan: `${rusakSkorTinggi.length} unit berstatus Rusak dengan skor ≥ 90 (${rusakSkorTinggi.slice(0, 3).map((u) => u.kode).join(', ')}) — aplikasi tetap menampilkannya Kritis`,
    })
  }

  /* 4. inspeksi untuk kode yang tidak ada di master */
  if (kodeBaru.length) {
    masalah.push({ level: 'error', kode: 'kode-asing', pesan: `${kodeBaru.length} kode inspeksi tidak ada di master: ${kodeBaru.slice(0, 4).join(', ')}` })
  }

  return { masalah, diterapkan, snapshot, totalUnit: semua.length }
}

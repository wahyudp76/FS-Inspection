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
  const mesin = data.mesin || []
  const irrigator = data.irrigator || []

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
    const lebihBaru = adaJam ? ms > batas : Boolean(batasHari) ? hari >= batasHari : true
    if (!lebihBaru) continue
    const key = `${r.tipe === 'Irrigator' ? 'Irrigator' : 'Mesin'}:${String(r.kode).trim().toUpperCase()}`
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
    const status = String(rec.statusUnit || aset.status || '').trim()
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

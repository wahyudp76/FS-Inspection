/**
 * TUKAR UNIT — rotasi engine & irrigator.
 *
 * Sumber kebenaran tetap sheet master (Mesin / Irrigator): Status dan Wilayah
 * di sana yang menentukan unit mana Terpasang di lokasi mana. Web hanya
 * mengirim permintaan tukar ke Apps Script (aksi `swapunit`), lalu memuat ulang
 * master lewat tombol Sinkron. Jejak setiap tukar disimpan di sheet
 * “Riwayat Tukar” (aksi `swapread`).
 */
import { postApi } from './api'
import { bacaLS, tulisLS } from './config'

const LS_SWAP = 'fsi:swap-cache'

/* alasan tukar — dipakai untuk riwayat & laporan */
export const ALASAN_TUKAR = [
  { id: 'rusak', label: 'Unit lama rusak' },
  { id: 'perbaikan', label: 'Unit lama masuk perbaikan' },
  { id: 'relokasi', label: 'Relokasi / pemerataan unit' },
  { id: 'upgrade', label: 'Upgrade / ganti kapasitas' },
  { id: 'lain', label: 'Lain-lain' },
]

/* nasib unit yang keluar dari lokasi */
export const STATUS_KELUAR = [
  { id: 'Standby', label: 'Standby', desc: 'Kembali ke stock, siap dipakai lagi' },
  { id: 'Rusak', label: 'Rusak', desc: 'Masuk daftar unit rusak / menunggu perbaikan' },
]

export const TIPE_ASET = ['Mesin', 'Irrigator']

/** Header sheet “Riwayat Tukar” → objek per baris. */
export const HEADER_TUKAR = [
  'waktu', 'tanggal', 'tipe', 'posisi', 'keluar', 'statusKeluar',
  'masuk', 'posisiAsal', 'alasan', 'petugas', 'catatan',
]

export function normalRiwayat(header = [], rows = []) {
  /* kolom dicocokkan lewat NAMA header, bukan posisi, supaya aman bila sheet
     pengguna menambah kolom di belakang */
  const ix = HEADER_TUKAR.map((k) => {
    const nama = {
      waktu: 'Waktu', tanggal: 'Tanggal', tipe: 'Tipe', posisi: 'Posisi',
      keluar: 'Kode Keluar', statusKeluar: 'Status Keluar', masuk: 'Kode Masuk',
      posisiAsal: 'Posisi Asal Masuk', alasan: 'Alasan', petugas: 'Petugas', catatan: 'Catatan',
    }[k]
    const i = header.findIndex((h) => String(h).trim().toUpperCase() === nama.toUpperCase())
    return i
  })
  return rows
    .map((r) => {
      const o = {}
      HEADER_TUKAR.forEach((k, j) => {
        const v = ix[j] >= 0 ? r[ix[j]] : ''
        o[k] = String(v == null ? '' : v).trim()
      })
      return o
    })
    .filter((o) => o.masuk || o.keluar)
}

/* ------------------------------ cache ------------------------------ */

export function readSwapCache() {
  try {
    const c = JSON.parse(bacaLS(LS_SWAP, '') || 'null')
    if (!c || !Array.isArray(c.riwayat)) return null
    return c
  } catch {
    return null
  }
}

function writeSwapCache(riwayat, at) {
  try {
    tulisLS(LS_SWAP, JSON.stringify({ riwayat, at }))
  } catch {
    /* kuota penuh → riwayat tetap tampil dari memori */
  }
}

/* ------------------------------ api ------------------------------ */

/** Riwayat tukar dari sheet “Riwayat Tukar”. */
export async function bacaRiwayatTukar() {
  const json = await postApi({ action: 'swapread' }, 45000)
  const r = json.result || {}
  const riwayat = normalRiwayat(r.header || [], r.rows || [])
  const at = new Date().toISOString()
  writeSwapCache(riwayat, at)
  return { riwayat, at, sheet: r.sheet || 'Riwayat Tukar', statusSah: r.statusSah || [] }
}

/** Tukar unit → menulis Status/Wilayah di sheet master + baris riwayat. */
export async function tukarUnit(payload) {
  const json = await postApi({ action: 'swapunit', payload }, 90000)
  return json.result || {}
}

/* ------------------------------ hitungan ------------------------------ */

/**
 * Kandidat unit untuk sebuah posisi.
 *  - keluar         : unit yang sekarang Terpasang di posisi itu
 *  - standby        : stock siap pakai (semua lokasi)
 *  - terpasangLain  : unit Terpasang di lokasi lain (relokasi)
 */
export function kandidatTukar(units = [], tipe = 'Mesin', posisi = '') {
  const set = (units || []).filter((u) => (u.tipe || tipe) === tipe)
  const pos = String(posisi || '').toUpperCase()
  const status = (u) => String(u.status || '').trim()
  return {
    /* semua unit Terpasang di posisi ini (dipakai kartu divisi) */
    terpasang: set.filter((u) => status(u) === 'Terpasang' && String(u.wilayah || '').toUpperCase() === pos),
    keluar: set
      .filter((u) => status(u) === 'Terpasang' && String(u.wilayah || '').toUpperCase() === pos)
      .sort((a, b) => a.kode.localeCompare(b.kode)),
    standby: set
      .filter((u) => status(u) === 'Standby')
      .sort((a, b) => String(a.wilayah || '').localeCompare(String(b.wilayah || '')) || a.kode.localeCompare(b.kode)),
    terpasangLain: set
      .filter((u) => status(u) === 'Terpasang' && String(u.wilayah || '').toUpperCase() !== pos)
      .sort((a, b) => String(a.wilayah || '').localeCompare(String(b.wilayah || '')) || a.kode.localeCompare(b.kode)),
    rusak: set.filter((u) => status(u) === 'Rusak'),
  }
}

/** Daftar posisi/wilayah untuk satu tipe (dari master). */
export function daftarPosisi(units = [], tipe = 'Mesin') {
  const m = new Map()
  ;(units || [])
    .filter((u) => (tipe === 'Semua' || (u.tipe || tipe) === tipe) && u.wilayah)
    .forEach((u) => {
      const k = String(u.wilayah).toUpperCase()
      const v = m.get(k) || { posisi: k, total: 0, terpasang: 0, standby: 0 }
      v.total++
      if (String(u.status || '').trim() === 'Terpasang') v.terpasang++
      if (String(u.status || '').trim() === 'Standby') v.standby++
      m.set(k, v)
    })
  /* divisi yang punya unit terpasang lebih dulu — BANANA/GUAVA (wilayah master
     tanpa unit terpasang) tidak lagi menduduki pilihan pertama di form */
  return [...m.values()].sort((a, b) => b.terpasang - a.terpasang || a.posisi.localeCompare(b.posisi))
}

/** Angka ringkas untuk kartu di halaman Tukar Unit. */
export function ringkasTukar(data = {}, riwayat = []) {
  const semua = [...(data.mesin || []).map((u) => ({ ...u, tipe: 'Mesin' })), ...(data.irrigator || []).map((u) => ({ ...u, tipe: 'Irrigator' }))]
  const hitung = (tipe, status) =>
    semua.filter((u) => u.tipe === tipe && String(u.status || '').trim() === status).length
  const bulanIni = new Date().toISOString().slice(0, 7)
  const tukarBulanIni = riwayat.filter((r) => String(r.tanggal || '').slice(0, 7) === bulanIni).length
  const perPosisi = daftarPosisi(semua, 'Semua')
  return {
    standbyMesin: hitung('Mesin', 'Standby'),
    standbyIrrigator: hitung('Irrigator', 'Standby'),
    terpasangMesin: hitung('Mesin', 'Terpasang'),
    terpasangIrrigator: hitung('Irrigator', 'Terpasang'),
    rusak: hitung('Mesin', 'Rusak') + hitung('Irrigator', 'Rusak'),
    tukarBulanIni,
    totalTukar: riwayat.length,
    perPosisi,
  }
}

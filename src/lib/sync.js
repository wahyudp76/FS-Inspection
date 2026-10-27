/**
 * SINKRON TERPADU — satu tombol untuk semua arah & semua sheet.
 *
 * Dulu tiap halaman punya tombol sinkron sendiri (Tarik dari Sheet, Tarik master &
 * riwayat, Sinkron ke Mesin & Irrigator, Kirim antrean lokal, …). Sekarang seluruh
 * proses dijalankan berurutan oleh `syncAll()` dan hanya dipicu dari tombol
 * **Sinkron** di header.
 *
 * Urutan penting:
 *   1. KIRIM   — antrean inspeksi lokal (web → sheet “Data Inspeksi”; Apps Script
 *                sekaligus menulis ringkasan ke sheet master Mesin/Irrigator)
 *   2. TULIS   — (Sinkron manual) hitung ulang ringkasan master A/B/C, skor,
 *                KONDISI (aturan Rusak ⇒ Kritis) + warna kolom KONDISI.
 *   3–5. TARIK — master aset, riwayat inspeksi, dan service engine (sheet → web),
 *                dijalankan paralel supaya tidak menunggu tiga kali latensi.
 *
 * Kegagalan satu tahap tidak menghentikan tahap lain: semuanya dilaporkan di
 * `laporan` supaya pengguna tahu bagian mana yang belum tersinkron.
 */
import { flushQueue, fetchHistory, fetchMasterLive, syncMaster } from './api'
import { fetchServiceData } from './service'
import { getEndpoint } from './config'

/** Susunan tahap — dipakai UI untuk menampilkan apa saja yang disinkronkan. */
export const TAHAP_SYNC = [
  {
    id: 'kirim',
    judul: 'Kirim inspeksi lokal',
    arah: 'web → sheet',
    detail: 'Antrean inspeksi di perangkat dikirim ke sheet “Data Inspeksi”; sheet master Mesin/Irrigator ikut diperbarui.',
  },
  {
    id: 'tulis',
    judul: 'Ringkasan ke sheet master',
    arah: 'web → sheet',
    detail: 'Menghitung ulang A/B/C, skor, dan KONDISI tiap unit di sheet Mesin & Irrigator (status Rusak selalu Kritis), lalu memasang warna kolom KONDISI. Dijalankan saat Sinkron manual.',
  },
  {
    id: 'master',
    judul: 'Master aset',
    arah: 'sheet → web',
    detail: 'Status, komponen, skor, dan kondisi unit dari sheet Mesin & Irrigator (tb_mesin / tb_irrigator).',
  },
  {
    id: 'riwayat',
    judul: 'Riwayat inspeksi',
    arah: 'sheet → web',
    detail: 'Seluruh baris sheet “Data Inspeksi” yang dipakai Dashboard, Data Unit, dan Riwayat.',
  },
  {
    id: 'service',
    judul: 'Service engine',
    arah: 'sheet → web',
    detail: 'Evaluasi tb_service1 + pencatatan tb_service2 dari sheet “Monitor Kasie FS”.',
  },
]

const kosong = () => ({
  ok: true,
  offline: false,
  ms: 0,
  mulai: new Date().toISOString(),
  kirim: { ok: true, terkirim: 0, gagal: 0, sisa: 0, error: '', dilewati: false },
  tulis: { ok: false, hasil: [], error: '', dilewati: true },
  master: { ok: false, unit: 0, live: false, syncedAt: null, liveData: null, error: '' },
  riwayat: { ok: false, jumlah: 0, records: null, syncedAt: null, error: '' },
  service: { ok: false, data: null, unit: 0, log: 0, error: '' },
  galat: [],
})

/**
 * Jalankan seluruh proses sinkron.
 *
 * @param {Object} [opts]
 * @param {Function} [opts.onTahap] dipanggil `(id, 'mulai'|'selesai')` tiap tahap
 * @param {boolean} [opts.tulisMaster] true = tulis ulang ringkasan ke sheet master
 *   (dipakai Sinkron manual; tarikan otomatis tiap 5 menit tidak menulis apa pun)
 * @returns {Promise<Object>} laporan lengkap (lihat `kosong()`)
 */
export async function syncAll({ onTahap, tulisMaster = false } = {}) {
  const laporan = kosong()
  const t0 = Date.now()
  const lapor = (tahap, ok, error = '') => {
    if (!ok) {
      laporan.ok = false
      if (error) laporan.galat.push(`${tahap}: ${error}`)
    }
  }

  if (!getEndpoint()) {
    laporan.offline = true
    laporan.ok = false
    laporan.galat.push('Endpoint Apps Script belum diatur (Pengaturan ▸ Koneksi sheet).')
    laporan.ms = Date.now() - t0
    laporan.selesai = new Date().toISOString()
    return laporan
  }

  /* 1. web → sheet: kirim antrean lokal */
  onTahap?.('kirim', 'mulai')
  try {
    const q = await flushQueue()
    laporan.kirim = {
      ok: !q.failed,
      terkirim: q.sent || 0,
      gagal: q.failed || 0,
      sisa: q.remaining || 0,
      error: q.failed ? `${q.failed} baris gagal terkirim` : '',
    }
    lapor('kirim', laporan.kirim.ok, laporan.kirim.error)
  } catch (e) {
    laporan.kirim = { ok: false, terkirim: 0, gagal: 0, sisa: 0, error: e.message }
    lapor('kirim', false, e.message)
  }
  onTahap?.('kirim', 'selesai')

  /* 2. web → sheet: ringkasan master (manual saja, supaya tidak menulis tiap 5 menit) */
  if (tulisMaster) {
    onTahap?.('tulis', 'mulai')
    try {
      const r = await syncMaster()
      laporan.tulis = { ok: true, hasil: Array.isArray(r) ? r : [], error: '', dilewati: false }
    } catch (e) {
      /* jangan gagalkan seluruh sinkron: tarikan sheet → web tetap berguna */
      laporan.tulis = { ok: false, hasil: [], error: e.message, dilewati: false }
      lapor('tulis', false, e.message)
    }
    onTahap?.('tulis', 'selesai')
  }

  /* 3–5. sheet → web */
  onTahap?.('master', 'mulai')
  onTahap?.('riwayat', 'mulai')
  onTahap?.('service', 'mulai')

  const tarikMaster = async () => {
    try {
      const m = await fetchMasterLive({ silent: true, force: true })
      const unit = (m.live?.mesin?.length || 0) + (m.live?.irrigator?.length || 0)
      laporan.master = {
        ok: !!m.live && !m.error,
        unit,
        live: !!m.live,
        syncedAt: m.syncedAt || null,
        liveData: m.live || null,
        error: m.error || (m.live ? '' : 'Master belum pernah ditarik'),
      }
      lapor('master', laporan.master.ok, laporan.master.error)
    } catch (e) {
      laporan.master = { ok: false, unit: 0, live: false, syncedAt: null, liveData: null, error: e.message }
      lapor('master', false, e.message)
    }
    onTahap?.('master', 'selesai')
  }

  const tarikRiwayat = async () => {
    try {
      const h = await fetchHistory({ silent: true, force: true })
      laporan.riwayat = {
        ok: !h.error,
        jumlah: h.records?.length || 0,
        records: h.records || null,
        syncedAt: h.syncedAt || null,
        error: h.error || '',
      }
      lapor('riwayat', laporan.riwayat.ok, laporan.riwayat.error)
    } catch (e) {
      laporan.riwayat = { ok: false, jumlah: 0, records: null, syncedAt: null, error: e.message }
      lapor('riwayat', false, e.message)
    }
    onTahap?.('riwayat', 'selesai')
  }

  const tarikService = async () => {
    try {
      const s = await fetchServiceData()
      laporan.service = { ok: true, data: s, unit: s.units?.length || 0, log: s.log?.length || 0, error: '' }
    } catch (e) {
      laporan.service = { ok: false, data: null, unit: 0, log: 0, error: e.message }
      lapor('service', false, e.message)
    }
    onTahap?.('service', 'selesai')
  }

  await Promise.all([tarikMaster(), tarikRiwayat(), tarikService()])

  laporan.ms = Date.now() - t0
  laporan.selesai = new Date().toISOString()
  return laporan
}

const nf = new Intl.NumberFormat('id-ID')

/** Ringkasan satu baris untuk toast setelah menekan Sinkron. */
export function ringkasSync(laporan) {
  if (!laporan) return ''
  if (laporan.offline) {
    return 'Endpoint belum diatur — buka Pengaturan ▸ Koneksi sheet untuk menghubungkan Google Sheets.'
  }
  const bagian = []
  if (laporan.kirim.terkirim) bagian.push(`${nf.format(laporan.kirim.terkirim)} inspeksi terkirim`)
  if (laporan.kirim.sisa) bagian.push(`${nf.format(laporan.kirim.sisa)} antrean tersisa`)
  if (laporan.tulis?.ok) bagian.push('ringkasan master ditulis')
  else if (laporan.tulis && !laporan.tulis.ok && !laporan.tulis.dilewati) bagian.push('ringkasan master gagal ditulis')
  if (laporan.master.ok) bagian.push(`master ${nf.format(laporan.master.unit)} unit (dibaca ulang)`)
  if (laporan.riwayat.ok) bagian.push(`${nf.format(laporan.riwayat.jumlah)} inspeksi`)
  if (laporan.service.ok) bagian.push(`${nf.format(laporan.service.log)} service`)
  const detik = (laporan.ms / 1000).toFixed(1).replace('.', ',')
  const gagal = TAHAP_SYNC.filter((t) => laporan[t.id] && !laporan[t.id].ok).map((t) => t.judul)
  if (gagal.length) {
    return `Sinkron sebagian (${detik} dtk): ${bagian.join(' · ') || 'tidak ada data'} · gagal: ${gagal.join(', ')}`
  }
  return `Sinkron selesai (${detik} dtk): ${bagian.join(' · ') || 'tidak ada data baru'}`
}

export const adaGalat = (laporan) => !!laporan && !laporan.ok

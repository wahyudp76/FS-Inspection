import { getEndpoint, LS_CACHE } from './config'
import { compareRecordsAsc } from './time'
import { expandRecords } from './compress'

const LS_REV = 'fsi:history-rev'

/**
 * Komunikasi dengan Google Apps Script Web App.
 * POST dikirim sebagai text/plain supaya tidak memicu preflight CORS
 * (Apps Script tidak menangani OPTIONS).
 */
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_CACHE) || '{"records":[],"syncedAt":null}')
  } catch {
    return { records: [], syncedAt: null }
  }
}
const writeCache = (data) => {
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify(data))
  } catch {
    /* kuota penuh: simpan versi ringkas (tanpa komponen) supaya UI tetap terisi */
    try {
      const slim = {
        records: (data.records || []).slice(0, 400).map(({ komponen, ...r }) => r),
        syncedAt: data.syncedAt,
      }
      localStorage.setItem(LS_CACHE, JSON.stringify(slim))
    } catch {
      /* menyerah dengan tenang */
    }
  }
}

const readRev = () => {
  try {
    return localStorage.getItem(LS_REV) || ''
  } catch {
    return ''
  }
}
const writeRev = (rev) => {
  try {
    if (rev) localStorage.setItem(LS_REV, String(rev))
    else localStorage.removeItem(LS_REV)
  } catch {
    /* abaikan */
  }
}

/** Buang baris kembar (id sama, atau kode+tanggal+sidik jari komponen sama). */
export function dedupeRecords(records = []) {
  const seen = new Set()
  const out = []
  for (const r of records) {
    const key = r.id || `${r.tipe}|${r.kode}|${r.tanggal}|${r.inspector || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/** Urutkan terbaru dulu memakai epoch ms, bukan perbandingan string. */
export const sortRecords = (records = []) => dedupeRecords(records).sort((a, b) => compareRecordsAsc(b, a))

const guard = () => {
  const url = getEndpoint()
  if (!url) throw new Error('Endpoint Apps Script belum diatur. Buka menu Pengaturan.')
  return url
}

async function post(body, timeoutMs = 25000) {
  const url = guard()
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error('Respon server bukan JSON. Pastikan Web App di-deploy sebagai "Anyone".')
    }
    if (!json.ok) throw new Error(json.error || 'Permintaan gagal')
    return json
  } finally {
    clearTimeout(t)
  }
}

/** Kirim aksi apa pun ke Apps Script (dipakai modul lain, mis. Service Engine). */
export async function postApi(body, timeoutMs = 25000) {
  return post(body, timeoutMs)
}

/** Simpan hasil inspeksi ke antrean lokal (mode offline / endpoint belum diatur) */
export function queueLocal(payload) {
  const cache = readCache()
  const record = {
    ...payload,
    clientId: payload.clientId || makeClientId(),
    id: `LOCAL-${Date.now()}`,
    timestamp: new Date().toISOString(),
    pending: true,
  }
  cache.records = [record, ...(cache.records || [])].slice(0, 800)
  writeCache(cache)
  return record
}

/** ID idempoten: retry dengan clientId sama tidak akan membuat baris ganda di sheet. */
export const makeClientId = () =>
  `FSI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

/** Kirim satu sesi inspeksi (1 unit, banyak komponen) */
export async function submitInspection(payload) {
  const body = { ...payload, clientId: payload.clientId || makeClientId() }
  if (!getEndpoint()) return queueLocal(body)
  const json = await post({ action: 'submit', payload: body })
  const cache = readCache()
  const record = json.record || { ...payload, id: `LOCAL-${Date.now()}`, timestamp: new Date().toISOString() }
  cache.records = [record, ...(cache.records || []).filter((r) => !(r.pending && r.kode === payload.kode && r.tanggal === payload.tanggal))].slice(0, 800)
  cache.syncedAt = new Date().toISOString()
  writeCache(cache)
  return record
}

/** Kirim ulang semua inspeksi yang masih pending di antrean lokal */
export async function flushQueue() {
  const cache = readCache()
  const pending = (cache.records || []).filter((r) => r.pending)
  if (!pending.length || !getEndpoint()) return { sent: 0, failed: pending.length, remaining: pending.length }
  let sent = 0, failed = 0, streak = 0
  for (const rec of pending) {
    try {
      const clean = { ...rec }
      delete clean.pending
      delete clean.id
      const json = await post({ action: 'submit', payload: clean })
      sent++
      streak = 0
      const saved = json.record || clean
      cache.records = cache.records.map((r) =>
        r.id === rec.id
          ? { ...saved, id: saved.id || r.id, clientId: clean.clientId, pending: false }
          : r
      )
    } catch (e) {
      failed++
      streak++
      /* endpoint mati / jaringan hilang: jangan buang waktu mencoba 20 kali */
      if (streak >= 2) break
    }
  }
  writeCache(cache)
  return { sent, failed, remaining: failed }
}

export const pendingCount = () => (readCache().records || []).filter((r) => r.pending).length

/** Ambil riwayat inspeksi dari sheet "Data Inspeksi" */
export async function fetchHistory({ silent = false, force = false } = {}) {
  if (!getEndpoint()) {
    const c = readCache()
    return { records: sortRecords(c.records || []), syncedAt: c.syncedAt, offline: true }
  }
  try {
    const cached = readCache()
    const local = cached.records || []
    const pending = local.filter((r) => r.pending)
    /* rev = sidik jari isi sheet terakhir; bila tak berubah, cukup minta konfirmasi murah.
       `force` (tombol Sinkron) SELALU menarik penuh: pengguna menekan Sinkron
       karena percaya datanya sudah berubah, jadi jangan pernah menjawab “tidak berubah”. */
    const rev = force ? '' : readRev()
    const json = await post({ action: 'history', payload: { rev } }, 30000)

    if (json.unchanged && local.length) {
      const syncedAt = new Date().toISOString()
      const records = sortRecords(local)
      writeCache({ records, syncedAt })
      return { records, syncedAt, offline: false, pending: pending.length, unchanged: true }
    }

    const fresh = expandRecords(json.records || [], json.kmap)
    writeRev(json.rev || '')
    /* buang pending yang ternyata SUDAH masuk sheet (clientId sama) → tidak dobel di layar */
    const serverIds = new Set(fresh.map((r) => r.clientId || r.id).filter(Boolean))
    const stillPending = pending.filter((r) => !serverIds.has(r.clientId))
    const records = sortRecords([...stillPending, ...fresh])
    writeCache({ records, syncedAt: new Date().toISOString() })
    return { records, syncedAt: new Date().toISOString(), offline: false, pending: stillPending.length, unchanged: false }
  } catch (e) {
    if (silent) {
      const c = readCache()
      return { records: c.records || [], syncedAt: c.syncedAt, offline: true, error: e.message }
    }
    throw e
  }
}

export function readLocalHistory() {
  const c = readCache()
  return { records: sortRecords(c.records || []), syncedAt: c.syncedAt, offline: true }
}

/** Ubah satu baris inspeksi di sheet (butuh endpoint; cache ikut diperbarui) */
export async function updateInspection(payload) {
  const json = await post({ action: 'update', payload })
  const rec = json.record || payload
  const cache = readCache()
  const records = (cache.records || []).map((r) =>
    (r.id && rec.id && r.id === rec.id) || (!r.id && r.kode === rec.kode && r.tanggal === rec.tanggal)
      ? { ...r, ...rec, pending: false }
      : r
  )
  writeCache({ records: sortRecords(records), syncedAt: new Date().toISOString() })
  return rec
}

/** Hapus satu baris inspeksi di sheet (butuh endpoint; cache ikut diperbarui) */
export async function deleteInspection(id) {
  const json = await post({ action: 'delete', payload: { id } })
  const cache = readCache()
  const records = (cache.records || []).filter((r) => r.id !== id)
  writeCache({ records: sortRecords(records), syncedAt: new Date().toISOString() })
  return json.result || { id, deleted: true }
}

/** Isi sheet "Data Inspeksi" dengan inspeksi awal dari master (idempoten) */
export async function backfillMaster(tanggal = '2026-03-05') {
  const json = await post({ action: 'backfill', payload: { tanggal } }, 120000)
  return json.result || {}
}

/** Minta Apps Script menulis hasil inspeksi terakhir ke sheet master Mesin & Irrigator */
export async function syncMaster() {
  const json = await post({ action: 'syncmaster' }, 120000)
  return json.result || []
}

/* ---------------- master live (sheet Mesin & Irrigator terkini) ---------------- */
const LS_MASTER = 'fsi:master-live'

/* Naikkan bila bentuk data master berubah → cache lama otomatis dibuang. */
const MASTER_CACHE_V = '1.9.1'

export function readMasterCache() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_MASTER) || 'null')
    if (!c || !Array.isArray(c.live?.mesin)) return null
    /* cache dari bundel versi lain / tanpa cap waktu → jangan dipercaya */
    if (c.v !== MASTER_CACHE_V || !c.syncedAt) return null
    return c
  } catch {
    return null
  }
}

/** Usia cache master (ms). `null` bila belum pernah ditarik. */
export function masterCacheAge() {
  const c = readMasterCache()
  if (!c?.syncedAt) return null
  const t = Date.parse(c.syncedAt)
  return Number.isNaN(t) ? null : Date.now() - t
}

/** Buang cache master (dipakai setelah sheet diperbaiki / ganti endpoint). */
export function clearMasterCache() {
  try {
    localStorage.removeItem(LS_MASTER)
  } catch {
    /* abaikan */
  }
}

function writeMasterCache(cache) {
  try {
    localStorage.setItem(LS_MASTER, JSON.stringify({ ...cache, v: MASTER_CACHE_V }))
  } catch { /* kuota penuh: cache master opsional */ }
}

/**
 * Ambil keadaan master terkini dari spreadsheet (aksi `master`).
 * Mengirim `rev` terakhir supaya balasan bisa sangat kecil saat tidak berubah.
 * @returns {Promise<{live: Object, syncedAt: string, offline: boolean, error?: string}>}
 */
export async function fetchMasterLive({ silent = false, force = false } = {}) {
  const cache = readMasterCache()
  if (!getEndpoint()) {
    return { live: cache?.live || null, syncedAt: cache?.syncedAt || null, offline: true }
  }
  try {
    /* Sinkron manual → minta data penuh (rev kosong), jangan menerima “unchanged” */
    const rev = force ? '' : cache?.live?.rev || ''
    const json = await post({ action: 'master', payload: { rev } }, 45000)
    const hasil = json.result || {}
    /* `unchanged` boleh dikirim di tingkat atas maupun di dalam result */
    if (json.unchanged || hasil.unchanged) {
      const syncedAt = new Date().toISOString()
      if (cache) writeMasterCache({ ...cache, syncedAt })
      return { live: cache?.live || null, syncedAt, offline: false, unchanged: true }
    }
    /* jangan pernah menimpa cache dengan balasan yang tidak berisi data unit */
    if (!Array.isArray(hasil.mesin) && !Array.isArray(hasil.irrigator)) {
      return { live: cache?.live || null, syncedAt: cache?.syncedAt || null, offline: false, error: 'Balasan master kosong' }
    }
    const syncedAt = new Date().toISOString()
    writeMasterCache({ live: hasil, syncedAt })
    return { live: hasil, syncedAt, offline: false }
  } catch (e) {
    return { live: cache?.live || null, syncedAt: cache?.syncedAt || null, offline: true, error: e.message }
  }
}

/** Perbaiki kolom D/E/F (Month, Bulan Service, Minggu Service) di tb_service2 yang error/kosong */
export async function serviceRepair() {
  const json = await post({ action: 'svcrepair' }, 180000)
  return json.result || {}
}

/** Audit kualitas data sheet: ringkasan vs komponen, komponen hilang, ID ganda */
export async function auditData() {
  const json = await post({ action: 'audit' }, 120000)
  return json.result || {}
}

/** Perbaiki data sheet (isi komponen kosong dari master + hitung ulang ringkasan).
 *  Setelah sheet diubah, cache lokal pasti basi → dibuang supaya layar tidak
 *  menampilkan angka/status lama (inilah sebab “sudah diperbaiki tapi tidak berubah”). */
export async function repairData({ sheet = 'semua', tulisKomponenHilang = true } = {}) {
  const json = await post({ action: 'repair', payload: { sheet, tulisKomponenHilang } }, 180000)
  const hasil = json.result || {}
  if (!hasil.error) {
    clearMasterCache()
    writeRev('')
    try {
      localStorage.removeItem(LS_SERVICE)
    } catch {
      /* abaikan */
    }
  }
  return hasil
}

/* naikkan bila bentuk data service berubah → cache service lama dibuang */
export const SERVICE_CACHE_V = '1.9.1'

/** Cek koneksi endpoint */
export async function ping() {
  const json = await post({ action: 'ping' }, 15000)
  return json
}

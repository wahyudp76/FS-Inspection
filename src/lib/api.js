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
export async function fetchHistory({ silent = false } = {}) {
  if (!getEndpoint()) {
    const c = readCache()
    return { records: sortRecords(c.records || []), syncedAt: c.syncedAt, offline: true }
  }
  try {
    const cached = readCache()
    const local = cached.records || []
    const pending = local.filter((r) => r.pending)
    /* rev = sidik jari isi sheet terakhir; bila tak berubah, cukup minta konfirmasi murah */
    const rev = readRev()
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

/** Isi sheet "Data Inspeksi" dengan inspeksi awal dari master (idempoten) */
export async function backfillMaster(tanggal = '2026-03-05') {
  const json = await post({ action: 'backfill', payload: { tanggal } }, 120000)
  return json.result || {}
}

/** Minta Apps Script menulis hasil inspeksi terakhir ke sheet master Mesin & Irrigator */
export async function syncMaster() {
  const json = await post({ action: 'syncmaster' }, 45000)
  return json.result || []
}

/** Cek koneksi endpoint */
export async function ping() {
  const json = await post({ action: 'ping' }, 15000)
  return json
}

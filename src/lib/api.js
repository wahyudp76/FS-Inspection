import { getEndpoint, LS_CACHE } from './config'

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
    /* quota */
  }
}

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
    id: `LOCAL-${Date.now()}`,
    timestamp: new Date().toISOString(),
    pending: true,
  }
  cache.records = [record, ...(cache.records || [])].slice(0, 800)
  writeCache(cache)
  return record
}

/** Kirim satu sesi inspeksi (1 unit, banyak komponen) */
export async function submitInspection(payload) {
  if (!getEndpoint()) return queueLocal(payload)
  const json = await post({ action: 'submit', payload })
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
  let sent = 0, failed = 0
  for (const rec of pending) {
    try {
      const clean = { ...rec }
      delete clean.pending
      delete clean.id
      await post({ action: 'submit', payload: clean })
      sent++
      cache.records = cache.records.map((r) => (r.id === rec.id ? { ...r, pending: false } : r))
    } catch {
      failed++
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
    return { records: c.records || [], syncedAt: c.syncedAt, offline: true }
  }
  try {
    const json = await post({ action: 'history' }, 30000)
    const local = readCache().records || []
    const pending = local.filter((r) => r.pending)
    const records = [...pending, ...(json.records || [])].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    writeCache({ records, syncedAt: new Date().toISOString() })
    return { records, syncedAt: new Date().toISOString(), offline: false, pending: pending.length }
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
  return { records: c.records || [], syncedAt: c.syncedAt, offline: true }
}

/** Cek koneksi endpoint */
export async function ping() {
  const json = await post({ action: 'ping' }, 15000)
  return json
}

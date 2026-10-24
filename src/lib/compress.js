/**
 * Kembangan record terkompresi dari Apps Script Web App.
 * Server mengirim nilai komponen sebagai satu string `k` berisi A/B/C/'-'
 * sepanjang `kmap[tipe]`, plus `kx` untuk nama komponen non-standar.
 * File ini bebas dependensi supaya mudah diuji.
 */
export function expandRecords(records = [], kmap = null) {
  if (!kmap) return records
  return records.map((r) => {
    if (r.k === undefined) return r
    const list = kmap[r.tipe === 'Irrigator' ? 'Irrigator' : 'Mesin'] || []
    const komponen = { ...(r.kx || {}) }
    const k = String(r.k || '')
    for (let i = 0; i < list.length && i < k.length; i++) {
      const ch = k[i]
      if (ch === 'A' || ch === 'B' || ch === 'C') komponen[list[i]] = ch
    }
    const { k: _k, kx: _kx, ...rest } = r
    return { ...rest, komponen }
  })
}

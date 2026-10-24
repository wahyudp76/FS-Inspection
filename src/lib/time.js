/**
 * Utilitas waktu tahan-banting.
 *
 * Masalah yang diselesaikan:
 *  - Sheet "Data Inspeksi" menyimpan kolom Timestamp sebagai TEKS dengan format
 *    lokal `2026-03-05 7:00:00` (jam tidak selalu dua digit).
 *  - Bot Apps Script mengembalikan ISO (`2026-10-24T01:00:00.000Z`).
 *  - Master memakai tanggal saja (`2026-03-05`).
 *
 * Membandingkan string campuran itu secara leksikografis SALAH:
 * `"2026-03-05 9:14:00" > "2026-03-05 10:00:00"` → inspeksi "terakhir" jadi keliru.
 * iOS/Safari juga menganggap `new Date('2026-03-05 7:00:00')` = Invalid Date.
 *
 * Solusi: satu parser → epoch milidetik, lalu bandingkan angka.
 */

export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 86400000

const pad = (n) => String(n).padStart(2, '0')

/**
 * Ubah nilai apa pun menjadi epoch milidetik (angka). `NaN` bila tak terbaca.
 * Teks tanpa zona waktu dianggap WIB (Asia/Jakarta, UTC+7).
 */
export function tsMs(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (v instanceof Date) return v.getTime()
  const s = String(v).trim()
  if (!s) return NaN
  if (/^\d{10,}$/.test(s)) return Number(s)

  /* YYYY-MM-DD (tanggal saja) → 00:00 WIB */
  const dOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dOnly) {
    return Date.UTC(+dOnly[1], +dOnly[2] - 1, +dOnly[3]) - WIB_OFFSET_MS
  }

  /* YYYY-MM-DD[ T]H:mm[:ss[.SSS]] TANPA zona → WIB */
  const local = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/)
  if (local) {
    return (
      Date.UTC(
        +local[1],
        +local[2] - 1,
        +local[3],
        +local[4],
        +local[5],
        +(local[6] || 0),
        Number(String(local[7] || '0').padEnd(3, '0'))
      ) - WIB_OFFSET_MS
    )
  }

  /* DD/MM/YYYY[ H:mm[:ss]] (format lama / tempelan manual di sheet) → WIB */
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (dmy) {
    return (
      Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0), +(dmy[6] || 0)) - WIB_OFFSET_MS
    )
  }

  const t = new Date(s).getTime()
  return Number.isNaN(t) ? NaN : t
}

/** Epoch ms sebuah record: pakai timestamp, jatuh ke tanggal bila perlu. */
export const recordMs = (r) => {
  if (!r) return NaN
  const a = tsMs(r.timestamp)
  if (!Number.isNaN(a)) return a
  return tsMs(r.tanggal)
}

/** Bandingkan dua record (naik). */
export const compareRecordsAsc = (a, b) => {
  const x = recordMs(a)
  const y = recordMs(b)
  if (Number.isNaN(x) && Number.isNaN(y)) return 0
  if (Number.isNaN(x)) return -1
  if (Number.isNaN(y)) return 1
  if (x === y) return String(a?.id || '').localeCompare(String(b?.id || ''))
  return x - y
}

/** Kunci hari (YYYY-MM-DD) menurut kalender WIB. */
export function dayKeyWIB(v) {
  const t = tsMs(v)
  if (Number.isNaN(t)) return ''
  const d = new Date(t + WIB_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** ISO 8601 dengan offset WIB, mis. 2026-10-24T08:05:00+07:00 */
export function toWibIso(v) {
  const t = tsMs(v)
  if (Number.isNaN(t)) return ''
  const d = new Date(t + WIB_OFFSET_MS)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00`
  )
}

/** Tanggal hari ini (YYYY-MM-DD) menurut WIB — aman meski HP memakai zona lain. */
export const todayWibISO = () => dayKeyWIB(Date.now())

/** ISO UTC penuh (untuk id/unik), tetap mudah di-parse semua browser. */
export const nowISO = () => new Date().toISOString()

/** Selisih hari (kalender WIB) antara v dan hari ini. */
export function daysAgoWIB(v) {
  const t = tsMs(v)
  if (Number.isNaN(t)) return null
  const d = Math.floor((t + WIB_OFFSET_MS) / DAY_MS)
  const today = Math.floor((Date.now() + WIB_OFFSET_MS) / DAY_MS)
  return today - d
}

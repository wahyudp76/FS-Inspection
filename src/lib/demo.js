/**
 * Data contoh (demo) — hanya untuk melihat tampilan grafik sebelum
 * ada inspeksi nyata / sebelum Apps Script terhubung.
 * Tidak pernah dikirim ke Google Sheets.
 */
const LS_DEMO = 'fsi:demo'

export const getDemo = () => {
  try {
    return localStorage.getItem(LS_DEMO) === '1'
  } catch {
    return false
  }
}
export const setDemo = (on) => {
  try {
    if (on) localStorage.setItem(LS_DEMO, '1')
    else localStorage.removeItem(LS_DEMO)
  } catch {
    /* ignore */
  }
}

const NAMA = ['Rahmat Hidayat', 'Sugianto', 'Bayu Saputra', 'Hendra Wijaya', 'Ahmad Fauzi', 'Rizky Pratama']
const CATATAN = [
  'Radiator perlu pressure test, ada rembes halus.',
  'V-belt alternator mulai retak, siapkan pengganti.',
  'Accu lemah saat start dingin, cek tegangan.',
  'Hose radiator atas mengeras, jadwalkan penggantian.',
  'Filter solar kotor, ganti saat service berikutnya.',
  '',
  '',
  '',
]

/* pseudo-random deterministik supaya hasil stabil */
let seed = 20261023
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

const itemPattern = {
  Radiator: 0.18, 'V Belt Altenator': 0.14, 'V Belt Radiator': 0.12, Accu: 0.11,
  'Hose radiator Atas': 0.1, 'Filter Solar': 0.13, 'Kabel Accu': 0.07, Ban: 0.06,
  Turbin: 0.16, 'Fleksible Hose 3"': 0.13, 'Nozle Gun': 0.1, 'Hose Drum': 0.12,
  'Rantai Besar ( Bauer )': 0.09, 'V belt Turbin ( Bauer )': 0.11,
}

function gradeFor(item) {
  const bad = itemPattern[item] || 0.03
  const r = rnd()
  if (r < bad * 0.28) return 'C'
  if (r < bad) return 'B'
  return 'A'
}

export function buildDemoRecords(data, weeks = 10, perWeek = 9) {
  const out = []
  const today = new Date()
  let i = 0
  for (let w = weeks - 1; w >= 0; w--) {
    const count = Math.max(3, Math.round(perWeek * (0.6 + rnd() * 0.8)))
    for (let n = 0; n < count; n++) {
      const isMesin = rnd() < 0.68
      const pool = isMesin ? data.mesin : data.irrigator
      if (!pool?.length) continue
      const unit = pick(pool)
      const groups = isMesin ? data.groups.mesin : data.groups.irrigator
      const comps = {}
      groups.forEach((g) =>
        g.items.forEach((it) => {
          comps[it] = gradeFor(it)
        })
      )
      const day = new Date(today)
      day.setDate(day.getDate() - w * 7 - Math.floor(rnd() * 6))
      day.setHours(7 + Math.floor(rnd() * 9), Math.floor(rnd() * 59), 0, 0)
      let a = 0, b = 0, c = 0
      Object.values(comps).forEach((v) => (v === 'A' ? a++ : v === 'B' ? b++ : c++))
      const total = a + b + c
      const skor = total ? Math.round(((a * 100 + b * 60) / total) * 10) / 10 : 0
      out.push({
        id: `DEMO-${i++}`,
        demo: true,
        tanggal: day.toISOString().slice(0, 10),
        timestamp: day.toISOString(),
        tipe: isMesin ? 'Mesin' : 'Irrigator',
        kode: unit.kode,
        wilayah: unit.wilayah,
        unitJenis: unit.unit,
        spec: unit.spec || '',
        statusUnit: unit.status,
        inspector: pick(NAMA),
        a, b, c, total, skor,
        kondisi: skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis',
        komponen: comps,
        catatan: pick(CATATAN),
      })
    }
  }
  return out.sort((x, y) => String(y.timestamp).localeCompare(String(x.timestamp)))
}

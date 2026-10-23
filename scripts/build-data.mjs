/**
 * build-data.mjs
 * ------------------------------------------------------------------
 * Mengambil data master aset dari Google Spreadsheet "Draft Dashboard"
 * (sheet "Mesin" = tb_mesin, sheet "Irrigator" = tb_irrigator) lalu
 * menuliskannya menjadi snapshot JSON di src/data/assets.json.
 *
 * Snapshot ini adalah fallback/awal supaya dashboard tetap tampil
 * cepat (dan tetap bisa dipreview offline). Data live bisa ditarik
 * ulang dari Apps Script lewat tombol "Sinkronkan".
 *
 * Jalankan:  node scripts/build-data.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const SOURCE_ID = process.env.SOURCE_SHEET_ID || '1WbGTDqC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4'

/* ---------------- pemetaan kolom ---------------- */
const MESIN_META = {
  no: 'No',
  kode: 'Kode Unit',
  wilayah: 'Asal Mesin',       // PG2 / FM4
  spec: 'Spec',
  pump: 'Pump',
  unit: 'Jenis',               // DEC / DED / DEM / SPC
  power: 'Power',
  pompa: 'Pompa',              // Sumur / Lebung
  status: 'Status',
  komoditi: 'Komoditi',
  keterangan: 'Keterangan',
}
const MESIN_TAIL = ['Mesin', 'Prodo'] // komponen di blok akhir (kolom "Category" sudah dihapus dari sheet)

const IRR_META = {
  no: 'NO',
  kode: 'KODE UNIT',
  wilayah: 'WILAYAH',
  unit: 'Unit',
  nozzle: 'Nozzle',
  status: 'Status',
}
const IRR_TAIL = ['PE', 'Helically']

/* ---------------- grup komponen (dipakai UI & Apps Script) ---------------- */
const GRUP_MESIN = [
  { id: 'kelistrikan', label: 'Kelistrikan & Baterai', icon: 'bolt', items: ['Accu', 'Kabel Accu', 'Klem Accu', 'Kunci Kontak Batery', 'Kunci Kontak Starter', 'Dinamo Start', 'Dinamo Charge', 'V Belt Altenator', 'Kabel Intalasi', 'Tombol Emergency Stop'] },
  { id: 'instrumen', label: 'Instrumen & Monitoring', icon: 'gauge', items: ['Amper Meter', 'Hour Meter', 'Oil Presure Meter', 'RPM Meter', 'Water Temp Meter', 'Amper Charge', 'Temp Air'] },
  { id: 'bahanbakar', label: 'Sistem Bahan Bakar', icon: 'fuel', items: ['Feed Pump', 'Injeksi Pump', 'Filter Solar', 'Tangki Solar', 'Selang Nozle', 'Pengukur Volum Solar', 'Stik Oil', 'Tutup Oil', 'Air Cleaner'] },
  { id: 'pendingin', label: 'Sistem Pendingin', icon: 'temp', items: ['Radiator', 'Hose radiator Atas', 'Hose radiator Bawah', 'Kipas Radiator', 'Tutup Radiator', 'V Belt Radiator', 'Water Pump', 'Oil Cooler', 'Knalpot'] },
  { id: 'power', label: 'Engine & Transmisi', icon: 'engine', items: ['Mesin', 'Prodo', 'Perpak clynder head', 'Perpak oil Pan', 'Turbo Charger', 'Coupling Assy', 'Joint Couple', 'Selenoid Transmisi'] },
  { id: 'sasis', label: 'Sasis & Body', icon: 'body', items: ['Chasis', 'Ban', 'Pintu'] },
]

const GRUP_IRR = [
  { id: 'turbin', label: 'Turbin & Transmisi', icon: 'engine', items: ['Turbin', 'As Turbin', 'V belt Turbin ( Bauer )', 'Pulley Turbin ( Bauer )', 'Rantai Besar ( Bauer )', 'Rantai Kecil', 'Sproket Wheel', 'Assembly Bearing', 'Bearing Molen', 'Gear Box / Transmisi', 'Pengatur Kecepatan'] },
  { id: 'hose', label: 'Hose & Hose Drum', icon: 'hose', items: ['Fleksible Hose 3"', 'Fleksible Hose 5"', 'Hose Drum', 'Seal Hose Drum', 'Mekanik Seal', 'Bearing Hose Drum'] },
  { id: 'gun', label: 'Gun, Troli & Bandul', icon: 'gun', items: ['Nozle Gun', 'Roda trolley Gun', 'Stoper/Putaran Gun', 'Bandul Pada Troli', 'Gandengan / Drawbar'] },
  { id: 'kaki', label: 'Rangka & Kaki', icon: 'body', items: ['Jack / Kaki  Depan', 'Jack / Kaki  Belakang', 'Ban Irigator'] },
  { id: 'hidro', label: 'Hidrolik & Instrumen', icon: 'gauge', items: ['Hydrolik', 'Pressure Gauge'] },
  { id: 'lain', label: 'Spesifikasi & Lain-lain', icon: 'spark', items: ['PE', 'Helically'] },
]

/* ---------------- helper ---------------- */
const clean = (v) => (v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim())
const normHeader = (h) => clean(h).toLowerCase().replace(/\s+/g, ' ')

async function fetchSheet(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SOURCE_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gagal unduh sheet ${name}: ${res.status}`)
  return parseCSV(await res.text())
}

function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function toObjects(rows) {
  const rawHeader = rows[0]
  const header = rawHeader.map(normHeader)
  return rows.slice(1)
    .filter((r) => r.some((c) => clean(c) !== ''))
    .map((r) => {
      const o = {}
      header.forEach((h, i) => { if (h && !(h in o)) o[h] = clean(r[i]) })
      return o
    })
}

const gradeOf = (v) => {
  const s = clean(v).toUpperCase()
  if (s === 'A' || s === 'B' || s === 'C') return s
  return ''
}

/** status kesehatan 1 unit dari nilai komponen */
function scoreOf(components) {
  let a = 0, b = 0, c = 0
  for (const v of Object.values(components)) {
    if (v === 'A') a++
    else if (v === 'B') b++
    else if (v === 'C') c++
  }
  const total = a + b + c
  const score = total ? Math.round(((a * 100 + b * 60 + c * 0) / total) * 10) / 10 : 0
  return { a, b, c, total, score }
}

/* ---------------- main ---------------- */
const [mesinRows, irrRows] = await Promise.all([fetchSheet('Mesin'), fetchSheet('Irrigator')])

const mesinObjs = toObjects(mesinRows)
const irrObjs = toObjects(irrRows)

const mesin = mesinObjs.map((o, i) => {
  const comps = {}
  for (const g of GRUP_MESIN) for (const it of g.items) {
    const key = normHeader(it)
    if (key in o) comps[it] = gradeOf(o[key])
  }
  const s = scoreOf(comps)
  return {
    id: `M-${o[normHeader(MESIN_META.kode)] || i}`,
    kode: o[normHeader(MESIN_META.kode)] || '',
    wilayah: o[normHeader(MESIN_META.wilayah)] || '',
    spec: o[normHeader(MESIN_META.spec)] || '',
    pump: o[normHeader(MESIN_META.pump)] || '',
    unit: o[normHeader(MESIN_META.unit)] || '',
    power: o[normHeader(MESIN_META.power)] || '',
    pompa: o[normHeader(MESIN_META.pompa)] || '',
    status: o[normHeader(MESIN_META.status)] || '',
    komoditi: o[normHeader(MESIN_META.komoditi)] || '',
    keterangan: o[normHeader(MESIN_META.keterangan)] || '',
    components: comps,
    ...s,
  }
})

const irrigator = irrObjs.map((o, i) => {
  const comps = {}
  for (const g of GRUP_IRR) for (const it of g.items) {
    const key = normHeader(it)
    if (key in o) comps[it] = gradeOf(o[key])
  }
  const s = scoreOf(comps)
  return {
    id: `I-${o[normHeader(IRR_META.kode)] || i}`,
    kode: o[normHeader(IRR_META.kode)] || '',
    wilayah: o[normHeader(IRR_META.wilayah)] || '',
    unit: o[normHeader(IRR_META.unit)] || '',
    nozzle: o[normHeader(IRR_META.nozzle)] || '',
    status: o[normHeader(IRR_META.status)] || '',
    components: comps,
    ...s,
  }
})

const payload = {
  generatedAt: new Date().toISOString(),
  source: { spreadsheetId: SOURCE_ID, sheets: ['Mesin', 'Irrigator'] },
  groups: { mesin: GRUP_MESIN, irrigator: GRUP_IRR },
  mesin,
  irrigator,
}

await fs.writeFile(path.join(ROOT, 'src/data/assets.json'), JSON.stringify(payload))
await fs.writeFile(path.join(ROOT, 'public/assets-snapshot.json'), JSON.stringify(payload))
await fs.mkdir(path.join(ROOT, 'apps-script'), { recursive: true })
await fs.writeFile(
  path.join(ROOT, 'apps-script/groups.generated.json'),
  JSON.stringify({ groups: payload.groups }, null, 2)
)

const komponen = (g) => g.reduce((n, x) => n + x.items.length, 0)
console.log(`✔ Mesin      : ${mesin.length} unit, ${komponen(GRUP_MESIN)} komponen`)
console.log(`✔ Irrigator  : ${irrigator.length} unit, ${komponen(GRUP_IRR)} komponen`)
console.log(`✔ Ditulis ke src/data/assets.json & public/assets-snapshot.json`)

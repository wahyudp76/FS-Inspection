/**
 * freshenv.mjs — SEGARKAN ekspor lokal (`data/`, `data2/`) dari endpoint produksi.
 *
 * Kenapa tidak pakai gviz? Untuk spreadsheet ini `gviz?tqx=out:csv&sheet=<nama>`
 * mengembalikan tab yang SALAH (tab logging harian “ZPAS637”: R Bulan/Date/
 * Wilayah, ±19.272 baris). Akibatnya ekspor tab service selalu usang/keliru dan
 * alat uji lokal membandingkan apel dengan jeruk (2026-11-24: 390 log vs 423).
 *
 * Skrip ini hanya memanggil aksi BACA (`history`, `master`, `svcread`) lalu
 * menuliskan hasilnya ke CSV dengan header yang sama seperti sheet asli,
 * sehingga `tools/mock.gs.mjs`, `tools/mockapi.mjs`, dan alat uji lain memakai
 * data yang identik dengan produksi.
 *
 *   EP='https://script.google.com/macros/s/<ID>/exec' node tools/freshenv.mjs
 *   node tools/freshenv.mjs --cek        # hanya laporkan, tidak menulis
 *
 * Tidak ada penulisan ke spreadsheet. Tidak ada token.
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = process.env.EP || ''
const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.join(HERE, '..')
const CEK = process.argv.includes('--cek')

if (!EP) {
  console.error('EP belum diisi. Contoh:\n  EP="https://script.google.com/macros/s/<ID>/exec" node tools/freshenv.mjs')
  process.exit(1)
}

const post = async (action, payload = {}, timeoutMs = 120000) => {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(EP, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
      redirect: 'follow',
      signal: ac.signal,
    })
    const teks = await res.text()
    return JSON.parse(teks)
  } finally {
    clearTimeout(t)
  }
}


/* Daftar komponen — disalin dari apps-script/Code.gs (KOMPONEN_MESIN/IRRIGATOR)
   supaya header CSV ekspor sama dengan header yang dibangun Code.gs. */
const KOMPONEN_MESIN = [
  'Accu', 'Kabel Accu', 'Klem Accu', 'Kunci Kontak Batery', 'Kunci Kontak Starter',
  'Dinamo Start', 'Dinamo Charge', 'V Belt Altenator', 'Kabel Intalasi', 'Tombol Emergency Stop',
  'Amper Meter', 'Hour Meter', 'Oil Presure Meter', 'RPM Meter', 'Water Temp Meter',
  'Amper Charge', 'Temp Air',
  'Feed Pump', 'Injeksi Pump', 'Filter Solar', 'Tangki Solar', 'Selang Nozle',
  'Pengukur Volum Solar', 'Stik Oil', 'Tutup Oil', 'Air Cleaner',
  'Radiator', 'Hose radiator Atas', 'Hose radiator Bawah', 'Kipas Radiator',
  'Tutup Radiator', 'V Belt Radiator', 'Water Pump', 'Oil Cooler', 'Knalpot',
  'Mesin', 'Prodo', 'Perpak clynder head', 'Perpak oil Pan', 'Turbo Charger',
  'Coupling Assy', 'Joint Couple', 'Selenoid Transmisi',
  'Chasis', 'Ban', 'Pintu',
]
/* Kolom ringkasan yang ditulis Code.gs ke sheet master (syncmaster). Tanpa kolom
   ini `livedata.mjs` menganggap kolom SKOR/KONDISI tidak ada (hasil “null”). */
const MASTER_SUMMARY_HEADERS = [
  'TGL INSPEKSI TERAKHIR', 'JAM', 'SKOR', 'KONDISI',
  'A', 'B', 'C', 'PETUGAS', 'TEMUAN (B/C)',
]

const KOMPONEN_IRRIGATOR = [
  'Turbin', 'As Turbin', 'V belt Turbin ( Bauer )', 'Pulley Turbin ( Bauer )',
  'Rantai Besar ( Bauer )', 'Rantai Kecil', 'Sproket Wheel', 'Assembly Bearing',
  'Bearing Molen', 'Gear Box / Transmisi', 'Pengatur Kecepatan',
  'Fleksible Hose 3"', 'Fleksible Hose 5"', 'Hose Drum', 'Seal Hose Drum',
  'Mekanik Seal', 'Bearing Hose Drum',
  'Nozle Gun', 'Roda trolley Gun', 'Stoper/Putaran Gun', 'Bandul Pada Troli',
  'Gandengan / Drawbar',
  'Jack / Kaki  Depan', 'Jack / Kaki  Belakang', 'Ban Irigator',
  'Hydrolik', 'Pressure Gauge',
  'PE', 'Helically',
]

/* ---------- CSV: kutip hanya bila perlu (koma, kutip, baris baru) ---------- */
const sel = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (rows) => rows.map((r) => r.map(sel).join(',')).join('\n') + '\n'

const tulis = (rel, rows, catatan) => {
  const isi = csv(rows)
  const baris = rows.length - 1
  if (CEK) {
    console.log(`· ${rel} → akan ditulis ${baris} baris data (${catatan})`)
    return
  }
  const p = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, isi)
  console.log(`✅ ${rel} — ${baris} baris data (${catatan})`)
}

/* ---------- master (Mesin/Irrigator) → header seperti sheet sumber ----------
   `master.result.mesin` berbentuk array:
     [kode, wilayah, spec, jenis, status, grades, tglInspeksi, pump, power, pompa, komoditi, keterangan]
     [kode, wilayah, spec, jenis, status, grades, tglInspeksi, nozzle]
   `grades` = satu huruf per komponen sesuai `kmap` (A/B/C atau '-'). */
const barisMaster = (tipe, units, kmap) => {
  const komponen = kmap || []
  const ringkas = MASTER_SUMMARY_HEADERS // TGL INSPEKSI TERAKHIR, JAM, SKOR, KONDISI, A, B, C, PETUGAS, TEMUAN
  /* Kolom A sheet asli = nomor urut ("No"/"NO"), sehingga "Kode Unit" ada di
     kolom B. Urutan itu WAJIB ditiru: banyak alat uji membaca kode unit dari
     indeks kolom 1 (tools/livedata.mjs), bukan dari nama header. */
  const kepala = tipe === 'Mesin'
    ? ['No', 'Kode Unit', 'Spec', 'Pump', 'Asal Mesin', 'Status', 'Jenis', ...komponen, ...ringkas, 'Power', 'Pompa', 'Komoditi', 'Keterangan']
    : ['NO', 'KODE UNIT', 'WILAYAH', 'Unit', 'Status', ...komponen, ...ringkas, 'Nozzle']
  const rows = [kepala]
  for (const u of units || []) {
    const kode = String(u[0] ?? '').trim()
    if (!kode) continue
    const grades = String(u[5] ?? '')
    const nilaiKomponen = komponen.map((_, i) => {
      const g = grades[i] || '-'
      return g === '-' ? '' : g
    })
    /* u = [kode, wilayah, spec, jenis, status, grades, tglInspeksi, …ekstra]
       Kolom ringkasan (SKOR/KONDISI/A/B/C/JAM/PETUGAS/TEMUAN) tidak dikirim
       `master` — dibiarkan kosong, persis seperti sheet sumber yang baru
       diisi oleh syncmaster. Yang penting kolomnya ADA. */
    const tgl = String(u[6] ?? '')
    const urut = String(rows.length) // nomor urut = urutan baris data
    const wilayah = String(u[1] ?? '')
    const spec = String(u[2] ?? '')
    const jenis = String(u[3] ?? '')
    const status = String(u[4] ?? '')
    const dasar = tipe === 'Mesin'
      ? [urut, kode, spec, String(u[7] ?? ''), wilayah, status, jenis, ...nilaiKomponen]
      : [urut, kode, wilayah, jenis, status, ...nilaiKomponen]
    const ekstra = tipe === 'Mesin'
      ? [String(u[8] ?? ''), String(u[9] ?? ''), String(u[10] ?? ''), String(u[11] ?? '')]
      : [spec] // nozzle
    rows.push([...dasar, tgl, '', '', '', '', '', '', '', '', ...ekstra])
  }
  return rows
}

const jalankan = async () => {
  const ping = await post('ping')
  if (!ping.ok) throw new Error('ping gagal: ' + (ping.error || '?'))

  /* `history` default mengirim komponen TERKOMPRESI (kolom `k` + `kmap`);
     minta `plain:true` agar tiap record membawa objek `komponen` utuh. */
  const [history, master, svc] = await Promise.all([
    post('history', { plain: true }),
    post('master'),
    post('svcread'),
  ])
  if (!history.ok) throw new Error('history gagal: ' + history.error)
  if (!master.ok) throw new Error('master gagal: ' + master.error)
  if (!svc.ok) throw new Error('svcread gagal: ' + svc.error)

  console.log(`sumber: ${ping.sheet} · versi ${ping.version}\n`)

  /* --- 1. Data Inspeksi — WAJIB berbentuk baris sheet (header + nilai) ---
     `livedata.mjs` menjalankan Code.gs apa adanya di atas CSV ini, jadi
     header harus sama dengan META + KOMPONEN + TAIL milik Code.gs (92 kolom),
     bukan nama properti JSON dari `history`. Dulu berkas ekspor memakai header
     JSON (id, tanggal, …) sehingga 275/275 baris dianggap selisih. */
  const rec = history.records || []
  if (!rec.length) throw new Error('history kosong — ekspor dibatalkan agar data lama tidak tertimpa')
  const meta = [
    'ID Inspeksi', 'Tanggal', 'Timestamp', 'Tipe Aset', 'Kode Unit', 'Wilayah',
    'Jenis Unit', 'Spesifikasi', 'Status Unit', 'Petugas', 'A', 'B', 'C',
    'Total', 'Skor', 'Kondisi',
  ]
  const hdrDI = [...meta, ...KOMPONEN_MESIN, ...KOMPONEN_IRRIGATOR, 'Catatan']
  const barisDI = (r) => {
    const komp = r.komponen || {}
    const dasar = [
      r.id ?? '', r.tanggal ?? '', r.timestamp ?? '', r.tipe ?? '', r.kode ?? '', r.wilayah ?? '',
      r.unitJenis ?? '', r.spec ?? '', r.statusUnit ?? '', r.inspector ?? '',
      r.a ?? '', r.b ?? '', r.c ?? '', r.total ?? '',
      /* Sheet ber-lokal in_ID menyimpan SKOR sebagai “88,9” (koma desimal).
         Menulis “88.9” membuat pembaca CSV gaya Indonesia (angka() di
         tools/apicheck.mjs & livedata.mjs) membaca 889 → 23 selisih palsu. */
      String(r.skor ?? '').replace('.', ','),
      r.kondisi ?? '',
    ]
    const isiKomp = [...KOMPONEN_MESIN, ...KOMPONEN_IRRIGATOR].map((k) => (k in komp ? komp[k] : ''))
    return [...dasar, ...isiKomp, r.catatan ?? '']
  }
  const rowsDI = [hdrDI, ...rec.map(barisDI)]
  tulis('data/Data_Inspeksi.csv', rowsDI, `${hdrDI.length} kolom · history`)
  tulis('data/di.csv', rowsDI, `${hdrDI.length} kolom · salinan untuk tools/mock.gs.mjs`)

  /* --- 2. master Mesin & Irrigator --- */
  const kmap = master.result?.kmap || {}
  const rowsMesin = barisMaster('Mesin', master.result?.mesin, kmap.Mesin)
  const rowsIrr = barisMaster('Irrigator', master.result?.irrigator, kmap.Irrigator)
  tulis('data/src_Mesin.csv', rowsMesin, 'master · Mesin (untuk tools/livedata.mjs)')
  tulis('data/src_Irrigator.csv', rowsIrr, 'master · Irrigator (untuk tools/livedata.mjs)')
  /* `tools/mockapi.mjs` dengan MASTER=1 membaca data/mesin.csv & irrigator.csv
     sebagai isi sheet Mesin/Irrigator. Tanpa berkas ini mock mengirim master
     KOSONG (status 0 unit) sehingga dataquality melaporkan status 0 vs 126. */
  tulis('data/mesin.csv', rowsMesin, 'master · Mesin (untuk mockapi MASTER=1)')
  tulis('data/irrigator.csv', rowsIrr, 'master · Irrigator (untuk mockapi MASTER=1)')

  /* --- 3. sheet service: log (tb_service2) & rekap (tb_service1) --- */
  const s = svc.result || {}
  if ((s.logRows || []).length) {
    tulis('data2/Monitor_Kasie_FS.csv', [s.logHeader || [], ...s.logRows], 'svcread · log service')
    tulis('data/Monitor_Kasie_FS.csv', [s.logHeader || [], ...s.logRows], 'svcread · log service (salinan)')
  } else {
    console.log('⚠️  svcread tanpa logRows — berkas log service tidak ditimpa')
  }
  if ((s.evalRows || []).length) {
    tulis('data2/Data_Service_Engine.csv', [s.evalHeader || [], ...s.evalRows], 'svcread · rekap service')
    tulis('data/Data_Service_Engine.csv', [s.evalHeader || [], ...s.evalRows], 'svcread · rekap service (salinan)')
  } else {
    console.log('⚠️  svcread tanpa evalRows — berkas rekap service tidak ditimpa')
  }

  if (!CEK) {
    console.log(
      '\nJalankan ulang mock API/Vite agar data baru terbaca:\n' +
        '  MASTER=1 TESTHOOK=1 DATA_DIR=data MASTER_DIR=data SVC_DIR=data2 \\\n' +
        '  DI_CSV=data/Data_Inspeksi.csv node tools/mockapi.mjs\n'
    )
  }
}

jalankan().catch((e) => {
  console.error('❌ ' + e.message)
  process.exit(1)
})

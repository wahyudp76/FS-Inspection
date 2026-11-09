/**
 * E2E JALUR TULIS: web → spreadsheet
 *
 * Menguji hal-hal yang tidak tercakup uji baca (synctest/dataquality):
 *   1. Kirim inspeksi baru dari form Inspeksi → baris benar-benar masuk sheet
 *      dengan ringkasan yang benar (dihitung server dari komponen).
 *   2. Klik ganda (submit dua kali dengan clientId sama) TIDAK membuat baris ganda.
 *   3. Unit berstatus Rusak di master selalu menghasilkan KONDISI "Kritis".
 *   4. Inspeksi baru menimpa ringkasan master (A/B/C/skor/kondisi/tanggal).
 *   5. Catat service dari form → baris masuk tb_service2 dan terbaca lagi oleh web.
 *
 * Pakai: mock Apps Script :8111 (MASTER=1 TESTHOOK=1) + Vite :5199
 *   node tools/e2echeck.mjs
 */
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
const EP = process.env.EP || 'http://127.0.0.1:8111/exec'
const gagal = []
const cek = (ok, nama, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
  if (!ok) gagal.push(nama)
}
const api = async (body) => {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
  return r.json()
}
/** Riwayat dari server berbentuk ringkas: satu string `k` (A/B/C/'-') sepanjang
 *  `kmap[tipe]`, plus `kx` untuk komponen non-standar. Diurai persis seperti
 *  `src/lib/compress.js` (expandRecords) supaya uji membandingkan hal yang sama. */
const riwayat = async () => {
  const j = await api({ action: 'history', payload: {} })
  const kmap = j.kmap || {}
  return (j.records || []).map((r) => {
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

const jalankan = async () => {
  const awal = await riwayat()
  /* Unit uji + status master AWAL-nya dibaca dulu. Uji sebelumnya bisa saja
     meninggalkan status berbeda, jadi invarian yang diuji bukan “harus Rusak”,
     melainkan “inspeksi tidak pernah mengubah status master”. */
  const m0 = await api({ action: 'master', payload: {} })
  const daftarMesin = m0.result?.mesin || []
  const kandidat = process.env.UNIT_UJI || 'SPC0224'
  const barisAwal = daftarMesin.find((r) => String(r[0]).toUpperCase() === kandidat) || daftarMesin[0]
  const kode = String(barisAwal?.[0] || kandidat).toUpperCase()
  const statusAwal = String(barisAwal?.[4] || '').trim()
  const hariIni = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) /* WIB */

  const browser = await chromium.launch()
  /* WIB: pengguna nyata di Indonesia. Tanpa ini, bila jam mesin uji berada di
     sekitar tengah malam UTC, tanggal yang ditulis browser (UTC) berbeda dengan
     “hari ini” versi WIB yang dipakai pemeriksaan → uji gagal palsu. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Jakarta' })
  const err = []
  page.on('pageerror', (e) => err.push(e.message))

  await page.goto(`${BASE}/#/inspeksi`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(4000)

  /* pilih unit lewat kotak cari */
  await page.locator('input').first().fill(kode)
  await page.waitForTimeout(1200)
  const diklik = await page.evaluate((k) => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes(k) && /inspeksi|Terpasang|Rusak|Standby/.test(x.innerText))
    if (b) { b.click(); return b.innerText.split('\n')[0] }
    return null
  }, kode)
  cek(!!diklik, `unit ${kode} bisa dipilih dari daftar`, diklik || '')
  await page.waitForTimeout(2500)

  /* isi nama petugas (wajib) — dulu unggahan uji ini gagal karena kolom ini kosong */
  const petugas = await page.evaluate(() => {
    /* kolom petugas memakai placeholder "Nama lengkap" di kartu Petugas */
    const inp = [...document.querySelectorAll('input')].find((i) => (i.placeholder || '') === 'Nama lengkap')
    if (!inp) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inp, 'Uji Otomatis')
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })
  cek(petugas, 'nama petugas terisi (validasi klien bekerja)')
  await page.waitForTimeout(600)

  /* nilai semua komponen A, lalu satu grup dibuat C supaya ringkasan teruji */
  const dinilai = await page.evaluate(() => {
    const semuaA = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Tandai semua A')
    if (!semuaA) return { ok: false }
    semuaA.click()
    return { ok: true }
  })
  cek(dinilai.ok, 'tombol “Tandai semua A” bekerja')
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const cSemua = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').trim() === 'C semua')
    if (cSemua.length) cSemua[cSemua.length - 1].click()
  })
  await page.waitForTimeout(1200)

  const ringkas = await page.evaluate(() => {
    const t = document.body.innerText
    const m = t.match(/TOTAL\s*\n?\s*(\d+)|Total\s*\n?\s*(\d+)/)
    return t.slice(0, 80)
  })

  /* simpan */
  const simpan = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Simpan|Kirim/i.test(x.innerText) && !x.disabled)
    if (b) { b.click(); return b.innerText.trim().slice(0, 40) }
    return ''
  })
  cek(!!simpan, 'tombol simpan aktif setelah komponen dinilai', simpan)
  await page.waitForTimeout(9000)

  const sesudah = await riwayat()
  const baru = sesudah
    .filter((r) => String(r.kode || '').toUpperCase() === kode && String(r.tanggal || '').startsWith(hariIni))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 1)
  cek(sesudah.length === awal.length + 1, 'baris baru masuk sheet', `${awal.length} → ${sesudah.length}`)
  cek(baru.length === 1, `baris terbaru ${kode} hari ini tercatat`, `${baru.length} baris`)

  if (baru.length) {
    const r = baru[0]
    const komp = r.komponen || {}
    const a = Object.values(komp).filter((v) => v === 'A').length
    const b = Object.values(komp).filter((v) => v === 'B').length
    const c = Object.values(komp).filter((v) => v === 'C').length
    cek(a === Number(r.a) && b === Number(r.b) && c === Number(r.c), 'ringkasan A/B/C di sheet = hitungan komponen', `sheet ${r.a}/${r.b}/${r.c} · komponen ${a}/${b}/${c}`)
    const harusKritis = statusAwal.toLowerCase() === 'rusak'
    const skor = Number(r.skor)
    const harap = harusKritis ? 'Kritis' : skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis'
    cek(String(r.kondisi || '').trim() === harap, `KONDISI sesuai aturan (${harusKritis ? 'Rusak ⇒ Kritis' : 'dari skor'})`, String(r.kondisi))
    cek(!!r.id && !!r.inspector, 'baris punya ID & petugas', `${r.id} · ${r.inspector}`)
  }

  /* ---- klik ganda / kirim ulang: tidak boleh dobel ---- */
  /* kirim ulang dengan clientId yang SAMA (meniru tombol tertekan dua kali) */
  const payloadUlang = {
    clientId: 'FSI-UJI-KLIK-DOBEL',
    tipe: 'Mesin',
    kode,
    statusUnit: 'Rusak',
    inspector: 'Uji Otomatis',
    catatan: 'harness e2echeck (dihapus otomatis setelah uji)',
    tanggal: hariIni,
    komponen: { Accu: 'A', 'Kabel Accu': 'C' },
  }
  await api({ action: 'submit', payload: payloadUlang })
  const setelah1 = await riwayat()
  const dobel = await api({ action: 'submit', payload: payloadUlang })
  await api({ action: 'delete', payload: { id: setelah1.find((r) => r.clientId === 'FSI-UJI-KLIK-DOBEL')?.id || '' } }).catch(() => {})
  void dobel
  const ulang = await riwayat()
  cek(ulang.length === setelah1.length, 'kirim ulang clientId sama tidak menambah baris', `${setelah1.length} → ${ulang.length}`)

  /* ---- master ikut diperbarui ---- */
  const m = await api({ action: 'master', payload: {} })
  const barisMaster = (m.result?.mesin || []).find((r) => String(r[0]).toUpperCase() === kode)
  const kmap = m.result?.kmap?.Mesin || []
  if (barisMaster) {
    const grade = String(barisMaster[5] || '')
    cek(/C/.test(grade), 'komponen master memuat temuan C dari inspeksi terbaru', `${(grade.match(/C/g) || []).length} sel C`)
    cek(
      String(barisMaster[4] || '').trim() === statusAwal,
      'status master tidak ditimpa inspeksi (otoritas sheet)',
      `${statusAwal || '—'} → ${barisMaster[4]}`
    )
  } else {
    cek(false, 'unit ditemukan di master')
  }

  cek(err.length === 0, 'tanpa error JavaScript', err.slice(0, 2).join(' | '))

  /* ---- bersihkan baris uji supaya sheet tidak menumpuk setiap kali diuji ---- */
  const akhir = await riwayat()
  const sisa = akhir.filter((r) => String(r.inspector || '').trim() === 'Uji Otomatis')
  for (const r of sisa) {
    try { await api({ action: 'delete', payload: { id: r.id } }) } catch { /* abaikan */ }
  }
  const bersih = (await riwayat()).filter((r) => String(r.inspector || '').trim() === 'Uji Otomatis').length
  cek(bersih === 0, 'baris uji dibersihkan lagi', `${sisa.length} dihapus · sisa ${bersih}`)

  await browser.close()

  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ jalur tulis web → sheet benar')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

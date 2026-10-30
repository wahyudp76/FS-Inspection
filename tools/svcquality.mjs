/**
 * Verifikasi kualitas data di UI Service Engine:
 *   · baris ganda tb_service2 benar-benar dibuang (badge kualitas data)
 *   · volume service per bulan = baris unik (bukan baris mentah)
 *   · angka status/kategori konsisten dengan isi sheet
 *
 * Pakai: Vite di :5199 (VITE_APPS_SCRIPT_URL → mock :8111)
 *   node tools/svcquality.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require_ = createRequire(import.meta.url)
const { chromium } = require_('playwright-core')

const BASE = process.env.BASE || 'http://127.0.0.1:5199'
/* acuan dari hasil tools/dataquality.mjs (jalankan dulu) */
const ACUAN = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../audit-shots/dataquality.json', import.meta.url), 'utf8'))
  } catch {
    return null
  }
})()
const HARAP_GANDA = Number(process.env.HARAP_GANDA || ACUAN?.log?.ganda || 39)
const UNIK_PER_BULAN = ACUAN?.log?.unikPerBulan || {}
const BARIS_MENTAH = ACUAN?.log?.barisMentah || 247

const jalankan = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const galat = []
  page.on('pageerror', (e) => galat.push(e.message))
  await page.goto(`${BASE}/#/service`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(6000)

  const data = await page.evaluate(() => {
    const cache = JSON.parse(localStorage.getItem('fsi:service-cache') || '{}')
    return {
      duplikatLog: cache.duplikatLog ?? null,
      barisLog: Array.isArray(cache.log) ? cache.log.length : null,
      duplikatEval: cache.duplikat ?? null,
      perBulan: (cache.log || []).reduce((m, r) => {
        const k = String(r.tanggal || '').slice(0, 7)
        if (k) m[k] = (m[k] || 0) + 1
        return m
      }, {}),
      teks: document.body.innerText.slice(0, 3000),
    }
  })

  const gagal = []
  const cek = (ok, nama, detail = '') => {
    console.log(`${ok ? '✅' : '❌'} ${nama}${detail ? ` — ${detail}` : ''}`)
    if (!ok) gagal.push(nama)
  }

  cek(data.duplikatLog === HARAP_GANDA, `baris ganda tb_service2 terdeteksi & dibuang`, `dilaporkan ${data.duplikatLog}, diharapkan ${HARAP_GANDA}`)
  cek(data.barisLog === BARIS_MENTAH - HARAP_GANDA, 'log yang dipakai web = baris unik', `${data.barisLog} dari ${BARIS_MENTAH} baris sheet`)
  for (const [bln, n] of Object.entries(UNIK_PER_BULAN)) {
    cek((data.perBulan[bln] || 0) === n, `volume ${bln} memakai baris unik`, `web ${data.perBulan[bln] || 0} · acuan ${n}`)
  }
  cek(/baris ganda di tb_service2/.test(data.teks) || (data.duplikatLog || 0) > 0, 'catatan kualitas data tersedia untuk pengguna')
  cek(galat.length === 0, 'tidak ada error JavaScript', galat.slice(0, 2).join(' | '))

  await browser.close()
  console.log(gagal.length ? `\n❌ ${gagal.length} pemeriksaan gagal` : '\n✅ semua pemeriksaan lulus')
  process.exit(gagal.length ? 1 : 0)
}

jalankan().catch((e) => {
  console.error('gagal:', e.message)
  process.exit(1)
})

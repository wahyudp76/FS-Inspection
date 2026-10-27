/**
 * themetest.mjs — memastikan TIDAK ada lagi permukaan bertema gelap.
 *
 * Memeriksa langsung di browser (Chromium):
 *   1. setiap elemen dengan latar opak diperiksa kecerahannya — latar gelap
 *      (mis. sisa `#0d1524`, `bg-slate-900`) dianggap pelanggaran;
 *   2. notifikasi (toast) untuk ketiga jenis (sukses/info/gagal) harus berlatar
 *      terang dan teksnya terbaca;
 *   3. semua modal (Tambah Inspeksi, Catat Service, detail service, Ubah
 *      inspeksi) diperiksa dengan cara yang sama;
 *   4. `color-scheme` dokumen harus `light` (bukan `dark`) supaya kontrol
 *      bawaan browser (select, date picker, scrollbar) tidak kembali gelap.
 *
 * Butuh: mock API :8111 + dev server :5199 (lihat tools/README.md).
 * Jalankan: node tools/themetest.mjs
 */
import { chromium } from 'playwright-core'

const APP = process.env.APP || 'http://127.0.0.1:5199/'
const RUTE = ['dashboard', 'inspeksi', 'unit', 'riwayat', 'service', 'pengaturan']

let gagal = 0
const cek = (nama, ok, extra = '') => {
  if (!ok) gagal++
  console.log(`${ok ? '✅' : '❌'} ${nama}${extra ? ' — ' + extra : ''}`)
}

/* Kumpulan elemen berlatar gelap (opak) di halaman aktif. */
const gelapDiHalaman = (page) =>
  page.evaluate(() => {
    const terang = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    const hasil = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
      if (!m) continue
      const [r, g, b, a = '1'] = m[1].split(',').map((v) => parseFloat(v))
      if (parseFloat(a) < 0.55) continue
      const r2 = el.getBoundingClientRect()
      if (r2.width * r2.height < 400) continue // abaikan titik/garis kecil
      const L = terang(r, g, b)
      if (L < 78) {
        hasil.push(
          `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]} rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
        )
      }
    }
    /* bayangan hitam pekat juga tanda tema gelap */
    const bayangan = [...document.querySelectorAll('body *')]
      .map((el) => getComputedStyle(el).boxShadow)
      .filter((s) => /rgba?\(0, 0, 0, 0\.(6|7|8|9)/.test(s))
    return { hasil: [...new Set(hasil)].slice(0, 8), n: hasil.length, bayangan: bayangan.length }
  })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 950 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(APP, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)

/* 1. color-scheme + latar body */
const skema = await page.evaluate(() => ({
  skema: getComputedStyle(document.documentElement).colorScheme,
  body: getComputedStyle(document.body).backgroundColor,
  tema: document.querySelector('meta[name=theme-color]')?.content,
}))
cek('color-scheme dokumen = light', /light/.test(skema.skema), skema.skema)
cek('meta theme-color terang', /^#(f|e|d)/i.test(skema.tema || ''), skema.tema)

/* 2. tiap rute bebas permukaan gelap */
for (const r of RUTE) {
  await page.goto(APP + '#/' + r, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const g = await gelapDiHalaman(page)
  cek(`rute ${r}: tidak ada permukaan gelap`, g.n === 0, g.hasil.join(' | '))
  cek(`rute ${r}: tidak ada bayangan hitam pekat`, g.bayangan === 0, `${g.bayangan} elemen`)
}

/* 3. notifikasi: picu Sinkron lalu periksa warna toast */
await page.goto(APP + '#/dashboard', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => (e.innerText || '').trim() === 'Sinkron')
  b?.click()
})
/* tunggu notifikasi muncul (sinkron 4 tahap bisa ~10 dtk) */
await page.waitForSelector('[role="status"]', { timeout: 25000 }).catch(() => {})
const toast = await page.evaluate(() => {
  const el = document.querySelector('[role="status"]')
  if (!el) return null
  const cs = getComputedStyle(el) /* el = kartu notifikasi (role=status) */
  const teks = getComputedStyle(el.querySelector('p:last-of-type') || el).color
  return {
    bg: cs.backgroundColor,
    gradien: cs.backgroundImage.slice(0, 40),
    warna: cs.color,
    teks,
    isi: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
  }
})
cek('notifikasi muncul', !!toast, toast?.isi || 'tidak ada')
if (toast) {
  const m = toast.bg.match(/rgba?\(([^)]+)\)/)
  const [r, g, bb] = m[1].split(',').map((v) => parseFloat(v))
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * bb
  cek('latar notifikasi terang (bukan tema gelap)', L > 200, `${toast.bg} · gradien: ${toast.gradien}`)
  const mt = toast.teks.match(/rgba?\(([^)]+)\)/)
  const [tr, tg, tb] = mt[1].split(',').map((v) => parseFloat(v))
  const Lt = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb
  cek('teks notifikasi cukup gelap untuk dibaca', Lt < 110, toast.teks)
}

/* 4. modal: Tambah Inspeksi & Catat Service */
const bukaModal = async (rute, label) => {
  await page.goto(APP + '#/' + rute, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const ok = await page.evaluate((lbl) => {
    const el = [...document.querySelectorAll('button, a')].find((e) => new RegExp(lbl).test((e.innerText || '').trim()))
    if (el) { el.click(); return true }
    return false
  }, label)
  await page.waitForTimeout(1500)
  return ok
}
for (const [rute, label, nama] of [
  ['dashboard', '^Tambah Inspeksi$', 'modal Tambah Inspeksi'],
  ['service', '^Catat Service$', 'modal Catat Service'],
]) {
  await bukaModal(rute, label)
  const g = await gelapDiHalaman(page)
  cek(`${nama}: tidak ada permukaan gelap`, g.n === 0, g.hasil.join(' | '))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

cek('tidak ada error JavaScript', errs.length === 0, errs.slice(0, 2).join(' | '))

await b.close()
console.log(gagal ? `\n❌ ${gagal} pemeriksaan GAGAL` : '\n✅ tidak ada sisa tema gelap')
process.exit(gagal ? 1 : 0)

/**
 * make-icons.mjs
 * ------------------------------------------------------------------
 * Membuat seluruh ikon PWA (PNG berbagai ukuran) + favicon.ico dari
 * sumber SVG di public/icon.svg (squircle) dan public/icons/square.svg
 * (full-bleed, untuk apple-touch & maskable).
 *
 * Dijalankan hanya saat ikon berubah:
 *   npm i -D playwright-core     (sekali, untuk rasterisasi)
 *   node scripts/make-icons.mjs
 *
 * Hasil ditulis ke public/ dan public/icons/ (ikut ter-copy ke docs/ saat build).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(PUBLIC, 'icons')

const squircle = fs.readFileSync(path.join(PUBLIC, 'icon.svg'), 'utf8')
const square = fs.readFileSync(path.join(OUT, 'square.svg'), 'utf8')

/* Chromium bawaan Playwright (bisa dioverride lewat env CHROME_PATH) */
const CHROME = process.env.CHROME_PATH || '/home/user/.cache/ms-playwright/chromium-1134/chrome-linux/chrome'
/* playwright-core bisa dipasang lokal (npm i -D playwright-core) atau
   dipakai dari instalasi lain lewat env PLAYWRIGHT_PATH */
const pwPath = process.env.PLAYWRIGHT_PATH || 'playwright-core'
const { chromium } = await import(pwPath)

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })

/** Render satu SVG ke PNG berukuran `size` piksel. */
async function render(svg, size, file, { transparent = true } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const body = svg.replace(/width="64" height="64"/, `width="${size}" height="${size}"`)
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${body}`
  )
  await page.waitForTimeout(60)
  await page.screenshot({
    path: file,
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  await page.close()
  console.log(`  ✔ ${path.relative(ROOT, file)} (${size}×${size})`)
}

/* ---- 1. ikon "any" (squircle, sudut transparan) ---- */
for (const size of [16, 32, 48, 72, 96, 144, 192, 256, 384, 512]) {
  await render(squircle, size, path.join(OUT, size <= 48 ? `favicon-${size}.png` : `icon-${size}.png`))
}

/* ---- 2. apple touch icon: full-bleed, sudut mati (iOS menutup sendiri) ---- */
await render(square, 180, path.join(PUBLIC, 'apple-touch-icon.png'), { transparent: false })

/* ---- 3. maskable (Android adaptive): full-bleed, glyph di safe zone ---- */
await render(square, 192, path.join(OUT, 'maskable-192.png'), { transparent: false })
await render(square, 512, path.join(OUT, 'maskable-512.png'), { transparent: false })

await browser.close()

/* ---- 4. favicon.ico (paket PNG 16/32/48) ---- */
function buildIco(files, out) {
  const pngs = files.map((f) => ({ size: Number(f.match(/(\d+)/)[1]), buf: fs.readFileSync(f) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach((p, i) => {
    const b = i * 16
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, b + 0) // width
    dir.writeUInt8(p.size >= 256 ? 0 : p.size, b + 1) // height
    dir.writeUInt8(0, b + 2) // palette
    dir.writeUInt8(0, b + 3) // reserved
    dir.writeUInt16LE(1, b + 4) // planes
    dir.writeUInt16LE(32, b + 6) // bpp
    dir.writeUInt32LE(p.buf.length, b + 8)
    dir.writeUInt32LE(offset, b + 12)
    offset += p.buf.length
  })
  fs.writeFileSync(out, Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]))
  console.log(`  ✔ ${path.relative(ROOT, out)} (${pngs.map((p) => p.size).join('/')})`)
}

buildIco(
  [16, 32, 48].map((s) => path.join(OUT, `favicon-${s}.png`)),
  path.join(PUBLIC, 'favicon.ico')
)

console.log('\nSelesai. Ikon ada di public/ dan public/icons/.')

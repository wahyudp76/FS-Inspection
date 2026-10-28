/* FS Inspection — service worker ringan
   Navigasi: network-first (selalu coba versi terbaru, fallback ke cache saat offline)
   Aset ber-hash & ikon: cache-first
   Permintaan ke Google (Apps Script / Sheets) TIDAK pernah di-cache. */
const CACHE = 'fsi-v15'
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/icon-maskable-512.png',
  './favicon.ico',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Apps Script / Sheets: langsung ke jaringan

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    )
    return
  }

  /* ikon: network-first, supaya logo baru langsung terpakai (cache hanya untuk offline) */
  const isIcon = /\.(?:png|svg|ico|webmanifest)$/.test(url.pathname)
  if (isIcon) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  const isAsset = /\/assets\//.test(url.pathname) || /\.(?:woff2?|json)$/.test(url.pathname)
  if (isAsset) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
            return res
          })
      )
    )
  }
})

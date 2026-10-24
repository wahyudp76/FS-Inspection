import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

/* PWA: daftarkan service worker (hanya pada build produksi) */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(url, { updateViaCache: 'none' }).catch(() => { /* diabaikan bila tidak didukung */ })
  })

  /* sekali per sesi: muat ulang otomatis setelah service worker baru aktif,
     supaya favicon/ikon versi lama tidak tertahan di cache */
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    try {
      if (sessionStorage.getItem('fsi:sw-reloaded')) return
      sessionStorage.setItem('fsi:sw-reloaded', '1')
      window.location.reload()
    } catch { /* sessionStorage diblokir: biarkan */ }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

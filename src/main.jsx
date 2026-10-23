import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/* PWA: daftarkan service worker (hanya pada build produksi) */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(url).catch(() => { /* diabaikan bila tidak didukung */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

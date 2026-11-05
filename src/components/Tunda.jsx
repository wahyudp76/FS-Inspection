import React, { useEffect, useState } from 'react'

/**
 * TUNDA RENDER — menunda bagian berat (grafik) sampai layar pertama tergambar.
 *
 * Kenapa: 15 grafik Recharts di Dashboard memakan ±200 ms kerja main thread.
 * Bila dirender bersama KPI pada frame pertama, pengguna melihat layar kosong
 * selama itu. Dengan menunda satu frame + `requestIdleCallback`, angka KPI
 * tampil lebih dulu dan grafik menyusul saat thread sedang lengang.
 *
 * Kartu pembungkusnya tetap dirender (tinggi kartu diatur CSS), jadi tata letak
 * — termasuk aturan “tinggi kartu seragam” — tidak berubah.
 */
export default function Tunda({ children, timeout = 700, className = '' }) {
  const [siap, setSiap] = useState(false)

  useEffect(() => {
    let idleId = null
    let timerId = null
    const raf = requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => setSiap(true), { timeout })
      } else {
        timerId = setTimeout(() => setSiap(true), 60)
      }
    })
    return () => {
      cancelAnimationFrame(raf)
      if (idleId != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      if (timerId != null) clearTimeout(timerId)
    }
  }, [timeout])

  if (!siap) return <div className={className} aria-hidden="true" />
  return children
}

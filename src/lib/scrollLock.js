import { useEffect } from 'react'

/**
 * Kunci scroll halaman selama sebuah lapisan (modal/pop-up) terbuka.
 *
 * Aturan penting yang dulu dilanggar:
 *  - hanya mengunci bila `active === true` (modal tertutup TIDAK boleh mengunci),
 *  - dependency hanya `active` (bukan callback yang dibuat ulang tiap render),
 *  - memakai penghitung agar dua lapisan (mis. pop-up + detail) tidak saling membuka kunci,
 *  - saat lapisan terakhir ditutup, `overflow` body dipulihkan ke kondisi semula.
 */
let locks = 0

export function useScrollLock(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    const body = document.body
    if (locks === 0) body.dataset.prevOverflow = body.style.overflow || ''
    locks += 1
    body.style.overflow = 'hidden'

    return () => {
      locks = Math.max(0, locks - 1)
      if (locks === 0) {
        body.style.overflow = body.dataset.prevOverflow || ''
        delete body.dataset.prevOverflow
      }
    }
  }, [active])
}

/** Pemulihan darurat: dipakai saat pindah halaman agar scroll tidak pernah "terkunci". */
export function releaseScrollLock() {
  locks = 0
  if (typeof document === 'undefined') return
  document.body.style.overflow = ''
  delete document.body.dataset.prevOverflow
}

import React from 'react'

/**
 * Jaring pengaman: bila satu halaman melempar error, tampilkan kartu pemulihan
 * (bukan layar kosong). Data lokal tidak dihapus sehingga cukup muat ulang.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    /* biarkan terlihat di console untuk diagnosa */
    console.error('FS Inspection error:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4">
        <div className="card w-full max-w-md p-5 text-center">
          <p className="text-3xl">⚠️</p>
          <h2 className="mt-2 text-base font-semibold text-slate-900">Terjadi kesalahan tampilan</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            Data inspeksi di perangkat tetap aman. Muat ulang halaman untuk melanjutkan; bila masih
            gagal, buka menu Pengaturan dan periksa endpoint Apps Script.
          </p>
          <p className="mt-2 break-words rounded-lg bg-slate-900/[0.04] px-2 py-1 text-left font-mono text-[10.5px] text-rose-600">
            {String(error.message || error)}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button className="btn-primary min-h-11" onClick={() => window.location.reload()}>
              Muat ulang halaman
            </button>
            <button
              className="btn-ghost min-h-11"
              onClick={() => {
                this.setState({ error: null })
                window.location.hash = '#/dashboard'
              }}
            >
              Kembali ke dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}

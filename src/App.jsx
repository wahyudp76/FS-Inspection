import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Shell from './components/Shell'
import Dashboard from './pages/Dashboard'
import Inspect from './pages/Inspect'
import Units from './pages/Units'
import History from './pages/History'
import Service from './pages/Service'
import Settings from './pages/Settings'
import assetsData from './data/assets.json'
import { fetchHistory, readLocalHistory, flushQueue, sortRecords } from './lib/api'
import { getEndpoint, getAutoRefresh, REFRESH_MS } from './lib/config'
import { getDemo, setDemo, buildDemoRecords } from './lib/demo'
import { Toast } from './components/ui'
import { releaseScrollLock } from './lib/scrollLock'
import QuickInspect from './components/QuickInspect'
import { terapkanInspeksiTerbaru } from './lib/master'

const readHash = () => {
  const h = (window.location.hash || '').replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const params = new URLSearchParams(qs || '')
  return {
    route: path || 'dashboard',
    params: params.get('kode') ? { tipe: params.get('tipe') || 'Mesin', kode: params.get('kode') } : null,
  }
}

export default function App() {
  const [{ route, params }, setNav] = useState(readHash)
  const [records, setRecords] = useState(() => readLocalHistory().records)
  const [sync, setSync] = useState({ syncing: false, syncedAt: null, offline: !getEndpoint() })
  const [demo, setDemoOn] = useState(() => getDemo())
  const [toast, setToast] = useState(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [svcSignal, setSvcSignal] = useState(0)

  const navigate = useCallback((r, p) => {
    const qs = p?.kode ? `?tipe=${encodeURIComponent(p.tipe || 'Mesin')}&kode=${encodeURIComponent(p.kode)}` : ''
    window.location.hash = `#/${r}${qs}`
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /* pengaman: setiap kali rute berubah, pastikan scroll halaman tidak tertinggal terkunci */
  useEffect(() => {
    const t = setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) releaseScrollLock()
    }, 60)
    return () => clearTimeout(t)
  }, [route, params])

  useEffect(() => {
    const onHash = () => setNav(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /* satu sinkronisasi pada satu waktu: mencegah permintaan ganda saat tombol
     ditekan bersamaan dengan auto-refresh / event focus */
  const inFlight = useRef(null)

  const doSync = useCallback(async ({ silent = false } = {}) => {
    if (inFlight.current) return inFlight.current
    /* tanpa endpoint: beri umpan balik jelas, jangan diam saja */
    if (!getEndpoint()) {
      setSync((s) => ({ ...s, syncing: false, offline: true }))
      if (!silent) {
        setToast({
          type: 'info',
          message: 'Endpoint Apps Script belum diatur. Buka menu Pengaturan ▸ Koneksi sheet untuk mengisinya.',
        })
      }
      return
    }
    setSync((s) => ({ ...s, syncing: true }))
    inFlight.current = (async () => {
    try {
      if (getEndpoint()) {
        try {
          const q = await flushQueue()
          if (q.sent > 0 && !silent) setToast({ type: 'success', message: `${q.sent} inspeksi lokal berhasil dikirim ke sheet.` })
        } catch { /* queue flush opsional */ }
      }
      const res = await fetchHistory({ silent: true })
      setRecords(res.records || [])
      setSync({ syncing: false, syncedAt: res.syncedAt, offline: res.offline || !!res.error })
      if (res.error && !silent) setToast({ type: 'error', message: `Gagal tarik data: ${res.error}` })
      else if (!res.offline && !silent) setToast({ type: 'success', message: 'Riwayat inspeksi tersinkron dari Google Sheets.' })
    } catch (e) {
      setSync((s) => ({ ...s, syncing: false, offline: true }))
      if (!silent) setToast({ type: 'error', message: e.message })
    } finally {
      inFlight.current = null
    }
    })()
    return inFlight.current
  }, [])

  useEffect(() => {
    doSync({ silent: true })
  }, [doSync])

  /* ---- muat ulang otomatis: tiap 5 menit + saat tab kembali aktif ---- */
  useEffect(() => {
    if (!getAutoRefresh() || !getEndpoint()) return
    let last = Date.now()

    const refresh = (force = false) => {
      if (document.visibilityState !== 'visible') return
      if (!force && Date.now() - last < 5000) return // hindari panggilan dobel saat focus + visibilitychange
      last = Date.now()
      doSync({ silent: true })
    }

    const timer = setInterval(() => refresh(), REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [doSync])

  const handleSubmitted = useCallback((rec) => {
    setRecords((prev) => {
      const exists = prev.some((r) => (rec.id && r.id === rec.id) || (!rec.id && r.kode === rec.kode && r.timestamp === rec.timestamp))
      return exists ? prev : [rec, ...prev]
    })
  }, [])

  const handleUpdated = useCallback((rec) => {
    setRecords((prev) => sortRecords(prev.map((r) => (r.id === rec.id ? { ...r, ...rec } : r))))
  }, [])

  const handleDeleted = useCallback((id) => {
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const notify = useCallback((toastData) => setToast(toastData), [])

  /* Master dari snapshot build + inspeksi yang lebih baru (sumber kebenaran) */
  const merged = useMemo(() => terapkanInspeksiTerbaru(assetsData, records), [records])
  const data = useMemo(
    () => ({
      ...assetsData,
      mesin: merged.mesin,
      irrigator: merged.irrigator,
      diterapkan: merged.diterapkan,
      kodeBaru: merged.kodeBaru,
      tanggalInspeksiTerbaru: merged.tanggalTerbaru,
    }),
    [merged]
  )

  const demoRecords = useMemo(() => (demo ? buildDemoRecords(data) : []), [demo, data])
  const allRecords = useMemo(() => [...demoRecords, ...records], [demoRecords, records])

  const toggleDemo = useCallback((on) => {
    setDemo(on)
    setDemoOn(on)
  }, [])

  const page = useMemo(() => {
    switch (route) {
      case 'inspeksi':
        return <Inspect data={data} records={allRecords} onSubmitted={handleSubmitted} navigate={navigate} initial={params} />
      case 'unit':
        return <Units data={data} records={allRecords} navigate={navigate} />
      case 'riwayat':
        return (
          <History
            records={allRecords}
            data={data}
            navigate={navigate}
            onSync={() => doSync()}
            syncing={sync.syncing}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            notify={notify}
            offline={!getEndpoint()}
          />
        )
      case 'service':
        return <Service notify={notify} openFormSignal={svcSignal} />
      case 'pengaturan':
        return <Settings onSync={() => doSync()} records={records} demo={demo} onToggleDemo={toggleDemo} />
      default:
        return <Dashboard data={data} records={allRecords} navigate={navigate} onSync={() => doSync()} syncing={sync.syncing} />
    }
  }, [route, params, data, records, allRecords, demo, toggleDemo, navigate, doSync, sync.syncing, handleSubmitted, handleUpdated, handleDeleted, notify, svcSignal])

  return (
    <Shell
      route={route}
      navigate={navigate}
      sync={sync}
      onSync={() => doSync()}
      offline={sync.offline}
      demo={demo}
      onAddInspect={() => setQuickOpen(true)}
      onAddService={() => {
        if (route !== 'service') navigate('service')
        setSvcSignal((n) => n + 1)
      }}
    >
      <div key={route + (params?.kode || '')} className="animate-fade-up">{page}</div>
      <QuickInspect
        open={quickOpen}
        data={data}
        records={allRecords}
        onClose={() => setQuickOpen(false)}
        onSubmitted={handleSubmitted}
        navigate={navigate}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Shell>
  )
}

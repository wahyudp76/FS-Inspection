import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, Kpi, Empty, Segmented, MultiSelect, Skeleton } from '../components/ui'
import { Donut } from '../components/charts'
import {
  TrenServiceChart, DivisiCakupanChart, UrgensiChart, TopTerlambatChart, PetaMingguService,
} from '../components/ServiceCharts'
import ServiceForm from '../components/ServiceForm'
import ServiceDetail from '../components/ServiceDetail'
import ServiceStatusModal from '../components/ServiceStatusModal'
import { cx, relativeTime } from '../lib/analytics'
import { SERVICE_SHEET, SERVICE_STATUS, serviceStatusMeta } from '../lib/config'
import {
  fetchServiceData,
  daftarBulan,
  ringkasBulan,
  URGENSI,
  analisaBulan,
  kohortMeta,
  labelAktivitas,
  readServiceCache,
  ringkasService,
  kualitasService,
  lengkapiUnitDariLog,
  catatService,
  tarikSetelahCatat,
  INTERVAL_HM,
} from '../lib/service'
import {
  IconWrench, IconDownload, IconAlert, IconCheck, IconClock, IconCalendar,
  IconEngine, IconSearch, IconChevron, IconExternal, IconSheet, IconTrend, IconX,
} from '../components/icons'

const fmt = (n) => (n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID').format(n))
const hariTeks = (sisa) => {
  if (sisa == null) return '—'
  if (sisa === 0) return 'hari ini'
  return sisa > 0 ? `${sisa} hari lagi` : `lewat ${-sisa} hari`
}

/* ------------------------------ pager ------------------------------ */
function Pager({ page, total, perPage, onPage, onPerPage, label }) {
  const totalHalaman = Math.max(1, Math.ceil(total / perPage))
  const aman = Math.min(page, totalHalaman - 1)
  return (
    <div className="flex flex-col gap-2 border-t border-slate-900/[0.09] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span>
          {label}: <span className="font-semibold text-slate-700">{total ? aman * perPage + 1 : 0}–{Math.min(total, (aman + 1) * perPage)}</span> dari {total}
        </span>
        <span className="hidden sm:inline text-slate-400">·</span>
        <label className="hidden items-center gap-1.5 sm:flex">
          Baris
          <select
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className="rounded-md border border-slate-900/10 bg-white px-1.5 py-0.5 text-[11px] text-slate-800"
          >
            {[10, 20, 50].map((n) => <option key={n} value={n} className="bg-white">{n}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <select
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
          className="rounded-md border border-slate-900/10 bg-white px-1.5 py-1 text-[11px] text-slate-800 sm:hidden"
        >
          {[10, 20, 50].map((n) => <option key={n} value={n} className="bg-white">{n} / hal</option>)}
        </select>
        <button
          onClick={() => onPage(Math.max(0, aman - 1))}
          disabled={aman <= 0}
          className="btn-ghost !px-2 !py-1 !text-[11px] disabled:opacity-40"
          aria-label="Halaman sebelumnya"
        >
          <IconChevron size={13} className="rotate-180" /> Sebelumnya
        </button>
        <span className="min-w-[52px] text-center font-mono text-[11px] text-slate-600">
          {aman + 1} / {totalHalaman}
        </span>
        <button
          onClick={() => onPage(Math.min(totalHalaman - 1, aman + 1))}
          disabled={aman >= totalHalaman - 1}
          className="btn-ghost !px-2 !py-1 !text-[11px] disabled:opacity-40"
          aria-label="Halaman berikutnya"
        >
          Berikutnya <IconChevron size={13} />
        </button>
      </div>
    </div>
  )
}

/* --------------------------- status pill --------------------------- */
const StatusPill = ({ id }) => {
  const m = serviceStatusMeta(id)
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  )
}

const MingguChips = ({ mingguBulan }) => {
  const items = Object.entries(mingguBulan || {})
  if (!items.length) return <span className="text-[11px] text-slate-400">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([b, w]) => (
        <span key={b} className="rounded border border-slate-900/10 bg-slate-900/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-700">
          {b.slice(0, 3)} M{w}
        </span>
      ))}
    </div>
  )
}

export default function Service({ notify, openFormSignal = 0, serviceSync = null, master = [] }) {
  const cached = useMemo(() => readServiceCache(), [])
  const [units, setUnits] = useState(cached?.units || [])
  const [log, setLog] = useState(cached?.log || [])
  const [duplikat, setDuplikat] = useState(cached?.duplikat || 0)
  const [barisEvalRaw, setBarisEvalRaw] = useState(cached?.barisEval || 0)
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt || null)
  /* berapa unit datang dari tb_service1 vs hasil turunan log/master (v1.9.0) */
  const [asal, setAsal] = useState({
    unitEval: cached?.unitEval ?? (cached?.units?.filter?.((u) => u.sumber !== 'log')?.length || 0),
    dariLog: cached?.tambahanDariLog || 0,
    dariMaster: cached?.tambahanDariMaster || 0,
  })
  const [memuat, setMemuat] = useState(!cached)
  const [galat, setGalat] = useState('')

  /* evaluasi / tabel */
  const [fPosisi, setFPosisi] = useState([])
  const [fJenis, setFJenis] = useState([])
  const [fStatus, setFStatus] = useState([])
  /* bulan acuan untuk analisa aktivitas (service bulan lalu / bulan ini / jadwal bulan depan) */
  const [acuan, setAcuan] = useState('')
  const [fKohort, setFKohort] = useState(null)
  /* filter tabel berupa himpunan kode hasil klik grafik “kondisi per bulan” */
  const [fKode, setFKode] = useState(null)
  const [cari, setCari] = useState('')
  const [urut, setUrut] = useState('telat')
  const [halEval, setHalEval] = useState(0)
  const [perEval, setPerEval] = useState(20)

  /* perhatian */
  const [tabPerhatian, setTabPerhatian] = useState('terlambat')
  const [halPerhatian, setHalPerhatian] = useState(0)

  /* riwayat pencatatan */
  const [fPosisiLog, setFPosisiLog] = useState([])
  const [fBulanLog, setFBulanLog] = useState([])
  const [cariLog, setCariLog] = useState('')
  const [halLog, setHalLog] = useState(0)
  const [perLog, setPerLog] = useState(10)

  /* pop-up */
  const [formOpen, setFormOpen] = useState(false)
  const [presetKode, setPresetKode] = useState('')
  const [detailUnit, setDetailUnit] = useState(null)
  /* pop-up ringkas dari kartu KPI (lewat jadwal / jatuh tempo / belum service) */
  const [kpiStatus, setKpiStatus] = useState(null)

  const ringkasan = useMemo(() => ringkasService(units, log, { duplikat }), [units, log, duplikat])

  /* daftar bulan acuan + default = bulan berjalan */
  const bulanOpsi = useMemo(() => daftarBulan(log), [log])
  const acuanAktif = useMemo(() => {
    if (acuan && bulanOpsi.some((b) => b.value === acuan)) return acuan
    const now = new Date()
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    return bulanOpsi.find((b) => b.value === key)?.value || bulanOpsi[0]?.value || key
  }, [acuan, bulanOpsi])
  const bulanAktif = useMemo(() => analisaBulan(units, log, acuanAktif), [units, log, acuanAktif])
  /* grafik “kondisi per bulan”: status dihitung per akhir bulan acuan */
  const bulanRingkas = useMemo(() => ringkasBulan(units, log, acuanAktif), [units, log, acuanAktif])
  /* audit ringan kualitas data sheet (dipakai badge di header) */
  const kualitas = useMemo(() => kualitasService(units, log, { duplikat }), [units, log, duplikat])
  const [bukaKualitas, setBukaKualitas] = useState(false)

  /* terapkan satu set data service (cache lokal, hasil tombol Sinkron, atau tarikan manual) */
  const terapkan = useCallback((data) => {
    if (!data) return
    /* lengkapi lagi di sisi tampilan: unit master yang belum pernah service
       tetap muncul (status “belum”) walau tidak ada di tb_service1 / tb_service2 */
    const lengkap = lengkapiUnitDariLog(data.units || [], data.log || [], {
      intervalHm: data.intervalHm || INTERVAL_HM,
      master,
    })
    setUnits(lengkap.units)
    setAsal({
      unitEval: Number.isFinite(data.unitEval) ? data.unitEval : (data.units || []).filter((u) => u.sumber !== 'log').length,
      dariLog: (data.tambahanDariLog || 0) + lengkap.dariLog,
      dariMaster: (data.tambahanDariMaster || 0) + lengkap.dariMaster,
    })
    setLog(data.log || [])
    setDuplikat(data.duplikat || 0)
    setBarisEvalRaw(data.barisEval || 0)
    setSyncedAt(data.syncedAt || null)
    setGalat('')
    setMemuat(false)
  }, [master])

  /* tarik sendiri hanya sebagai cadangan bila header belum punya data — bukan tombol tersendiri */
  const muat = useCallback(
    async ({ diam = false } = {}) => {
      if (!diam) setMemuat(true)
      try {
        terapkan(await fetchServiceData({ master }))
      } catch (e) {
        setGalat(e?.message || 'Gagal menarik data service dari Google Sheets.')
      } finally {
        setMemuat(false)
      }
    },
    [terapkan, master]
  )

  /* hasil tombol Sinkron di header selalu menang atas cache lokal */
  useEffect(() => {
    if (!serviceSync?.data) return
    terapkan(serviceSync.data)
  }, [serviceSync, terapkan])

  useEffect(() => {
    if (!serviceSync?.data) muat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* tombol "Catat Service" di header (Shell) membuka pop-up yang sama */
  useEffect(() => {
    if (!openFormSignal) return
    setPresetKode('')
    setFormOpen(true)
  }, [openFormSignal])

  /* ------------------------- filter evaluasi ------------------------- */
  const filtered = useMemo(() => {
    const q = cari.trim().toUpperCase()
    let rows = units
    if (fPosisi.length) rows = rows.filter((u) => fPosisi.includes(u.posisi))
    if (fJenis.length) rows = rows.filter((u) => fJenis.includes(u.jenis))
    if (fStatus.length) rows = rows.filter((u) => fStatus.includes(u.status))
    if (fKohort) { const set = bulanAktif.sets[fKohort]; if (set) rows = rows.filter((u) => set.has(u.kode)) }
    if (fKode?.set) rows = rows.filter((u) => fKode.set.has(u.kode))
    if (q) rows = rows.filter((u) => u.kode.includes(q) || (u.note || '').toUpperCase().includes(q))
    const bobot = { terlambat: 0, segera: 1, tanpaJadwal: 2, belum: 3, aman: 4 }
    const salin = [...rows]
    if (urut === 'telat') salin.sort((a, b) => (bobot[a.status] - bobot[b.status]) || ((b.warning ?? -999) - (a.warning ?? -999)))
    else if (urut === 'dekat') salin.sort((a, b) => ((a.sisaHari ?? 9999) - (b.sisaHari ?? 9999)))
    else if (urut === 'kode') salin.sort((a, b) => a.kode.localeCompare(b.kode))
    else if (urut === 'hm') salin.sort((a, b) => (b.hm ?? -1) - (a.hm ?? -1))
    return salin
  }, [units, fPosisi, fJenis, fStatus, cari, urut, fKohort, bulanAktif, fKode])

  const totalHalamanEval = Math.max(1, Math.ceil(filtered.length / perEval))
  const halEvalAman = Math.min(halEval, totalHalamanEval - 1)
  const barisEval = filtered.slice(halEvalAman * perEval, halEvalAman * perEval + perEval)

  useEffect(() => { setHalEval(0) }, [fPosisi, fJenis, fStatus, cari, urut, perEval, fKohort, acuanAktif, fKode])
  /* ganti bulan → saringan hasil klik grafik bulan lama dibuang */
  useEffect(() => { setFKode(null) }, [acuanAktif])

  /* --------------------------- perhatian --------------------------- */
  const daftarPerhatian = ringkasan.daftar[tabPerhatian] || []
  const perPerhatian = 10
  const totalHalPerhatian = Math.max(1, Math.ceil(daftarPerhatian.length / perPerhatian))
  const halPerhatianAman = Math.min(halPerhatian, totalHalPerhatian - 1)
  const barisPerhatian = daftarPerhatian.slice(halPerhatianAman * perPerhatian, halPerhatianAman * perPerhatian + perPerhatian)
  useEffect(() => { setHalPerhatian(0) }, [tabPerhatian])

  /* -------------------------- riwayat log -------------------------- */
  const logFiltered = useMemo(() => {
    const q = cariLog.trim().toUpperCase()
    let rows = log
    if (fPosisiLog.length) rows = rows.filter((r) => fPosisiLog.includes(r.posisi))
    if (fBulanLog.length) rows = rows.filter((r) => fBulanLog.includes(r.bulan))
    if (q) rows = rows.filter((r) => r.kode.includes(q))
    return rows
  }, [log, fPosisiLog, fBulanLog, cariLog])

  const totalHalLog = Math.max(1, Math.ceil(logFiltered.length / perLog))
  const halLogAman = Math.min(halLog, totalHalLog - 1)
  const barisLog = logFiltered.slice(halLogAman * perLog, halLogAman * perLog + perLog)
  useEffect(() => { setHalLog(0) }, [fPosisiLog, fBulanLog, cariLog, perLog])

  const opsiPosisi = ringkasan.posisi
  const opsiJenis = ringkasan.jenis
  const opsiBulan = useMemo(() => [...new Set(log.map((r) => r.bulan).filter(Boolean))], [log])

  /* ----------------------------- aksi ----------------------------- */
  const bukaForm = (kode = '') => {
    setPresetKode(kode)
    setDetailUnit(null)
    setFormOpen(true)
  }

  const simpanService = async (payload) => {
    const hasil = await catatService(payload)
    const segar = await tarikSetelahCatat({ kode: payload.kode, hm: payload.hm, tanggal: payload.tanggal })
    if (segar?.units?.length) {
      setUnits(segar.units)
      setLog(segar.log)
      setDuplikat(segar.duplikat || 0)
      setBarisEvalRaw(segar.barisEval || 0)
      setSyncedAt(segar.syncedAt)
    } else {
      await muat({ diam: true })
    }
    return { ...hasil, verified: hasil.verified !== false, eval: hasil.evaluasi || null, ditemukan: segar?.ditemukan }
  }

  const unduhCsv = () => {
    const header = ['Kode Unit', 'Jenis', 'Posisi', 'Service Terakhir', 'HM Terakhir', 'Next Service', 'Next HM', 'Warning (hari)', 'Status', `Aktivitas ${bulanAktif.acuan.label}`, 'Catatan']
    const baris = filtered.map((u) => [
      u.kode, u.jenis, u.posisi, u.terakhirIso, u.hm ?? '', u.nextIso, u.nextHm ?? '', u.warning ?? '',
      serviceStatusMeta(u.status).label, labelAktivitas(bulanAktif.perUnit.get(u.kode), bulanAktif), u.note || '',
    ])
    const csv = [header, ...baris].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluasi-service-engine-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    notify?.({ type: 'success', message: `${filtered.length} baris evaluasi service diunduh sebagai CSV.` })
  }

  const donutData = SERVICE_STATUS.filter((s) => (bulanRingkas.byStatus[s.id] || 0) > 0).map((s) => ({
    name: s.label,
    value: bulanRingkas.byStatus[s.id],
    color: s.color,
  }))

  const perhatianTabs = [
    { value: 'terlambat', label: `Lewat (${ringkasan.terlambat})` },
    { value: 'segera', label: `Jatuh tempo (${ringkasan.segera})` },
    { value: 'belum', label: `Belum service (${ringkasan.belumService})` },
    { value: 'tanpaJadwal', label: `Data HM kurang (${ringkasan.tanpaJadwal})` },
  ]

  return (
    <div className="space-y-4">
      {/* ---------------- judul + aksi ---------------- */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <IconWrench size={16} className="text-brand" /> Evaluasi Service Engine
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-relaxed text-slate-500">
              Ringkasan dari <span className="text-slate-700">{SERVICE_SHEET.evalTable}</span> (sheet “{SERVICE_SHEET.evalSheet}”):
              engine mana yang belum diservice, sudah lewat warning date, atau jatuh tempo. Pencatatan service masuk ke{' '}
              <span className="text-slate-700">{SERVICE_SHEET.logTable}</span> (sheet “{SERVICE_SHEET.logSheet}”).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bukaForm('')} className="btn-primary !px-3 !py-2 !text-[12px]">
              <IconWrench size={14} /> Catat Service
            </button>
            <button onClick={unduhCsv} className="btn-ghost !px-3 !py-2 !text-[12px]">
              <IconDownload size={13} /> CSV
            </button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <IconClock size={11} /> {syncedAt ? `Tersinkron ${relativeTime(syncedAt)}` : 'Belum tersinkron — tekan Sinkron di header'}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconEngine size={11} /> {fmt(ringkasan.totalUnit)} engine · {fmt(ringkasan.totalPencatatan)} pencatatan service
          </span>
          {kualitas.masalah.length > 0 && (
            <button
              onClick={() => setBukaKualitas((v) => !v)}
              className={cx(
                'tap-sm inline-flex items-center gap-1 rounded border px-1.5 transition',
                kualitas.masalah.some((m) => m.level === 'error')
                  ? 'border-rose-500/35 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20'
                  : 'border-amber-500/35 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20'
              )}
              aria-expanded={bukaKualitas}
            >
              <IconAlert size={10} /> {kualitas.masalah.length} catatan kualitas data
              <IconChevron size={10} className={bukaKualitas ? 'rotate-180' : ''} />
            </button>
          )}
          <a href={SERVICE_SHEET.url} target="_blank" rel="noreferrer" className="tap-sm inline-flex items-center gap-1 font-semibold text-brand/90 hover:text-brand">
            Buka sheet <IconExternal size={10} />
          </a>
        </p>
        {(asal.dariLog > 0 || asal.dariMaster > 0) && (
          <div className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-600/25 bg-teal-600/[0.07] px-3 py-2 text-[11px] text-teal-700/90 sm:mx-4">
            <IconSheet size={12} />
            <span>
              Sheet <span className="font-semibold">tb_service1</span> (Data Service Engine) hanya memuat{' '}
              <span className="font-semibold">{fmt(asal.unitEval)}</span> unit
              {asal.dariLog > 0 && <> · <span className="font-semibold">{fmt(asal.dariLog)}</span> unit dihitung dari catatan tb_service2</>}
              {asal.dariMaster > 0 && <> · <span className="font-semibold">{fmt(asal.dariMaster)}</span> unit master belum pernah service</>}
              . Data diturunkan otomatis agar tidak ada unit yang hilang dari halaman ini.
            </span>
          </div>
        )}

        {bukaKualitas && kualitas.masalah.length > 0 && (
          <div className="mx-3 mb-3 space-y-1.5 rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] p-2.5 sm:mx-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Hasil audit data sheet ({kualitas.totalMasalah} temuan) — perbaiki di spreadsheet, lalu tekan “Sinkron” di header
            </p>
            {kualitas.masalah.map((m) => (
              <div key={m.kode} className="flex items-start gap-2 text-[11px] leading-relaxed">
                <span
                  className={cx(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    m.level === 'error' ? 'bg-rose-400' : 'bg-amber-400'
                  )}
                />
                <span className="min-w-0 flex-1 text-slate-600">
                  {m.pesan}
                  {m.contoh?.length > 0 && (
                    <span className="ml-1 font-mono text-[10px] text-slate-500">· {m.contoh.join(', ')}</span>
                  )}
                </span>
                <span className="shrink-0 rounded bg-slate-900/[0.05] px-1 font-mono text-[10px] text-slate-700">{fmt(m.jumlah)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {galat && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-rose-700">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            {galat} — pastikan spreadsheet “Update ZPAS637” bisa dibuka publik (Share ▸ Anyone with the link ▸ Viewer).
          </span>
        </div>
      )}

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Total Engine" value={fmt(ringkasan.totalUnit)} unit="unit" hint="tb_service1" icon={<IconEngine size={14} />} accent="#0d9488" />
        <Kpi
          label="Lewat Jadwal"
          value={fmt(ringkasan.terlambat)}
          unit="unit"
          hint="Sudah melewati warning date"
          icon={<IconAlert size={14} />}
          accent="#f43f5e"
          onClick={() => setKpiStatus('terlambat')}
        />
        <Kpi
          label="Jatuh Tempo"
          value={fmt(ringkasan.segera)}
          unit="unit"
          hint={`≤ ${7} hari lagi`}
          icon={<IconClock size={14} />}
          accent="#f59e0b"
          onClick={() => setKpiStatus('segera')}
        />
        <Kpi
          label="Belum Service"
          value={fmt(ringkasan.belumService)}
          unit="unit"
          hint="Belum ada catatan service"
          icon={<IconWrench size={14} />}
          accent="#5b6b7c"
          onClick={() => setKpiStatus('belum')}
        />
        <Kpi
          label="Service Bulan Ini"
          value={fmt(ringkasan.serviceBulanIni)}
          unit="kali"
          hint={`dari ${fmt(ringkasan.totalPencatatan)} pencatatan`}
          icon={<IconCheck size={14} />}
          accent="#22c55e"
        />
        <Kpi
          label="Cakupan Service"
          value={`${ringkasan.cakupan}%`}
          hint={`${fmt(ringkasan.sudahService)} dari ${fmt(ringkasan.totalUnit)} engine pernah diservice`}
          icon={<IconCalendar size={14} />}
          accent="#7c3aed"
        />
        <Kpi
          label="Tepat Waktu"
          value={`${ringkasan.ketepatan.pct}%`}
          hint={`${fmt(ringkasan.ketepatan.tepat)} dari ${fmt(ringkasan.ketepatan.dinilai)} service sesuai interval 250 HM`}
          icon={<IconTrend size={14} />}
          accent="#22c55e"
        />
      </div>

      {/* ---------------- aktivitas per bulan ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title={`Aktivitas Bulan ${bulanAktif.acuan.label}`}
          sub={`Bandingkan service ${bulanAktif.lalu.label} (bulan lalu), ${bulanAktif.acuan.label} (bulan ini), dan jadwal ${bulanAktif.depan.label} (bulan depan)`}
          icon={<IconCalendar size={15} />}
          right={
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const i = bulanOpsi.findIndex((b) => b.value === acuanAktif)
                  const n = bulanOpsi[i + 1]
                  if (n) { setAcuan(n.value); setFKohort(null) }
                }}
                disabled={bulanOpsi.findIndex((b) => b.value === acuanAktif) >= bulanOpsi.length - 1}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-900/10 bg-slate-900/[0.03] text-slate-600 transition hover:text-slate-900 disabled:opacity-35"
                aria-label="Bulan sebelumnya"
                title="Bulan sebelumnya"
              >
                <IconChevron size={14} className="rotate-180" />
              </button>
              <label className="sr-only" htmlFor="bulan-acuan">Bulan acuan</label>
              <select
                id="bulan-acuan"
                value={acuanAktif}
                onChange={(e) => { setAcuan(e.target.value); setFKohort(null) }}
                className="rounded-lg border border-brand/40 bg-brand/10 px-2 py-1.5 text-[11.5px] font-semibold text-slate-900 focus:outline-none"
              >
                {bulanOpsi.map((b) => (
                  <option key={b.value} value={b.value} className="bg-white text-slate-900">
                    {b.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const i = bulanOpsi.findIndex((b) => b.value === acuanAktif)
                  const n = bulanOpsi[i - 1]
                  if (n) { setAcuan(n.value); setFKohort(null) }
                }}
                disabled={bulanOpsi.findIndex((b) => b.value === acuanAktif) <= 0}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-900/10 bg-slate-900/[0.03] text-slate-600 transition hover:text-slate-900 disabled:opacity-35"
                aria-label="Bulan berikutnya"
                title="Bulan berikutnya"
              >
                <IconChevron size={14} />
              </button>
            </div>
          }
        />

        <div className="mt-2 grid grid-cols-1 gap-2 px-3 sm:grid-cols-2 sm:px-4 xl:grid-cols-4">
          {[
            {
              id: 'servisLalu',
              judul: `Service ${bulanAktif.lalu.label}`,
              angka: bulanAktif.jumlah.servisLalu,
              sub: `belum diservice lagi di ${bulanAktif.acuan.singkat} · ${bulanAktif.sesiLalu} sesi bulan lalu`,
              accent: '#0d9488',
            },
            {
              id: 'servisIni',
              judul: `Service ${bulanAktif.acuan.label}`,
              angka: bulanAktif.jumlah.servisIni,
              sub: `${bulanAktif.sesiIni} sesi dikerjakan bulan ini`,
              accent: '#22c55e',
            },
            {
              id: 'jadwalIniSemua',
              judul: `Jadwal ${bulanAktif.acuan.label}`,
              angka: bulanAktif.jumlah.jadwalIniSemua,
              sub: bulanAktif.jumlah.jadwalIni
                ? `${bulanAktif.jumlah.jadwalIni} belum dikerjakan`
                : 'semua sudah dikerjakan bulan ini',
              accent: '#f59e0b',
            },
            {
              id: 'jadwalDepanSemua',
              judul: `Jadwal ${bulanAktif.depan.label}`,
              angka: bulanAktif.jumlah.jadwalDepanSemua,
              sub: bulanAktif.jumlah.jadwalDepan
                ? `${bulanAktif.jumlah.jadwalDepan} belum diservice bulan ini`
                : 'sudah diservice bulan ini, jadwal berikutnya bulan depan',
              accent: '#7c3aed',
            },
          ].map((t) => {
            const m = kohortMeta(t.id)
            const aktif = fKohort === t.id
            return (
              <button
                key={t.id}
                onClick={() => { setFKohort(aktif ? null : t.id); setHalEval(0) }}
                className={cx(
                  'group relative min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition',
                  aktif ? 'border-brand/60 bg-brand/[0.10]' : 'border-slate-900/[0.10] bg-slate-900/[0.02] hover:border-slate-900/15'
                )}
                title={`Tampilkan ${t.judul.toLowerCase()} di tabel evaluasi`}
              >
                <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-[0.18] blur-2xl" style={{ background: t.accent }} />
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                  <span className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">{t.judul}</span>
                </span>
                <span className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-[22px] font-semibold leading-none text-slate-900">{fmt(t.angka)}</span>
                  <span className="text-[10px] text-slate-500">engine</span>
                </span>
                <span className="mt-1 block truncate text-[10px] text-slate-500">{t.sub}</span>
                <span
                  className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.05]"
                  aria-hidden="true"
                >
                  <span
                    className="h-full rounded-full transition-all"
                    style={{ width: `${units.length ? Math.round((t.angka / units.length) * 100) : 0}%`, background: m.color }}
                  />
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-3 text-[10px] text-slate-500 sm:px-4">
          <span>
            <span className="font-mono text-slate-700">{fmt(bulanAktif.jumlah.servisLalu + bulanAktif.jumlah.servisIni)}</span> engine tercatat diservice bulan lalu + bulan ini ·
            <span className="ml-1 font-mono text-slate-700">{fmt(bulanAktif.jumlah.lain)}</span> di luar 3 kategori
          </span>
          {fKohort && (
            <button
              onClick={() => setFKohort(null)}
              className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand/10 px-1.5 py-0.5 font-semibold text-brand hover:bg-brand/20"
            >
              Filter:{' '}
              {fKohort === 'jadwalIniSemua'
                ? `Jadwal ${bulanAktif.acuan.label}`
                : fKohort === 'jadwalDepanSemua'
                ? `Jadwal ${bulanAktif.depan.label}`
                : kohortMeta(fKohort).label}{' '}
              <IconX size={10} />
            </button>
          )}
          <span className="hidden sm:inline">Klik kartu untuk menyaring tabel evaluasi di bawah.</span>
        </div>
      </Card>

      {/* ---------------- grafik ---------------- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader
            title="Komposisi Status"
            sub={`Kondisi per ${bulanRingkas.refLabel}${bulanRingkas.bulanBerjalan ? ' (bulan berjalan)' : ''}`}
            icon={<IconWrench size={15} />}
            right={
              <span className="hidden rounded-md border border-slate-900/10 bg-slate-900/[0.03] px-1.5 py-0.5 text-[9.5px] text-slate-600 sm:inline">
                {bulanAktif.acuan.label}
              </span>
            }
          />
          <div className="px-3 pb-4 pt-2">
            {bulanRingkas.totalUnit ? (
              <Donut
                data={donutData}
                height={210}
                showLegend={false}
                centerValue={fmt(bulanRingkas.totalUnit)}
                centerLabel="engine"
                onSlice={(name) => {
                  const s = SERVICE_STATUS.find((x) => x.label === name)
                  if (s) {
                    setFKode({ label: `${s.label} · ${bulanAktif.acuan.singkat}`, set: bulanRingkas.setsStatus[s.id] || new Set() })
                    setHalEval(0)
                  }
                }}
              />
            ) : (
              <Empty title="Belum ada data" desc="Tarik data dari sheet untuk melihat komposisi status." />
            )}
            <div className="mt-3 space-y-1.5">
              {SERVICE_STATUS.map((s) => {
                const n = bulanRingkas.byStatus[s.id] || 0
                const pct = bulanRingkas.totalUnit ? Math.round((n / bulanRingkas.totalUnit) * 100) : 0
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setFKode({ label: `${s.label} · ${bulanAktif.acuan.singkat}`, set: bulanRingkas.setsStatus[s.id] || new Set() })
                      setHalEval(0)
                    }}
                    className="flex min-h-8 w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-slate-900/[0.04]"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">{s.label}</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-800">{n}</span>
                    <span className="w-9 text-right font-mono text-[10px] text-slate-500">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader
            title="Tren Service Engine"
            sub="Per bulan, dari sheet “Monitor Kasie FS” (tb_service2)"
            icon={<IconTrend size={15} />}
            right={<span className="hidden rounded-md border border-slate-900/10 bg-slate-900/[0.03] px-1.5 py-0.5 text-[9.5px] text-slate-600 sm:inline">interval target 250 HM</span>}
          />
          <div className="px-1 pb-3 pt-2">
            <TrenServiceChart data={ringkasan.perBulan} height={250} />
          </div>
        </Card>
      </div>

      {/* ---------------- analitik service ---------------- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader
            title="Cakupan per Divisi"
            sub={`Status tiap posisi per ${bulanRingkas.refLabel}`}
            icon={<IconEngine size={15} />}
          />
          <div className="px-2 pb-3 pt-2">
            <DivisiCakupanChart
              data={bulanRingkas.perPosisi}
              height={168}
              onPick={(posisi) => {
                setFPosisi([posisi])
                setFStatus([])
                setHalEval(0)
              }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader
            title="Sebaran Urgensi"
            sub={`Sisa hari menuju warning date per ${bulanRingkas.refLabel}`}
            icon={<IconAlert size={15} />}
          />
          <div className="px-1 pb-3 pt-2">
            <UrgensiChart
              data={bulanRingkas.urgensi}
              height={168}
              onClickEmber={(id) => {
                const map = { lewat30: 'terlambat', lewat8: 'terlambat', lewat7: 'terlambat', tempo: 'segera', aman30: 'aman', aman: 'aman' }
                const label = (URGENSI.find((e) => e.id === id)?.label || id)
                setFKode({ label: `${label} · ${bulanAktif.acuan.singkat}`, set: bulanRingkas.setsUrgensi[id] || new Set() })
                setHalEval(0)
              }}
            />
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="10 Paling Terlambat" sub={`Hari lewat warning date per ${bulanRingkas.refLabel}`} icon={<IconWrench size={15} />} />
          <div className="px-1 pb-3 pt-2">
            <TopTerlambatChart
              data={bulanRingkas.topTerlambat}
              height={214}
              onPick={(kode) => {
                const u = units.find((x) => x.kode === kode)
                if (u) setDetailUnit(u)
              }}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader
            title="Ringkasan Ketepatan Interval"
            sub={
              bulanRingkas.ketepatan.dinilai
                ? `Selisih HM antar service unit · ${bulanAktif.acuan.label}`
                : `Belum ada service tercatat pada ${bulanAktif.acuan.label}`
            }
          />
          <div className="px-3 pb-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="relative grid h-[86px] w-[86px] shrink-0 place-items-center">
                <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={bulanRingkas.ketepatan.pct >= 70 ? '#22c55e' : bulanRingkas.ketepatan.pct >= 40 ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeDasharray={`${(bulanRingkas.ketepatan.pct / 100) * 97.4} 97.4`}
                  />
                </svg>
                <div className="text-center">
                  <p className="font-mono text-[15px] font-semibold text-slate-900">{bulanRingkas.ketepatan.pct}%</p>
                  <p className="text-[8.5px] uppercase tracking-wider text-slate-500">tepat</p>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {[
                  ['Tepat 225–275 HM', bulanRingkas.ketepatan.tepat, '#22c55e'],
                  ['Terlambat > 275 HM', bulanRingkas.ketepatan.telat, '#f43f5e'],
                  ['Lebih awal < 225 HM', bulanRingkas.ketepatan.awal, '#0d9488'],
                ].map(([label, n, color]) => (
                  <div key={label} className="flex items-center gap-1.5 text-[10.5px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{label}</span>
                    <span className="font-mono font-semibold text-slate-800">{n}</span>
                  </div>
                ))}
                <p className="pt-0.5 text-[9.5px] leading-relaxed text-slate-500">
                  Rata-rata selisih HM <span className="font-mono text-slate-700">{bulanRingkas.ketepatan.rata ?? '—'}</span> ·
                  {' '}{bulanRingkas.ketepatan.dikecualikan} baris HM janggal tidak dihitung
                </p>
              </div>
            </div>

            {/* sebaran selisih HM per service */}
            <div className="mt-3">
              <p className="mb-1 text-[9.5px] uppercase tracking-wider text-slate-500">Sebaran selisih HM antar service</p>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-900/[0.04]">
                {(bulanRingkas.ketepatan.sebaran || []).map((e) => (
                  <div
                    key={e.id}
                    title={`${e.label} HM: ${e.jumlah} service`}
                    style={{
                      width: `${bulanRingkas.ketepatan.dinilai ? (e.jumlah / bulanRingkas.ketepatan.dinilai) * 100 : 0}%`,
                      background: e.color,
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                {(bulanRingkas.ketepatan.sebaran || []).map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 text-[9px] text-slate-500">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                    {e.label} <span className="font-mono text-slate-700">{e.jumlah}</span>
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500">
                Target sheet: service tiap <span className="text-slate-700">250 HM</span>. Selisih di bawah 225 HM berarti
                service dilakukan lebih awal (biaya perawatan naik), di atas 275 HM berarti terlambat (risiko kerusakan).
              </p>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader
            title="Peta Minggu Service"
            sub={`Service ${bulanAktif.acuan.label} per minggu ke-1 s/d 5 · ${bulanRingkas.sesiBulan} pencatatan`}
          />
          <div className="px-3 pb-3 pt-2">
            <PetaMingguService log={bulanRingkas.logBulan} />
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500">
              Angka = jumlah pencatatan service pada minggu tersebut. Berguna untuk menyusun jadwal regu per minggu.
            </p>
          </div>
        </Card>
      </div>

      {/* ---------------- perhatian ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Perlu Perhatian"
          sub="Engine yang harus didahulukan sebelum musim kemarau"
          icon={<IconAlert size={15} />}
          right={
            <div className="hidden sm:block">
              <Segmented value={tabPerhatian} onChange={setTabPerhatian} size="sm" options={perhatianTabs.slice(0, 4)} />
            </div>
          }
        />
        <div className="mt-2 px-3 sm:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {perhatianTabs.map((t) => (
              <button
                key={t.value}
                onClick={() => setTabPerhatian(t.value)}
                className={cx(
                  'shrink-0 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition max-sm:min-h-9',
                  tabPerhatian === t.value ? 'border-brand/50 bg-brand/15 text-slate-900' : 'border-slate-900/10 bg-slate-900/[0.02] text-slate-600'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 divide-y divide-slate-900/[0.06]">
          {barisPerhatian.map((u) => {
            const m = serviceStatusMeta(u.status)
            return (
              <button
                key={u.kode}
                onClick={() => setDetailUnit(u)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-900/[0.03] sm:px-4"
              >
                <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[12.5px] font-semibold text-slate-900">{u.kode}</span>
                    <span className="rounded bg-slate-900/[0.05] px-1 py-0.5 text-[9.5px] text-slate-600">{u.jenis}</span>
                    <span className="rounded bg-slate-900/[0.05] px-1 py-0.5 text-[9.5px] text-slate-600">{u.posisi}</span>
                    {u.note && <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9.5px] text-amber-700">{u.note}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] text-slate-500">
                    {u.status === 'belum'
                      ? 'Belum ada catatan service di tb_service2'
                      : u.status === 'tanpaJadwal'
                      ? `Service terakhir ${u.terakhirIso || '—'} · HM ${fmt(u.hm)} · rerata HM/hari kosong di sheet`
                      : `Jadwal ${u.nextIso} · HM ${fmt(u.nextHm)} · ${hariTeks(u.sisaHari)}`}
                  </span>
                </span>
                <span className={cx('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold', m.cls)}>{m.short}</span>
                <IconChevron size={14} className="shrink-0 text-slate-400" />
              </button>
            )
          })}
          {!barisPerhatian.length && <Empty title="Tidak ada unit di kategori ini" desc="Semua engine pada kategori ini sudah beres." icon={<IconCheck size={18} />} />}
        </div>

        {daftarPerhatian.length > perPerhatian && (
          <Pager
            page={halPerhatianAman}
            total={daftarPerhatian.length}
            perPage={perPerhatian}
            onPage={setHalPerhatian}
            onPerPage={() => {}}
            label="Perhatian"
          />
        )}
      </Card>

      {/* ---------------- tabel evaluasi ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Evaluasi Service Engine"
          sub={`${filtered.length} dari ${units.length} engine · tb_service1`}
          icon={<IconEngine size={15} />}
        />
        {fKode?.set && (
          <div className="mt-3 flex flex-wrap items-center gap-2 px-3 text-[10px] sm:px-4">
            <button
              onClick={() => setFKode(null)}
              className="inline-flex items-center gap-1 rounded-md border border-brand/40 bg-brand/10 px-1.5 py-0.5 font-semibold text-brand hover:bg-brand/20"
            >
              Dari grafik: {fKode.label} ({fKode.set.size}) <IconX size={10} />
            </button>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 px-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari kode unit / catatan…"
              className="w-full rounded-xl border border-slate-900/10 bg-white py-2 pl-8 pr-3 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-brand/50 focus:outline-none"
            />
          </div>
          <MultiSelect label="Posisi" value={fPosisi} onChange={setFPosisi} options={opsiPosisi} placeholder="Semua posisi" />
          <MultiSelect label="Jenis" value={fJenis} onChange={setFJenis} options={opsiJenis} placeholder="Semua jenis" />
          <MultiSelect
            label="Status"
            value={fStatus}
            onChange={setFStatus}
            options={SERVICE_STATUS.map((s) => s.id)}
            placeholder="Semua status"
            counts={ringkasan.byStatus}
          />
          <select value={urut} onChange={(e) => setUrut(e.target.value)} className="input !py-2 !text-[12px] sm:w-[190px]">
            <option value="telat" className="bg-white">Urut: paling telat</option>
            <option value="dekat" className="bg-white">Urut: jadwal terdekat</option>
            <option value="hm" className="bg-white">Urut: HM terbesar</option>
            <option value="kode" className="bg-white">Urut: kode unit</option>
          </select>
        </div>

        {memuat && !units.length ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : (
          <>
            {/* HP: kartu */}
            <div className="mt-3 space-y-2 px-3 sm:hidden">
              {barisEval.map((u) => {
                const m = serviceStatusMeta(u.status)
                return (
                  <button key={u.kode} onClick={() => setDetailUnit(u)} className="w-full rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] p-2.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] font-semibold text-slate-900">{u.kode}</p>
                        <p className="mt-0.5 text-[10.5px] text-slate-500">{u.jenis} · {u.posisi} · {u.note || `interval ${INTERVAL_HM} HM`}</p>
                      </div>
                      <span className={cx('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold', m.cls)}>{m.short}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {(() => {
                        const info = bulanAktif.perUnit.get(u.kode)
                        const km = kohortMeta(info?.kohort)
                        const lab = labelAktivitas(info, bulanAktif)
                        return lab === '—' ? null : (
                          <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-semibold', km.cls)}>{lab}</span>
                        )
                      })()}
                      {(() => {
                        const info = bulanAktif.perUnit.get(u.kode)
                        if (info?.servisIni) return <span className="rounded bg-slate-900/[0.04] px-1.5 py-0.5 text-[9.5px] text-slate-600">{info.servisIni}× service {bulanAktif.acuan.singkat}</span>
                        if (info?.servisLalu) return <span className="rounded bg-slate-900/[0.04] px-1.5 py-0.5 text-[9.5px] text-slate-600">{info.servisLalu}× service {bulanAktif.lalu.singkat}</span>
                        return null
                      })()}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Terakhir</p>
                        <p className="font-mono text-[11px] text-slate-800">{u.terakhirIso || 'Belum'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Next</p>
                        <p className="font-mono text-[11px] text-slate-800">{u.nextIso || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Sisa</p>
                        <p className={cx('font-mono text-[11px]', (u.sisaHari ?? 99) <= 0 ? 'text-rose-600' : 'text-slate-800')}>{hariTeks(u.sisaHari)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <MingguChips mingguBulan={u.mingguBulan} />
                      <span className="font-mono text-[10.5px] text-slate-500">HM {fmt(u.hm)}</span>
                    </div>
                  </button>
                )
              })}
              {!barisEval.length && <Empty title="Tidak ada unit" desc="Ubah filter atau kata kunci pencarian." />}
            </div>

            {/* desktop: tabel */}
            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-y border-slate-900/[0.10] bg-slate-900/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2 font-semibold">Kode Unit</th>
                    <th className="px-2 py-2 font-semibold">Posisi</th>
                    <th className="px-2 py-2 font-semibold">Service Terakhir</th>
                    <th className="px-2 py-2 text-right font-semibold">HM</th>
                    <th className="px-2 py-2 font-semibold">Next Service</th>
                    <th className="px-2 py-2 text-right font-semibold">Next HM</th>
                    <th className="px-2 py-2 font-semibold">Sisa / Telat</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Aktivitas {bulanAktif.acuan.singkat}</th>
                    <th className="px-2 py-2 font-semibold">Minggu Service</th>
                    <th className="px-4 py-2 font-semibold">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/[0.06]">
                  {barisEval.map((u) => (
                    <tr key={u.kode} className="cursor-pointer transition hover:bg-slate-900/[0.03]" onClick={() => setDetailUnit(u)}>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[12px] font-semibold text-slate-900">{u.kode}</span>
                        <span className="ml-1.5 rounded bg-slate-900/[0.05] px-1 py-0.5 text-[9.5px] text-slate-600">{u.jenis}</span>
                      </td>
                      <td className="px-2 py-2 text-[11.5px] text-slate-700">{u.posisi || '—'}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-700">{u.terakhirIso || 'Belum pernah'}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-800">{fmt(u.hm)}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-700">{u.nextIso || '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-600">{fmt(u.nextHm)}</td>
                      <td className="px-2 py-2">
                        <span className={cx('font-mono text-[11px]', u.sisaHari == null ? 'text-slate-500' : u.sisaHari <= 0 ? 'text-rose-600' : u.sisaHari <= 7 ? 'text-amber-700' : 'text-emerald-700')}>
                          {hariTeks(u.sisaHari)}
                        </span>
                      </td>
                      <td className="px-2 py-2"><StatusPill id={u.status} /></td>
                      <td className="px-2 py-2">
                        {(() => {
                          const info = bulanAktif.perUnit.get(u.kode)
                          const km = kohortMeta(info?.kohort)
                          return (
                            <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', km.cls)}>
                              {labelAktivitas(info, bulanAktif)}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-2 py-2"><MingguChips mingguBulan={u.mingguBulan} /></td>
                      <td className="px-4 py-2 text-[11px] text-slate-600">{u.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!barisEval.length && <Empty title="Tidak ada unit" desc="Ubah filter atau kata kunci pencarian." />}
            </div>

            <Pager page={halEvalAman} total={filtered.length} perPage={perEval} onPage={setHalEval} onPerPage={setPerEval} label="Baris" />
          </>
        )}
      </Card>

      {/* ---------------- riwayat pencatatan ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Riwayat Pencatatan Service"
          sub={`${logFiltered.length} baris · sheet “${SERVICE_SHEET.logSheet}” (${SERVICE_SHEET.logTable})${
            ringkasan.hmJanggal ? ` · ${ringkasan.hmJanggal} baris HM janggal (perlu dicek)` : ''
          }`}
          icon={<IconSheet size={15} />}
          right={
            <a href={SERVICE_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !text-[11px]">
              <IconExternal size={12} /> Buka sheet
            </a>
          }
        />
        <div className="mt-3 flex flex-col gap-2 px-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={cariLog}
              onChange={(e) => setCariLog(e.target.value)}
              placeholder="Cari kode mesin…"
              className="w-full rounded-xl border border-slate-900/10 bg-white py-2 pl-8 pr-3 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-brand/50 focus:outline-none"
            />
          </div>
          <MultiSelect label="Posisi" value={fPosisiLog} onChange={setFPosisiLog} options={[...new Set(log.map((r) => r.posisi))].sort()} placeholder="Semua posisi" />
          <MultiSelect label="Bulan" value={fBulanLog} onChange={setFBulanLog} options={opsiBulan} placeholder="Semua bulan" />
        </div>

        <div className="mt-2 divide-y divide-slate-900/[0.06]">
          {barisLog.map((r, i) => {
            const u = units.find((x) => x.kode === r.kode)
            return (
              <button
                key={`${r.tanggal}-${r.no}-${i}`}
                onClick={() => u && setDetailUnit(u)}
                className={cx('flex w-full items-center gap-2 px-3 py-2.5 text-left transition sm:px-4', u ? 'hover:bg-slate-900/[0.03]' : 'cursor-default')}
              >
                <span className="w-[68px] shrink-0 font-mono text-[11px] text-slate-700">{r.tanggal || '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[12px] font-semibold text-slate-900">{r.kode}</span>
                  <span className="ml-1.5 text-[10px] text-slate-500">{r.posisi || '—'} · {r.bulan} · minggu {r.minggu ?? '—'}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[11.5px] font-semibold text-slate-900">HM {fmt(r.hm)}</span>
                  {r.hmDelta != null && (
                    <span className={cx('block font-mono text-[9.5px]', r.hmAnomali ? 'text-amber-600/90' : 'text-emerald-600/80')}>
                      {r.hmAnomali ? '⚠ ' : ''}+{fmt(r.hmDelta)} HM
                    </span>
                  )}
                </span>
              </button>
            )
          })}
          {!barisLog.length && <Empty title="Belum ada pencatatan" desc="Catat service pertama dengan tombol “Catat Service”." icon={<IconWrench size={18} />} />}
        </div>

        <Pager page={halLogAman} total={logFiltered.length} perPage={perLog} onPage={setHalLog} onPerPage={setPerLog} label="Riwayat" />
      </Card>

      <ServiceForm
        open={formOpen}
        units={units}
        log={log}
        presetKode={presetKode}
        onClose={() => setFormOpen(false)}
        onSubmit={simpanService}
        notify={notify}
      />
      <ServiceStatusModal
        statusId={kpiStatus}
        units={kpiStatus ? ringkasan.daftar[kpiStatus] || [] : []}
        totalUnit={ringkasan.totalUnit}
        onClose={() => setKpiStatus(null)}
        onPick={(u) => {
          setKpiStatus(null)
          setDetailUnit(u)
        }}
        onFilter={(id) => {
          setFKode(null)
          setFStatus([id])
          setHalEval(0)
          setKpiStatus(null)
          notify?.({ type: 'success', message: `Tabel disaring ke status “${serviceStatusMeta(id).label}”.` })
        }}
      />
      <ServiceDetail unit={detailUnit} log={log} onClose={() => setDetailUnit(null)} onCatat={(u) => bukaForm(u.kode)} />
    </div>
  )
}

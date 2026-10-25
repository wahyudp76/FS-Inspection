import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
import { Card, CardHeader, Kpi, Empty, Segmented, MultiSelect, Skeleton } from '../components/ui'
import { TipBox, Donut } from '../components/charts'
import ServiceForm from '../components/ServiceForm'
import ServiceDetail from '../components/ServiceDetail'
import { cx, relativeTime } from '../lib/analytics'
import { SERVICE_SHEET, SERVICE_STATUS, serviceStatusMeta } from '../lib/config'
import {
  fetchServiceData,
  readServiceCache,
  ringkasService,
  catatService,
  tarikSetelahCatat,
  INTERVAL_HM,
} from '../lib/service'
import {
  IconWrench, IconRefresh, IconDownload, IconAlert, IconCheck, IconClock, IconCalendar,
  IconEngine, IconSearch, IconChevron, IconExternal, IconSheet,
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
    <div className="flex flex-col gap-2 border-t border-white/[0.06] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span>
          {label}: <span className="font-semibold text-slate-300">{total ? aman * perPage + 1 : 0}–{Math.min(total, (aman + 1) * perPage)}</span> dari {total}
        </span>
        <span className="hidden sm:inline text-slate-600">·</span>
        <label className="hidden items-center gap-1.5 sm:flex">
          Baris
          <select
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-ink-900 px-1.5 py-0.5 text-[11px] text-slate-200"
          >
            {[10, 20, 50].map((n) => <option key={n} value={n} className="bg-ink-800">{n}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <select
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
          className="rounded-md border border-white/10 bg-ink-900 px-1.5 py-1 text-[11px] text-slate-200 sm:hidden"
        >
          {[10, 20, 50].map((n) => <option key={n} value={n} className="bg-ink-800">{n} / hal</option>)}
        </select>
        <button
          onClick={() => onPage(Math.max(0, aman - 1))}
          disabled={aman <= 0}
          className="btn-ghost !px-2 !py-1 !text-[11px] disabled:opacity-40"
          aria-label="Halaman sebelumnya"
        >
          <IconChevron size={13} className="rotate-180" /> Sebelumnya
        </button>
        <span className="min-w-[52px] text-center font-mono text-[11px] text-slate-400">
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
  if (!items.length) return <span className="text-[11px] text-slate-600">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([b, w]) => (
        <span key={b} className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-300">
          {b.slice(0, 3)} M{w}
        </span>
      ))}
    </div>
  )
}

export default function Service({ notify, openFormSignal = 0 }) {
  const cached = useMemo(() => readServiceCache(), [])
  const [units, setUnits] = useState(cached?.units || [])
  const [log, setLog] = useState(cached?.log || [])
  const [syncedAt, setSyncedAt] = useState(cached?.syncedAt || null)
  const [memuat, setMemuat] = useState(!cached)
  const [galat, setGalat] = useState('')

  /* evaluasi / tabel */
  const [fPosisi, setFPosisi] = useState([])
  const [fJenis, setFJenis] = useState([])
  const [fStatus, setFStatus] = useState([])
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

  const ringkasan = useMemo(() => ringkasService(units, log), [units, log])

  const muat = useCallback(
    async ({ diam = false } = {}) => {
      if (!diam) setMemuat(true)
      try {
        const data = await fetchServiceData()
        setUnits(data.units)
        setLog(data.log)
        setSyncedAt(data.syncedAt)
        setGalat('')
      } catch (e) {
        setGalat(e?.message || 'Gagal menarik data service dari Google Sheets.')
      } finally {
        setMemuat(false)
      }
    },
    []
  )

  useEffect(() => {
    muat()
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
    if (q) rows = rows.filter((u) => u.kode.includes(q) || (u.note || '').toUpperCase().includes(q))
    const bobot = { terlambat: 0, segera: 1, tanpaJadwal: 2, belum: 3, aman: 4 }
    const salin = [...rows]
    if (urut === 'telat') salin.sort((a, b) => (bobot[a.status] - bobot[b.status]) || ((b.warning ?? -999) - (a.warning ?? -999)))
    else if (urut === 'dekat') salin.sort((a, b) => ((a.sisaHari ?? 9999) - (b.sisaHari ?? 9999)))
    else if (urut === 'kode') salin.sort((a, b) => a.kode.localeCompare(b.kode))
    else if (urut === 'hm') salin.sort((a, b) => (b.hm ?? -1) - (a.hm ?? -1))
    return salin
  }, [units, fPosisi, fJenis, fStatus, cari, urut])

  const totalHalamanEval = Math.max(1, Math.ceil(filtered.length / perEval))
  const halEvalAman = Math.min(halEval, totalHalamanEval - 1)
  const barisEval = filtered.slice(halEvalAman * perEval, halEvalAman * perEval + perEval)

  useEffect(() => { setHalEval(0) }, [fPosisi, fJenis, fStatus, cari, urut, perEval])

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
      setSyncedAt(segar.syncedAt)
    } else {
      await muat({ diam: true })
    }
    return { ...hasil, verified: hasil.verified !== false, eval: hasil.evaluasi || null, ditemukan: segar?.ditemukan }
  }

  const unduhCsv = () => {
    const header = ['Kode Unit', 'Jenis', 'Posisi', 'Service Terakhir', 'HM Terakhir', 'Next Service', 'Next HM', 'Warning (hari)', 'Status', 'Catatan']
    const baris = filtered.map((u) => [
      u.kode, u.jenis, u.posisi, u.terakhirIso, u.hm ?? '', u.nextIso, u.nextHm ?? '', u.warning ?? '',
      serviceStatusMeta(u.status).label, u.note || '',
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

  const donutData = SERVICE_STATUS.filter((s) => (ringkasan.byStatus[s.id] || 0) > 0).map((s) => ({
    name: s.label,
    value: ringkasan.byStatus[s.id],
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
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
              <IconWrench size={16} className="text-brand" /> Evaluasi Service Engine
            </h2>
            <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-relaxed text-slate-500">
              Ringkasan dari <span className="text-slate-300">{SERVICE_SHEET.evalTable}</span> (sheet “{SERVICE_SHEET.evalSheet}”):
              engine mana yang belum diservice, sudah lewat warning date, atau jatuh tempo. Pencatatan service masuk ke{' '}
              <span className="text-slate-300">{SERVICE_SHEET.logTable}</span> (sheet “{SERVICE_SHEET.logSheet}”).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bukaForm('')} className="btn-primary !px-3 !py-2 !text-[12px]">
              <IconWrench size={14} /> Catat Service
            </button>
            <button onClick={() => muat()} className="btn-ghost !px-3 !py-2 !text-[12px]" disabled={memuat}>
              <IconRefresh size={13} className={memuat ? 'animate-spin' : ''} /> Tarik dari Sheet
            </button>
            <button onClick={unduhCsv} className="btn-ghost !px-3 !py-2 !text-[12px]">
              <IconDownload size={13} /> CSV
            </button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <IconClock size={11} /> {syncedAt ? `Terakhir ditarik ${relativeTime(syncedAt)}` : 'Belum pernah ditarik'}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconEngine size={11} /> {fmt(ringkasan.totalUnit)} engine · {fmt(ringkasan.totalPencatatan)} pencatatan service
          </span>
          <a href={SERVICE_SHEET.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand/90 hover:text-brand">
            Buka sheet <IconExternal size={10} />
          </a>
        </p>
      </Card>

      {galat && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-rose-200">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            {galat} — pastikan spreadsheet “Update ZPAS637” bisa dibuka publik (Share ▸ Anyone with the link ▸ Viewer).
          </span>
        </div>
      )}

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Total Engine" value={fmt(ringkasan.totalUnit)} unit="unit" hint="tb_service1" icon={<IconEngine size={14} />} accent="#38bdf8" />
        <Kpi
          label="Lewat Jadwal"
          value={fmt(ringkasan.terlambat)}
          unit="unit"
          hint="Sudah melewati warning date"
          icon={<IconAlert size={14} />}
          accent="#f43f5e"
          onClick={() => { setTabPerhatian('terlambat'); setFStatus(['terlambat']) }}
        />
        <Kpi
          label="Jatuh Tempo"
          value={fmt(ringkasan.segera)}
          unit="unit"
          hint={`≤ ${7} hari lagi`}
          icon={<IconClock size={14} />}
          accent="#f59e0b"
          onClick={() => { setTabPerhatian('segera'); setFStatus(['segera']) }}
        />
        <Kpi
          label="Belum Service"
          value={fmt(ringkasan.belumService)}
          unit="unit"
          hint="Belum ada catatan service"
          icon={<IconWrench size={14} />}
          accent="#94a3b8"
          onClick={() => { setTabPerhatian('belum'); setFStatus(['belum']) }}
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
          accent="#a78bfa"
        />
      </div>

      {/* ---------------- grafik ---------------- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader title="Komposisi Status" sub="Kesiapan engine menghadapi musim kemarau" icon={<IconWrench size={15} />} />
          <div className="px-3 pb-4 pt-2">
            {ringkasan.totalUnit ? (
              <Donut
                data={donutData}
                height={210}
                showLegend={false}
                centerValue={fmt(ringkasan.totalUnit)}
                centerLabel="engine"
                onSlice={(name) => {
                  const s = SERVICE_STATUS.find((x) => x.label === name)
                  if (s) { setFStatus([s.id]); setHalEval(0) }
                }}
              />
            ) : (
              <Empty title="Belum ada data" desc="Tarik data dari sheet untuk melihat komposisi status." />
            )}
            <div className="mt-3 space-y-1.5">
              {SERVICE_STATUS.map((s) => {
                const n = ringkasan.byStatus[s.id] || 0
                const pct = ringkasan.totalUnit ? Math.round((n / ringkasan.totalUnit) * 100) : 0
                return (
                  <button
                    key={s.id}
                    onClick={() => { setFStatus([s.id]); setHalEval(0) }}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-white/[0.04]"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{s.label}</span>
                    <span className="font-mono text-[11px] font-semibold text-slate-200">{n}</span>
                    <span className="w-9 text-right font-mono text-[10px] text-slate-500">{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Status per Posisi" sub="PG2 · OP2 · FM3 · FM4" />
          <div className="px-1 pb-3 pt-2">
            {ringkasan.perPosisi.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ringkasan.perPosisi} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
                  <XAxis dataKey="posisi" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
                  <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="terlambat" name="Lewat" stackId="a" fill="#f43f5e" />
                  <Bar dataKey="segera" name="Tempo" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="aman" name="Aman" stackId="a" fill="#22c55e" />
                  <Bar dataKey="tanpaJadwal" name="HM?" stackId="a" fill="#a78bfa" />
                  <Bar dataKey="belum" name="Belum" stackId="a" fill="#475569" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="Belum ada data" />
            )}
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Volume Service" sub="Pencatatan per bulan (tb_service2)" />
          <div className="px-1 pb-3 pt-2">
            {ringkasan.perBulan.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ringkasan.perBulan} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" service" />} />
                  <Bar dataKey="sesi" name="Service" radius={[4, 4, 0, 0]} fill="#38bdf8">
                    {ringkasan.perBulan.map((_, i) => (
                      <Cell key={i} fill={i === ringkasan.perBulan.length - 1 ? '#38bdf8' : 'rgba(56,189,248,0.45)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="Belum ada pencatatan" />
            )}
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
                  'shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition',
                  tabPerhatian === t.value ? 'border-brand/50 bg-brand/15 text-white' : 'border-white/10 bg-white/[0.02] text-slate-400'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 divide-y divide-white/[0.05]">
          {barisPerhatian.map((u) => {
            const m = serviceStatusMeta(u.status)
            return (
              <button
                key={u.kode}
                onClick={() => setDetailUnit(u)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.03] sm:px-4"
              >
                <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[12.5px] font-semibold text-white">{u.kode}</span>
                    <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[9.5px] text-slate-400">{u.jenis}</span>
                    <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[9.5px] text-slate-400">{u.posisi}</span>
                    {u.note && <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9.5px] text-amber-300">{u.note}</span>}
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
                <IconChevron size={14} className="shrink-0 text-slate-600" />
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
        <div className="mt-3 flex flex-col gap-2 px-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
          <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
            <IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari kode unit / catatan…"
              className="w-full rounded-xl border border-white/10 bg-ink-900/80 py-2 pl-8 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-brand/50 focus:outline-none"
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
            <option value="telat" className="bg-ink-800">Urut: paling telat</option>
            <option value="dekat" className="bg-ink-800">Urut: jadwal terdekat</option>
            <option value="hm" className="bg-ink-800">Urut: HM terbesar</option>
            <option value="kode" className="bg-ink-800">Urut: kode unit</option>
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
                  <button key={u.kode} onClick={() => setDetailUnit(u)} className="w-full rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[13px] font-semibold text-white">{u.kode}</p>
                        <p className="mt-0.5 text-[10.5px] text-slate-500">{u.jenis} · {u.posisi} · {u.note || `interval ${INTERVAL_HM} HM`}</p>
                      </div>
                      <span className={cx('shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold', m.cls)}>{m.short}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Terakhir</p>
                        <p className="font-mono text-[11px] text-slate-200">{u.terakhirIso || 'Belum'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Next</p>
                        <p className="font-mono text-[11px] text-slate-200">{u.nextIso || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">Sisa</p>
                        <p className={cx('font-mono text-[11px]', (u.sisaHari ?? 99) <= 0 ? 'text-rose-300' : 'text-slate-200')}>{hariTeks(u.sisaHari)}</p>
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
                  <tr className="border-y border-white/[0.07] bg-white/[0.02] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2 font-semibold">Kode Unit</th>
                    <th className="px-2 py-2 font-semibold">Posisi</th>
                    <th className="px-2 py-2 font-semibold">Service Terakhir</th>
                    <th className="px-2 py-2 text-right font-semibold">HM</th>
                    <th className="px-2 py-2 font-semibold">Next Service</th>
                    <th className="px-2 py-2 text-right font-semibold">Next HM</th>
                    <th className="px-2 py-2 font-semibold">Sisa / Telat</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Minggu Service</th>
                    <th className="px-4 py-2 font-semibold">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {barisEval.map((u) => (
                    <tr key={u.kode} className="cursor-pointer transition hover:bg-white/[0.03]" onClick={() => setDetailUnit(u)}>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[12px] font-semibold text-white">{u.kode}</span>
                        <span className="ml-1.5 rounded bg-white/[0.06] px-1 py-0.5 text-[9.5px] text-slate-400">{u.jenis}</span>
                      </td>
                      <td className="px-2 py-2 text-[11.5px] text-slate-300">{u.posisi || '—'}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{u.terakhirIso || 'Belum pernah'}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-200">{fmt(u.hm)}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{u.nextIso || '—'}</td>
                      <td className="px-2 py-2 text-right font-mono text-[11px] text-slate-400">{fmt(u.nextHm)}</td>
                      <td className="px-2 py-2">
                        <span className={cx('font-mono text-[11px]', u.sisaHari == null ? 'text-slate-500' : u.sisaHari <= 0 ? 'text-rose-300' : u.sisaHari <= 7 ? 'text-amber-300' : 'text-emerald-300')}>
                          {hariTeks(u.sisaHari)}
                        </span>
                      </td>
                      <td className="px-2 py-2"><StatusPill id={u.status} /></td>
                      <td className="px-2 py-2"><MingguChips mingguBulan={u.mingguBulan} /></td>
                      <td className="px-4 py-2 text-[11px] text-slate-400">{u.note || '—'}</td>
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
              className="w-full rounded-xl border border-white/10 bg-ink-900/80 py-2 pl-8 pr-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-brand/50 focus:outline-none"
            />
          </div>
          <MultiSelect label="Posisi" value={fPosisiLog} onChange={setFPosisiLog} options={[...new Set(log.map((r) => r.posisi))].sort()} placeholder="Semua posisi" />
          <MultiSelect label="Bulan" value={fBulanLog} onChange={setFBulanLog} options={opsiBulan} placeholder="Semua bulan" />
        </div>

        <div className="mt-2 divide-y divide-white/[0.05]">
          {barisLog.map((r, i) => {
            const u = units.find((x) => x.kode === r.kode)
            return (
              <button
                key={`${r.tanggal}-${r.no}-${i}`}
                onClick={() => u && setDetailUnit(u)}
                className={cx('flex w-full items-center gap-2 px-3 py-2.5 text-left transition sm:px-4', u ? 'hover:bg-white/[0.03]' : 'cursor-default')}
              >
                <span className="w-[68px] shrink-0 font-mono text-[11px] text-slate-300">{r.tanggal || '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[12px] font-semibold text-white">{r.kode}</span>
                  <span className="ml-1.5 text-[10px] text-slate-500">{r.posisi || '—'} · {r.bulan} · minggu {r.minggu ?? '—'}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[11.5px] font-semibold text-slate-100">HM {fmt(r.hm)}</span>
                  {r.hmDelta != null && (
                    <span className={cx('block font-mono text-[9.5px]', r.hmAnomali ? 'text-amber-400/90' : 'text-emerald-400/80')}>
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
      <ServiceDetail unit={detailUnit} log={log} onClose={() => setDetailUnit(null)} onCatat={(u) => bukaForm(u.kode)} />
    </div>
  )
}

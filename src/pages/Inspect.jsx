import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cx, scoreOf, kondisiOf, pct, groupOfComponent, fmtDateTime, latestByUnit, clamp } from '../lib/analytics'
import { GRADES, gradeMeta, isConfigured, getAutoSyncMaster, TARGET_SHEET, kondisiMeta } from '../lib/config'
import { submitInspection, syncMaster } from '../lib/api'
import { Card, CardHeader, Bar, GradePill, KondisiPill, StatusPill, ScoreRing, Empty, Segmented, Toast, MultiSelect } from '../components/ui'
import {
  IconSearch, IconCheck, IconX, IconClipboard, IconChevronDown, IconChevron, IconAlert, IconExternal,
  IconTruck, IconDroplet, IconUser, IconCalendar, IconSheet, IconBolt, IconRefresh, IconSpark, IconGauge,
} from '../components/icons'
import { GROUP_ICON } from '../components/icons'

const LS_INSPECTOR = 'fsi:inspector'
const PER_PAGE = 20
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Inspect({ data, records, onSubmitted, navigate, initial, embedded = false, onExit, onNavigate }) {
  const [tipe, setTipe] = useState(initial?.tipe || 'Mesin')
  const [kode, setKode] = useState(initial?.kode || '')
  const [query, setQuery] = useState('')
  const [grades, setGrades] = useState({})
  const [inspector, setInspector] = useState(() => localStorage.getItem(LS_INSPECTOR) || '')
  const [tanggal, setTanggal] = useState(todayISO())
  const [catatan, setCatatan] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  const [result, setResult] = useState(null)
  const [openGroups, setOpenGroups] = useState({})
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [divisiSel, setDivisiSel] = useState([])
  const [jenisSel, setJenisSel] = useState([])
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState('kode')
  const [mode, setMode] = useState(initial?.kode ? 'form' : 'pick')
  const topRef = useRef(null)

  /* dipakai saat form ditampilkan di dalam pop-up ("Tambah Inspeksi") */
  const goPick = () => {
    setResult(null); setGrades({}); setCatatan('')
    if (embedded) { onExit?.(); return }
    setKode(''); setQuery(''); setMode('pick')
  }
  const goNav = (id) => (embedded ? onNavigate?.(id) : navigate(id))

  const groups = tipe === 'Mesin' ? data.groups.mesin : data.groups.irrigator
  const pool = tipe === 'Mesin' ? data.mesin : data.irrigator
  const allComponents = useMemo(() => groups.flatMap((g) => g.items), [groups])

  /* ---- pilihan filter ---- */
  const divisiList = useMemo(() => [...new Set(pool.map((u) => u.wilayah).filter(Boolean))].sort(), [pool])
  const jenisList = useMemo(() => [...new Set(pool.map((u) => u.unit).filter(Boolean))].sort(), [pool])
  const divisiCount = useMemo(() => pool.reduce((m, u) => { const k = u.wilayah || '—'; m[k] = (m[k] || 0) + 1; return m }, {}), [pool])
  const jenisCount = useMemo(() => pool.reduce((m, u) => { const k = u.unit || '—'; m[k] = (m[k] || 0) + 1; return m }, {}), [pool])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = pool
    if (divisiSel.length) list = list.filter((u) => divisiSel.includes(u.wilayah))
    if (jenisSel.length) list = list.filter((u) => jenisSel.includes(u.unit))
    if (q) {
      list = list.filter((u) =>
        [u.kode, u.wilayah, u.spec, u.unit, u.status, u.pompa, u.nozzle].filter(Boolean).join(' ').toLowerCase().includes(q)
      )
    }
    /* ---- urutan ---- */
    const nomor = (kode) => {
      const m = String(kode || '').match(/(\d+)/)
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
    }
    const cmp = {
      // nomor unit terkecil lebih dulu (0004, 0012, 0018, … )
      nomor: (a, b) => nomor(a.kode) - nomor(b.kode) || String(a.kode).localeCompare(String(b.kode)),
      // jenis (prefix unit) A→Z, lalu nomor unit menaik — default
      kode: (a, b) =>
        String(a.unit || '').localeCompare(String(b.unit || ''), undefined, { sensitivity: 'base' }) ||
        nomor(a.kode) - nomor(b.kode) ||
        String(a.kode).localeCompare(String(b.kode), undefined, { numeric: true, sensitivity: 'base' }),
      'skor-asc': (a, b) => (a.score || 0) - (b.score || 0),
      'skor-desc': (a, b) => (b.score || 0) - (a.score || 0),
    }[sort]
    return [...list].sort(cmp)
  }, [pool, query, divisiSel, jenisSel, sort])

  const adaFilter = divisiSel.length > 0 || jenisSel.length > 0 || !!query.trim()

  /* ---- paging daftar unit ---- */
  const totalHalaman = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const halamanAman = Math.min(page, totalHalaman - 1)
  const mulai = halamanAman * PER_PAGE
  const sampai = Math.min(mulai + PER_PAGE, filtered.length)
  const halamanUnit = filtered.slice(mulai, sampai)

  useEffect(() => { setPage(0) }, [query, divisiSel, jenisSel, tipe, sort])

  const unit = useMemo(() => pool.find((u) => u.kode === kode) || null, [pool, kode])

  /* reset form saat unit berubah */
  useEffect(() => {
    setGrades({})
    setCatatan('')
    setResult(null)
    const first = groups[0]
    setOpenGroups(first ? { [first.id]: true } : {})
  }, [kode, tipe]) // eslint-disable-line

  useEffect(() => {
    if (initial?.kode) {
      setMode('form')
      setKode(initial.kode)
      setTipe(initial.tipe || 'Mesin')
    }
  }, [initial])

  const prev = useMemo(() => {
    if (!unit) return null
    const map = latestByUnit(records)
    return map.get(`${tipe === 'Mesin' ? 'Mesin' : 'Irrigator'}:${unit.kode}`) || null
  }, [records, unit, tipe])

  const filled = Object.keys(grades).length
  const total = allComponents.length
  const stats = useMemo(() => scoreOf(grades), [grades])
  const remaining = total - filled
  const complete = filled === total && total > 0
  const progress = pct(filled, total)

  const setGrade = (name, value) => setGrades((g) => ({ ...g, [name]: g[name] === value ? undefined : value }))
  const setAllGroup = (group, value) => {
    setGrades((g) => {
      const next = { ...g }
      group.items.forEach((it) => { next[it] = value })
      return next
    })
  }

  async function handleSubmit() {
    if (!unit || !complete) return
    if (!inspector.trim()) {
      setToast({ type: 'error', message: 'Nama petugas inspeksi wajib diisi.' })
      return
    }
    setSubmitting(true)
    const clean = Object.fromEntries(Object.entries(grades).filter(([, v]) => v))
    const s = scoreOf(clean)
    const payload = {
      tipe: tipe === 'Mesin' ? 'Mesin' : 'Irrigator',
      kode: unit.kode,
      wilayah: unit.wilayah || '',
      unitJenis: unit.unit || '',
      spec: unit.spec || unit.pump || unit.nozzle || '',
      statusUnit: unit.status || '',
      tanggal,
      inspector: inspector.trim(),
      catatan: catatan.trim(),
      komponen: clean,
      a: s.a,
      b: s.b,
      c: s.c,
      total: s.total,
      skor: s.score,
      kondisi: kondisiOf(s.score, unit.status),
      clientId: `FSI-${Date.now()}`,
    }
    try {
      const rec = await submitInspection(payload)
      const offline = !isConfigured()
      let masterResult = null
      let masterError = ''

      /* sinkron otomatis ke sheet Mesin & Irrigator */
      if (!offline && getAutoSyncMaster()) {
        try {
          masterResult = await syncMaster()
        } catch (e) {
          masterError = e?.message || 'Gagal menghubungi Apps Script'
        }
      }

      setResult({ payload, record: rec, offline, masterSynced: !!masterResult, masterResult, masterError })
      const merged = { ...payload, ...rec }
      onSubmitted?.(merged)
      setToast({
        type: offline ? 'info' : 'success',
        message: offline
          ? 'Tersimpan lokal (antrean). Atur endpoint Apps Script agar masuk ke Google Sheets.'
          : masterResult
          ? `Inspeksi tersimpan · sheet Mesin & Irrigator diperbarui (${masterResult.join(' · ')})`
          : `Inspeksi tersimpan, TAPI sinkron ke sheet master gagal: ${masterError || 'tidak dijalankan'}`, 
      })
    } catch (e) {
      setToast({ type: 'error', message: `Gagal menyimpan: ${e.message}` })
    } finally {
      setSubmitting(false)
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  /* ------------------------------- RESULT ------------------------------- */
  if (result) {
    const s = scoreOf(result.payload.komponen)
    const kondisiFinal = kondisiOf(s.score, result.payload.statusUnit)
    const km = kondisiMeta(kondisiFinal)
    return (
      <div className="mx-auto max-w-2xl animate-fade-up space-y-4" ref={topRef}>
        <Card className="overflow-hidden">
          <div className="relative border-b border-white/[0.06] bg-gradient-to-br from-emerald-500/12 via-transparent to-sky-500/10 px-6 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
              <IconCheck size={26} />
            </div>
            <h2 className="mt-3 text-[17px] font-bold text-white">Inspeksi Terkirim</h2>
            <p className="mt-1 text-[12px] text-slate-400">
              {result.payload.tipe} <span className="font-mono font-semibold text-slate-200">{result.payload.kode}</span> · {result.payload.inspector}
            </p>
            <div className="mt-4 flex items-center justify-center gap-6">
              <ScoreRing score={s.score} size={72} stroke={7} />
              <div className="text-left">
                <KondisiPill kondisi={kondisiFinal} />
                {String(result.payload.statusUnit).toLowerCase() === 'rusak' && s.score >= 70 && (
                  <p className="mt-1 text-[9.5px] leading-tight text-rose-300/80">status unit Rusak → otomatis Kritis</p>
                )}
                <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                  <span className="text-emerald-400">{s.a} A</span> · <span className="text-amber-400">{s.b} B</span> ·{' '}
                  <span className="text-rose-400">{s.c} C</span>
                </p>
                <p className="text-[10.5px] text-slate-500">{s.total} komponen diperiksa</p>
              </div>
            </div>
          </div>
          <div className="card-pad space-y-2.5">
            <div className={cx('rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed', result.offline ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200')}>
              {result.offline
                ? 'Data disimpan di perangkat ini (antrean lokal). Hubungkan Apps Script di menu Pengaturan lalu tekan "Sinkron" untuk mengirim ke Google Sheets.'
                : 'Baris baru berhasil ditambahkan ke tabel inspeksi di sheet "Data Inspeksi".'}
            </div>

            {!result.offline && (
              <div
                className={cx(
                  'rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed',
                  result.masterSynced
                    ? 'border-sky-500/25 bg-sky-500/[0.08] text-sky-200'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                )}
              >
                {result.masterSynced ? (
                  <>
                    <span className="font-semibold">Sheet master diperbarui.</span>{' '}
                    Kolom <span className="font-mono text-[10.5px]">TGL INSPEKSI TERAKHIR · SKOR · KONDISI · A/B/C · PETUGAS · TEMUAN</span>{' '}
                    pada unit <span className="font-mono font-semibold">{result.payload.kode}</span> kini berisi hasil inspeksi ini.
                    {result.masterResult?.length ? <span className="block mt-0.5 text-[10.5px] text-sky-300/80">{result.masterResult.join(' · ')}</span> : null}
                  </>
                ) : (
                  <>
                    <p>
                      Sinkron ke sheet <span className="font-semibold">Mesin &amp; Irrigator</span> belum berhasil.
                      {' '}Data inspeksi unit <span className="font-mono font-semibold">{result.payload.kode}</span> sudah
                      tersimpan di sheet “Data Inspeksi”.
                    </p>
                    {result.masterError && (
                      <p className="mt-1 rounded-lg bg-rose-500/10 px-2 py-1 font-mono text-[10.5px] text-rose-300">
                        {result.masterError}
                      </p>
                    )}
                    {/tidak dikenal|versi lama/i.test(result.masterError || '') && (
                      <p className="mt-1 text-amber-300">
                        Perbaikan: buka Apps Script ▸ <span className="font-semibold">Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy</span>,
                        lalu tekan tombol di bawah. Alternatif cepat: jalankan fungsi{' '}
                        <span className="font-mono">syncLatestToMaster</span> langsung dari editor Apps Script.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={goPick}>
                <IconClipboard size={14} /> Unit lain
              </button>
              <button className="btn-primary" onClick={() => { setResult(null); setGrades({}); setCatatan(''); }}>
                <IconRefresh size={14} /> Inspeksi ulang
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost !text-[12px]" onClick={() => goNav('riwayat')}>Lihat riwayat</button>
              <a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !text-[12px]">
                <IconSheet size={14} /> Buka sheet
              </a>
            </div>
            {!result.offline && !result.masterSynced && (
              <button
                className="btn-ghost w-full !border-sky-500/30 !text-[12px] !text-sky-300"
                onClick={async (e) => {
                  const btn = e.currentTarget
                  btn.disabled = true
                  btn.textContent = 'Menyinkronkan…'
                  try {
                    const r = await syncMaster()
                    setResult((prev) => ({ ...prev, masterSynced: true, masterResult: r }))
                    setToast({ type: 'success', message: `Sheet master diperbarui: ${r.join(' · ')}` })
                  } catch (err) {
                    setToast({ type: 'error', message: `Gagal: ${err.message}` })
                    setResult((prev) => ({ ...prev, masterError: err.message }))
                    btn.disabled = false
                    btn.textContent = 'Sinkronkan ke sheet Mesin & Irrigator'
                  }
                }}
              >
                Sinkronkan ke sheet Mesin &amp; Irrigator
              </button>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Ringkasan Temuan" sub={fmtDateTime(result.record?.timestamp || new Date())} />
          <div className="card-pad space-y-1.5 pt-3">
            {groups.map((g) => {
              const items = g.items.filter((it) => result.payload.komponen[it] !== 'A')
              if (!items.length) return null
              return (
                <div key={g.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-300">{g.label}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {items.map((it) => (
                      <span key={it} className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] text-slate-300">
                        {it} <GradePill value={result.payload.komponen[it]} size="xs" />
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            {result.payload.catatan && (
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-slate-300">
                <span className="text-slate-500">Catatan: </span>{result.payload.catatan}
              </p>
            )}
          </div>
        </Card>
      </div>
    )
  }

  /* ------------------------------- PICKER ------------------------------- */
  if (mode === 'pick' || !unit) {
    return (
      <div className="mx-auto max-w-4xl space-y-4" ref={topRef}>
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] bg-gradient-to-r from-brand/10 via-transparent to-emerald-500/10 px-5 py-5">
            <h2 className="text-[15px] font-bold text-white">Pilih unit yang akan diinspeksi</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              Checklist komponen otomatis menyesuaikan tipe aset. Hasil tersimpan ke sheet “{TARGET_SHEET.name}”.
            </p>
          </div>
          <div className="card-pad space-y-3">
            <Segmented
              value={tipe}
              onChange={(v) => { setTipe(v); setKode(''); setQuery(''); setDivisiSel([]); setJenisSel([]) }}
              options={[
                { value: 'Mesin', label: `Mesin · ${data.mesin.length}` },
                { value: 'Irrigator', label: `Irrigator · ${data.irrigator.length}` },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[190px] flex-1">
                <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tipe === 'Mesin' ? 'Cari kode / spec… (mis. SPC0018)' : 'Cari kode / nozzle… (mis. ITI0083)'}
                  className="input !py-2.5 !pl-9 !text-[12.5px]"
                />
              </div>
              <MultiSelect
                label={tipe === 'Mesin' ? 'Divisi' : 'Wilayah'}
                placeholder="Semua divisi"
                options={divisiList}
                value={divisiSel}
                onChange={setDivisiSel}
                counts={divisiCount}
                className="min-w-[140px]"
              />
              <MultiSelect
                label={tipe === 'Mesin' ? 'Jenis Engine' : 'Jenis Irrigator'}
                placeholder="Semua jenis"
                options={jenisList}
                value={jenisSel}
                onChange={setJenisSel}
                counts={jenisCount}
                className="min-w-[150px]"
              />
              <div className="relative min-w-[150px]">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="input appearance-none !py-2.5 !pl-3 !pr-8 !text-[12px]"
                  title="Urutan daftar unit"
                >
                  <option value="kode" className="bg-ink-800">Jenis, lalu nomor</option>
                  <option value="nomor" className="bg-ink-800">Nomor terkecil</option>
                  <option value="skor-asc" className="bg-ink-800">Skor terendah</option>
                  <option value="skor-desc" className="bg-ink-800">Skor tertinggi</option>
                </select>
                <IconChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>

              {(adaFilter) && (
                <button
                  className="btn-ghost !py-2 !text-[11.5px] !border-rose-500/30 !text-rose-300"
                  onClick={() => { setQuery(''); setDivisiSel([]); setJenisSel([]) }}
                  title="Bersihkan filter"
                >
                  <IconX size={13} /> Reset
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
              <span>
                Menampilkan{' '}
                <span className="font-mono font-semibold text-slate-300">{filtered.length ? mulai + 1 : 0}–{sampai}</span> dari{' '}
                <span className="font-mono font-semibold text-slate-300">{filtered.length}</span> unit
                {adaFilter ? ` (total ${pool.length})` : ''}
              </span>
              {divisiSel.length > 0 && <span className="chip !py-0.5 !text-[10px]">Divisi: {divisiSel.join(', ')}</span>}
              {jenisSel.length > 0 && <span className="chip !py-0.5 !text-[10px]">Jenis: {jenisSel.join(', ')}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              {halamanUnit.map((u) => {
                const rec = latestByUnit(records).get(`${tipe}:${u.kode}`)
                return (
                  <button
                    key={u.kode}
                    onClick={() => { setKode(u.kode); setMode('form') }}
                    className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left transition hover:border-brand/40 hover:bg-white/[0.06]"
                  >
                    <ScoreRing score={rec?.skor ?? u.score} size={34} stroke={4} />
                    <div className="min-w-0 flex-1">
                      {/* baris 1: kode + spesifikasi (+ meta di layar lebar) */}
                      <div className="flex items-center gap-2">
                        <span className="w-[72px] shrink-0 font-mono text-[12px] font-bold text-white">{u.kode}</span>
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-400">{u.spec || u.unit}</span>
                        <span className="hidden shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9.5px] text-slate-400 sm:inline-block">
                          {u.wilayah}
                        </span>
                        <span className="hidden shrink-0 sm:inline-flex"><StatusPill status={u.status} /></span>
                        <span className="hidden w-[148px] shrink-0 truncate text-right text-[9.5px] text-slate-500 sm:inline-block">
                          {rec ? `inspeksi ${rec.tanggal}` : 'belum pernah diinspeksi'}
                        </span>
                      </div>
                      {/* baris 2 (khusus HP) */}
                      <div className="mt-1 flex items-center gap-1.5 sm:hidden">
                        <span className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-slate-400">
                          {u.wilayah}
                        </span>
                        <StatusPill status={u.status} />
                        <span className="min-w-0 flex-1 truncate text-right text-[9px] text-slate-500">
                          {rec ? `inspeksi ${rec.tanggal}` : 'belum pernah diinspeksi'}
                        </span>
                      </div>
                    </div>
                    <IconChevron size={14} className="shrink-0 text-slate-600 transition group-hover:text-brand" />
                  </button>
                )
              })}
              {!filtered.length && (
                <div>
                  <Empty title="Unit tidak ditemukan" desc="Coba kata kunci lain, atau periksa tipe aset yang dipilih." icon={<IconSearch size={20} />} />
                </div>
              )}
            </div>

            {/* ---------- pager ---------- */}
            {filtered.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] py-2 pl-3 pr-16">
                <span className="whitespace-nowrap text-[10.5px] text-slate-500">
                  Halaman <span className="font-mono font-semibold text-slate-300">{halamanAman + 1}</span> dari{' '}
                  <span className="font-mono font-semibold text-slate-300">{totalHalaman}</span> · maks {PER_PAGE} unit/halaman
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    className="btn-ghost !px-2 !py-1 !text-[11px]"
                    disabled={halamanAman === 0}
                    onClick={() => setPage(0)}
                    title="Halaman pertama"
                  >
                    «
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1 !text-[11px]"
                    disabled={halamanAman === 0}
                    onClick={() => setPage(halamanAman - 1)}
                  >
                    Sebelumnya
                  </button>
                  <span className="whitespace-nowrap px-1 font-mono text-[11px] text-slate-400">
                    {halamanAman + 1} / {totalHalaman}
                  </span>
                  <button
                    className="btn-ghost !px-2 !py-1 !text-[11px]"
                    disabled={halamanAman >= totalHalaman - 1}
                    onClick={() => setPage(halamanAman + 1)}
                  >
                    Berikutnya
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1 !text-[11px]"
                    disabled={halamanAman >= totalHalaman - 1}
                    onClick={() => setPage(totalHalaman - 1)}
                    title="Halaman terakhir"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  /* ------------------------------- FORM ------------------------------- */
  const km = kondisiMeta(stats.kondisi)
  return (
    <div className={cx('space-y-4', embedded ? 'px-3 pb-2 pt-3 sm:px-4' : 'pb-24')} ref={topRef}>
      {/* unit header */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] bg-gradient-to-r from-brand/[0.08] via-transparent to-transparent px-4 py-4 sm:px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-brand">
            {tipe === 'Mesin' ? <IconTruck size={20} /> : <IconDroplet size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-[16px] font-bold text-white">{unit.kode}</h2>
              <StatusPill status={unit.status} />
              <span className="chip !py-0.5 !text-[10px]">{tipe}</span>
            </div>
            <p className="truncate text-[11px] text-slate-400">
              {unit.wilayah} · {unit.spec || unit.unit} {unit.pomp ? `· ${unit.pompa}` : ''} {unit.power ? `· ${unit.power} HP` : ''}
              {unit.nozzle ? `· Nozzle ${unit.nozzle}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Skor saat ini</p>
              <p className="font-mono text-[13px] font-semibold text-slate-200">{stats.score.toFixed(1)}</p>
            </div>
            <ScoreRing score={complete ? stats.score : unit.score} size={48} stroke={5} />
            <button className="btn-ghost !px-2 !py-1.5" onClick={goPick} title="Ganti unit">
              <IconRefresh size={14} />
            </button>
          </div>
        </div>

        {prev && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2 text-[10.5px] text-slate-500 sm:px-5">
            <span>Inspeksi terakhir: <span className="text-slate-300">{fmtDateTime(prev.timestamp)}</span> oleh {prev.inspector || '—'}</span>
            <span>Skor <span className="font-mono text-slate-300">{prev.skor}</span></span>
            <KondisiPill kondisi={prev.kondisi} />
            {prev.c > 0 && <span className="text-rose-400">{prev.c} temuan C sebelumnya</span>}
          </div>
        )}

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-3 sm:px-5">
          <div>
            <label className="label">Petugas Inspeksi</label>
            <div className="relative">
              <IconUser size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={inspector}
                onChange={(e) => { setInspector(e.target.value); localStorage.setItem(LS_INSPECTOR, e.target.value) }}
                placeholder="Nama lengkap"
                className="input !pl-9"
              />
            </div>
          </div>
          <div>
            <label className="label">Tanggal Inspeksi</label>
            <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">Progres Checklist</label>
            <div className="flex items-center gap-2 pt-2">
              <Bar value={progress} color={complete ? '#22c55e' : '#38bdf8'} height={7} />
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-slate-300">{filled}/{total}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip"><IconClipboard size={12} /> {groups.length} kelompok · {total} komponen</span>
        <span className="chip !border-emerald-500/30 !text-emerald-300">A {stats.a}</span>
        <span className="chip !border-amber-500/30 !text-amber-300">B {stats.b}</span>
        <span className="chip !border-rose-500/30 !text-rose-300">C {stats.c}</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost !py-1.5 !text-[11.5px]" onClick={() => setOnlyEmpty((v) => !v)}>
            {onlyEmpty ? 'Tampilkan semua' : 'Sembunyikan yang sudah dinilai'}
          </button>
          <button
            className="btn-ghost !py-1.5 !text-[11.5px]"
            onClick={() => setGrades(Object.fromEntries(allComponents.map((c) => [c, 'A'])))}
          >
            <IconCheck size={13} /> Tandai semua A
          </button>
        </div>
      </div>

      {/* groups */}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const Icon = GROUP_ICON[g.id] || IconGauge
          const done = g.items.filter((i) => grades[i]).length
          const isOpen = openGroups[g.id] ?? false
          const items = onlyEmpty ? g.items.filter((i) => !grades[i]) : g.items
          return (
            <Card key={g.id} className={cx('overflow-hidden transition', done === g.items.length && 'border-emerald-500/20')}>
              <button
                onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !isOpen }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={cx('rounded-lg p-1.5', done === g.items.length ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.05] text-slate-400')}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-slate-100">{g.label}</p>
                  <p className="text-[10px] text-slate-500">{done}/{g.items.length} komponen dinilai</p>
                </div>
                <div className="w-16"><Bar value={pct(done, g.items.length)} color={done === g.items.length ? '#22c55e' : '#38bdf8'} height={4} /></div>
                <IconChevronDown size={15} className={cx('text-slate-500 transition', isOpen && 'rotate-180')} />
              </button>

              {isOpen && (
                <div className="border-t border-white/[0.06]">
                  <div className="flex items-center justify-between bg-white/[0.02] px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">Tandai cepat</span>
                    <div className="flex gap-1">
                      {GRADES.map((gr) => (
                        <button
                          key={gr.value}
                          onClick={() => setAllGroup(g, gr.value)}
                          className={cx('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition hover:brightness-125', gr.cls)}
                        >
                          {gr.value} semua
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {items.map((it) => {
                      const val = grades[it]
                      const prevVal = prev?.komponen?.[it]
                      return (
                        <div key={it} className={cx('flex items-center gap-2 px-3 py-2 transition', val ? 'bg-white/[0.015]' : '')}>
                          <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-300">
                            {it}
                            {prevVal && prevVal !== val && (
                              <span className="ml-1.5 align-middle text-[9px] text-slate-500">(sebelumnya {prevVal})</span>
                            )}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            {GRADES.map((gr) => {
                              const active = val === gr.value
                              return (
                                <button
                                  key={gr.value}
                                  onClick={() => setGrade(it, gr.value)}
                                  title={`${gr.label} — ${gr.desc}`}
                                  className={cx(
                                    'h-7 w-8 rounded-md border text-[11px] font-bold transition',
                                    active
                                      ? gr.cls + ' scale-105 shadow-[0_0_16px_-6px_currentColor]'
                                      : 'border-white/10 bg-white/[0.02] text-slate-500 hover:border-white/25 hover:text-slate-200'
                                  )}
                                >
                                  {gr.value}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {!items.length && <p className="px-3 py-4 text-center text-[11px] text-slate-500">Semua komponen pada kelompok ini sudah dinilai.</p>}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* catatan */}
      <Card>
        <CardHeader title="Catatan & Rekomendasi" sub="Temuan khusus, kebutuhan part, atau tindak lanjut (opsional)" />
        <div className="card-pad pt-3">
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            placeholder="Contoh: Radiator bocor halus, perlu pressure test. V-belt alternator mulai retak, siapkan pengganti."
            className="input resize-y"
          />
        </div>
      </Card>

      {/* sticky bar */}
      <div className={cx('border-t border-white/10 bg-ink-950/95 backdrop-blur-xl', embedded ? 'sticky bottom-0 z-20 rounded-b-2xl' : 'fixed inset-x-0 bottom-0 z-40 lg:left-[236px]')}>
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 py-3 pl-4 pr-16 sm:pl-6 sm:pr-20">
          <div className="flex items-center gap-3">
            <ScoreRing score={complete ? stats.score : stats.score || 0} size={40} stroke={4} />
            <div>
              <p className="text-[11px] font-semibold text-slate-200">
                {complete ? 'Checklist lengkap' : `Sisa ${remaining} komponen belum dinilai`}
              </p>
              <p className="font-mono text-[10px] text-slate-500">
                A {stats.a} · B {stats.b} · C {stats.c} {filled ? `· skor ${stats.score.toFixed(1)}` : ''}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!isConfigured() && (
              <button onClick={() => goNav('pengaturan')} className="hidden items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10.5px] font-semibold text-amber-300 sm:flex">
                <IconAlert size={12} /> Endpoint belum diatur
              </button>
            )}
            {remaining > 0 && (
              <button
                className="btn-ghost !py-1.5 !text-[11.5px]"
                onClick={() => {
                  const next = { ...grades }
                  allComponents.forEach((c) => { if (!next[c]) next[c] = 'A' })
                  setGrades(next)
                }}
              >
                Isi sisa A
              </button>
            )}
            <button className="btn-primary !py-2" disabled={!complete || submitting} onClick={handleSubmit}>
              {submitting ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/40 border-t-ink-950" /> Mengirim…</>
              ) : (
                <><IconCheck size={15} /> Kirim Inspeksi</>
              )}
            </button>
          </div>
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

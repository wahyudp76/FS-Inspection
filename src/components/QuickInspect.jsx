import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx, latestByUnit } from '../lib/analytics'
import { kondisiMeta, statusUnitMeta } from '../lib/config'
import { Segmented, StatusPill, ScoreRing } from './ui'
import { IconSearch, IconX, IconClipboard, IconChevron, IconTruck, IconDroplet, IconCheck } from './icons'
import Inspect from '../pages/Inspect'
import { useScrollLock } from '../lib/scrollLock'

/* ------------------------- satu baris data pendukung ------------------------- */
const Field = ({ label, value, mono, wide }) => (
  <div className={cx('min-w-0', wide && 'sm:col-span-2')}>
    <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    <p className={cx('truncate text-[12px] text-slate-800', mono && 'font-mono')} title={typeof value === 'string' ? value : undefined}>
      {value || '—'}
    </p>
  </div>
)

export default function QuickInspect({ open, data, records, onClose, onSubmitted, navigate }) {
  const [tipe, setTipe] = useState('Mesin')
  const [query, setQuery] = useState('')
  const [kode, setKode] = useState('')
  const [step, setStep] = useState('pick')
  const searchRef = useRef(null)

  const pool = tipe === 'Mesin' ? data.mesin || [] : data.irrigator || []
  const unit = useMemo(() => pool.find((u) => u.kode === kode) || null, [pool, kode])
  const lastRec = useMemo(() => {
    if (!unit) return null
    return latestByUnit(records).get(`${tipe}:${unit.kode}`) || null
  }, [records, tipe, unit])

  const hasil = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pool
    return pool.filter((u) =>
      [u.kode, u.spec, u.unit, u.wilayah, u.pompa, u.komoditi, u.keterangan]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    )
  }, [pool, query])

  /* reset tiap kali pop-up dibuka */
  useEffect(() => {
    if (!open) return
    setStep('pick'); setKode(''); setQuery('')
    const t = setTimeout(() => searchRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [open])

  /* Esc menutup, kunci scroll body (hanya saat terbuka) */
  useScrollLock(open)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const komponen = unit ? Object.entries(unit.components || {}) : []
  const kosong = komponen.filter(([, v]) => !v).length
  const km = lastRec ? kondisiMeta(lastRec.kondisi) : null

  const mulai = () => { if (unit) setStep('form') }
  const selesai = () => { onClose?.() }

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[70] flex flex-col items-center overflow-y-auto bg-slate-900/35 p-2 backdrop-blur sm:justify-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tambah Inspeksi"
        className={cx(
          'relative my-auto w-full min-w-0 overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-[0_40px_100px_-20px_rgba(0,0,0,0.95)]',
          step === 'form' ? 'max-w-5xl' : 'max-w-3xl'
        )}
      >
        {/* ---------- header pop-up ---------- */}
        <div className="flex items-center gap-3 border-b border-slate-900/[0.10] bg-gradient-to-r from-brand/[0.12] via-transparent to-transparent px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/15 text-brand">
            <IconClipboard size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold leading-tight text-slate-900">
              {step === 'form' ? `Inspeksi ${unit?.kode}` : 'Tambah Inspeksi'}
            </h2>
            <p className="truncate text-[10.5px] text-slate-500">
              {step === 'form'
                ? `${tipe} · ${unit?.spec || unit?.unit || ''} · ${unit?.wilayah || ''}`
                : 'Pilih jenis engine/irrigator, data pendukung tampil otomatis'}
            </p>
          </div>
          {step === 'form' && (
            <button className="btn-ghost !px-2 !py-1.5 !text-[11px]" onClick={() => setStep('pick')} title="Kembali ke pilihan unit">
              <IconChevron size={13} className="rotate-180" /> Ganti unit
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg border border-slate-900/10 bg-slate-900/[0.04] p-1.5 text-slate-600 transition hover:border-slate-900/20 hover:bg-slate-900/10 hover:text-slate-900"
          >
            <IconX size={13} />
          </button>
        </div>

        {step === 'pick' ? (
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto p-4">
            {/* pilih tipe aset */}
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={tipe}
                onChange={(v) => { setTipe(v); setKode(''); setQuery('') }}
                options={[
                  { value: 'Mesin', label: `Mesin · ${data.mesin?.length || 0}` },
                  { value: 'Irrigator', label: `Irrigator · ${data.irrigator?.length || 0}` },
                ]}
              />
              <span className="ml-auto text-[10.5px] text-slate-500">
                {hasil.length} unit cocok
              </span>
            </div>

            {/* pencarian unit */}
            <div className="relative mt-3">
              <IconSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tipe === 'Mesin' ? 'Cari kode / spesifikasi mesin… (mis. SPC0018)' : 'Cari kode / spesifikasi irrigator… (mis. BTI0027)'}
                className="input pl-9"
              />
            </div>

            {/* daftar unit */}
            <div className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.015] p-1.5">
              {hasil.slice(0, 200).map((u) => {
                const aktif = u.kode === kode
                return (
                  <button
                    key={u.kode}
                    onClick={() => setKode(u.kode)}
                    className={cx(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition',
                      aktif ? 'bg-brand/15 ring-1 ring-brand/40' : 'hover:bg-slate-900/[0.04]'
                    )}
                  >
                    <span className={cx('w-[70px] shrink-0 font-mono text-[11.5px] font-bold', aktif ? 'text-brand' : 'text-slate-900')}>
                      {u.kode}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600">
                      {tipe === 'Mesin' ? u.spec || u.unit : `${u.unit}${u.nozzle ? ` · Nozzle ${u.nozzle}` : ''}`}
                    </span>
                    <span className="hidden shrink-0 rounded-md border border-slate-900/10 bg-slate-900/[0.03] px-1.5 py-0.5 text-[9.5px] text-slate-600 sm:inline-block">
                      {u.wilayah}
                    </span>
                    <span className="hidden shrink-0 sm:inline-flex"><StatusPill status={u.status} /></span>
                    <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-slate-600">{Math.round(u.score ?? 0)}</span>
                    {aktif && <IconCheck size={13} className="shrink-0 text-brand" />}
                  </button>
                )
              })}
              {!hasil.length && (
                <p className="px-3 py-6 text-center text-[11.5px] text-slate-500">Tidak ada unit yang cocok.</p>
              )}
            </div>

            {/* ---------- data pendukung ---------- */}
            <div className="mt-3 rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] p-3">
              {!unit ? (
                <p className="py-4 text-center text-[11.5px] text-slate-500">
                  Pilih unit di atas — data pendukung (divisi, spesifikasi, status, riwayat inspeksi) langsung tampil di sini.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 border-b border-slate-900/[0.09] pb-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-900/10 bg-slate-900/[0.04] text-brand">
                      {tipe === 'Mesin' ? <IconTruck size={17} /> : <IconDroplet size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] font-bold text-slate-900">{unit.kode}</span>
                        <StatusPill status={unit.status} />
                        <span className="chip !py-0.5 !text-[9.5px]">{tipe}</span>
                        <span className="chip !py-0.5 !text-[9.5px]">{unit.unit}</span>
                      </div>
                      <p className="truncate text-[10.5px] text-slate-600">
                        {tipe === 'Mesin'
                          ? `${unit.spec || '—'}${unit.power ? ` · ${unit.power} HP` : ''}${unit.pompa ? ` · Pompa ${unit.pompa}` : ''}`
                          : `${unit.unit || '—'}${unit.nozzle ? ` · Nozzle ${unit.nozzle}` : ''}`}
                      </p>
                    </div>
                    <ScoreRing score={lastRec?.skor ?? unit.score ?? 0} size={40} stroke={4} />
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Field label="Divisi / Wilayah" value={unit.wilayah} />
                    <Field label="Jenis" value={unit.unit} mono />
                    {tipe === 'Mesin' ? (
                      <>
                        <Field label="Power" value={unit.power ? `${unit.power} HP` : ''} />
                        <Field label="Pompa" value={unit.pompa} />
                        <Field label="Komoditi" value={unit.komoditi} />
                      </>
                    ) : (
                      <>
                        <Field label="Nozzle" value={unit.nozzle ? `${unit.nozzle} mm` : ''} />
                        <Field label="Tipe unit" value={unit.unit} mono />
                        <Field label="Titik pasang" value={unit.wilayah} />
                      </>
                    )}
                    <Field label="Status unit" value={unit.status} />
                    <Field label="Komponen" value={`${komponen.length} item · ${kosong} belum ada nilai`} />
                    <Field label="Sebaran" value={`A ${unit.a ?? 0} · B ${unit.b ?? 0} · C ${unit.c ?? 0}`} mono />
                    {unit.keterangan && <Field label="Keterangan" value={unit.keterangan} wide />}
                  </div>

                  <div className="mt-2.5 rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.015] px-2.5 py-2">
                    <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">Inspeksi terakhir</p>
                    {lastRec ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700">
                        <span className="font-mono">{lastRec.tanggal}</span>
                        <span className={cx('rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold', km.cls)}>{lastRec.kondisi}</span>
                        <span className="font-mono">skor {Number(lastRec.skor).toFixed(1)}</span>
                        <span className="font-mono text-slate-600">A {lastRec.a} · B {lastRec.b} · C {lastRec.c}</span>
                        <span className="text-slate-500">oleh {lastRec.petugas || '—'}</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">Belum pernah diinspeksi melalui dashboard ini.</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ---------- aksi ---------- */}
            <div className="mt-3 flex items-center gap-2">
              <button className="btn-ghost !py-2" onClick={onClose}>Batal</button>
              <button className="btn-primary ml-auto !py-2" disabled={!unit} onClick={mulai}>
                <IconClipboard size={14} /> Mulai Inspeksi
                <IconChevron size={13} />
              </button>
            </div>
          </div>
        ) : (
          /* ---------- form checklist (komponen yang sama dengan tab Inspeksi) ---------- */
          <div className="max-h-[calc(100dvh-6rem)] overflow-y-auto">
            <Inspect
              key={`${tipe}:${unit?.kode}`}
              data={data}
              records={records}
              onSubmitted={onSubmitted}
              navigate={navigate}
              initial={{ kode: unit?.kode, tipe }}
              embedded
              onExit={() => setStep('pick')}
              onNavigate={(id) => { onClose?.(); navigate?.(id) }}
            />
            <div className="flex items-center gap-2 border-t border-slate-900/[0.10] bg-white px-4 py-2">
              <span className="text-[10.5px] text-slate-500">
                Checklist di atas identik dengan tab Inspeksi — hasilnya tersimpan ke sheet “Data Inspeksi”.
              </span>
              <button className="btn-ghost ml-auto !py-1.5 !text-[11.5px]" onClick={selesai}>Selesai</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

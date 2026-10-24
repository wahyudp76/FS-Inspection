import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx, kondisiOf, pct, scoreColor, bucketAnalysis, unitsInRange } from '../lib/analytics'
import { KondisiPill, StatusPill, Bar, Segmented } from './ui'
import { IconTruck, IconDroplet, IconAlert, IconClipboard, IconChevron } from './icons'

/**
 * Pop-up analisis satu rentang skor untuk satu jenis aset.
 * Dibuka dari histogram "Distribusi Skor" (klik batang Mesin / Irrigator).
 */
export default function BucketModal({ open, range, tipe, mesin = [], irrigator = [], onClose, onInspect, onOpenUnit }) {
  const units = useMemo(() => {
    const src = tipe === 'Irrigator' ? irrigator : mesin
    return unitsInRange(src, range?.min ?? -1, range?.max ?? 101).sort((a, b) => a.score - b.score)
  }, [tipe, mesin, irrigator, range])

  /* paging daftar unit — default 10 per halaman agar pop-up tidak panjang */
  const [page, setPage] = useState(0)
  const [perPage, setPerPage] = useState(10)
  useEffect(() => { setPage(0) }, [range?.label, tipe, perPage])
  useEffect(() => { setPage(0) }, [open])

  const totalTipe = (tipe === 'Irrigator' ? irrigator : mesin).length
  const analisa = useMemo(
    () => bucketAnalysis(units, { range, tipe, totalTipe }),
    [units, range, tipe, totalTipe]
  )

  const totalHalaman = Math.max(1, Math.ceil(units.length / perPage))
  const halamanAman = Math.min(page, totalHalaman - 1)
  const mulai = halamanAman * perPage
  const halamanUnit = units.slice(mulai, mulai + perPage)

  /* saat pindah halaman, gulirkan area isi ke awal daftar unit */
  const bodyRef = useRef(null)
  const listRef = useRef(null)
  useEffect(() => {
    const body = bodyRef.current
    const list = listRef.current
    if (!body || !list) return
    const top = list.offsetTop - 8
    if (body.scrollTop > top) body.scrollTo({ top, behavior: 'smooth' })
  }, [halamanAman])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || !range) return null
  const isIrr = tipe === 'Irrigator'
  const accent = isIrr ? '#22d3ee' : '#38bdf8'

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[70] flex items-end justify-center bg-ink-950/85 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Distribusi skor ${range.label} ${tipe}`}
        className="relative flex max-h-[92vh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.95)] sm:max-w-3xl sm:rounded-2xl"
      >
        {/* ---------- header ---------- */}
        <div className="flex items-start gap-3 border-b border-white/[0.08] bg-gradient-to-r from-brand/[0.12] via-transparent to-transparent px-4 py-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border"
            style={{ borderColor: `${accent}55`, background: `${accent}1f`, color: accent }}
          >
            {isIrr ? <IconDroplet size={17} /> : <IconTruck size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold leading-tight text-white">
              Skor {range.label} · {isIrr ? 'Irrigator' : 'Mesin (engine)'}
            </h2>
            <p className="text-[10.5px] leading-snug text-slate-500">
              {analisa.n} unit · {analisa.porsi}% dari {totalTipe} {isIrr ? 'irrigator' : 'mesin'} · rata-rata skor {analisa.skor}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup analisis"
            className="tap shrink-0 rounded-lg border border-white/10 bg-white/[0.04] text-slate-400 transition hover:border-white/25 hover:text-white"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {/* ---------- ringkasan ---------- */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Jumlah unit" value={analisa.n} unit="unit" accent={accent} />
            <Stat label="Rata-rata skor" value={analisa.skor} unit="/100" accent={range.color} />
            <Stat label="Kritis" value={analisa.kritis} unit="unit" accent="#f43f5e" />
            <Stat label="Perlu perhatian" value={analisa.perhatian} unit="unit" accent="#f59e0b" />
          </div>

          {/* ---------- analisa naratif ---------- */}
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <IconAlert size={11} /> Analisa kategori {isIrr ? 'Irrigator' : 'Mesin'}
            </p>
            <p className="text-[11.5px] leading-relaxed text-slate-300">{analisa.ringkas}</p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {Object.entries(analisa.status)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <span key={k} className="chip !py-0.5 !text-[10px]">
                    {k} {v}
                  </span>
                ))}
              {analisa.wilayah.slice(0, 4).map((w) => (
                <span key={w.name} className="chip !py-0.5 !text-[10px]">
                  {w.name} · {w.value}
                </span>
              ))}
            </div>

            {analisa.issues.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Komponen paling bermasalah (B/C)
                </p>
                <div className="space-y-1.5">
                  {analisa.issues.filter((it) => it.issue > 0).slice(0, 4).map((it) => (
                    <div key={it.name} className="flex items-center gap-2">
                      <span className="w-[38%] min-w-0 truncate text-[11px] text-slate-300" title={it.name}>{it.name}</span>
                      <Bar value={it.issueRate} color={it.c > 0 ? '#f43f5e' : '#f59e0b'} height={5} />
                      <span className="w-16 shrink-0 text-right font-mono text-[10px] text-slate-500">
                        {it.issue} titik
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- daftar unit ---------- */}
          <div ref={listRef} className="mb-1.5 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Daftar unit ({units.length}) — skor terendah lebih dulu
            </p>
            {units.length > 0 && (
              <span className="text-[10px] text-slate-600">
                · menampilkan {mulai + 1}–{Math.min(mulai + perPage, units.length)}
              </span>
            )}
            {units.length > 10 && (
              <div className="ml-auto">
                <Segmented
                  value={String(perPage)}
                  onChange={(v) => setPerPage(Number(v))}
                  size="sm"
                  options={[
                    { value: '10', label: '10' },
                    { value: '25', label: '25' },
                    { value: '50', label: '50' },
                  ]}
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {halamanUnit.map((u) => {
              const k = kondisiOf(u.score, u.status)
              return (
                <div key={u.kode} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenUnit?.(u)}
                      className="tap min-w-0 justify-start font-mono text-[12.5px] font-bold text-white hover:text-brand"
                      aria-label={`Detail unit ${u.kode}`}
                    >
                      {u.kode}
                    </button>
                    <StatusPill status={u.status} />
                    {k === 'Kritis' && (
                      <span className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">Kritis</span>
                    )}
                    <span className="ml-auto shrink-0 font-mono text-[11.5px] text-slate-300">{Math.round(u.score)}</span>
                    <button
                      onClick={() => onInspect?.(u)}
                      className="tap shrink-0 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-[10px] font-semibold text-slate-300 transition hover:border-brand/40 hover:text-brand"
                    >
                      Inspeksi
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[9.5px] text-slate-500">{u.wilayah || '—'}</span>
                    <p className="min-w-0 flex-1 truncate text-[10px] text-slate-400" title={u.spec || u.unit}>{u.spec || u.unit}</p>
                    <div className="w-12 shrink-0 sm:w-16">
                      <Bar value={u.score} color={scoreColor(u.score, u.status)} height={4} />
                    </div>
                    <span className="shrink-0 font-mono text-[9.5px]">
                      <span className="text-emerald-400">{u.a}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-amber-400">{u.b}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-rose-400">{u.c}</span>
                    </span>
                  </div>
                </div>
              )
            })}
            {!units.length && (
              <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-6 text-center text-[11.5px] text-slate-500">
                Tidak ada unit {isIrr ? 'irrigator' : 'mesin'} pada rentang ini.
              </p>
            )}
          </div>

          {totalHalaman > 1 && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
              <button
                onClick={() => setPage(Math.max(0, halamanAman - 1))}
                disabled={halamanAman === 0}
                className="btn-ghost !px-2.5 !py-1 !text-[11px] max-sm:!min-h-10"
                aria-label="Halaman sebelumnya"
              >
                ‹ Sebelumnya
              </button>
              <span className="shrink-0 font-mono text-[11px] text-slate-400">
                {halamanAman + 1} / {totalHalaman}
              </span>
              <button
                onClick={() => setPage(Math.min(totalHalaman - 1, halamanAman + 1))}
                disabled={halamanAman >= totalHalaman - 1}
                className="btn-ghost !px-2.5 !py-1 !text-[11px] max-sm:!min-h-10"
                aria-label="Halaman berikutnya"
              >
                Berikutnya ›
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/[0.08] bg-ink-900/80 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
            {pct(analisa.n, totalTipe)}% dari total {isIrr ? 'irrigator' : 'mesin'}
          </p>
          <button className="btn-ghost !py-1.5 !text-[11.5px]" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Stat({ label, value, unit, accent }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2">
      <p className="truncate text-[9.5px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-[17px] font-semibold leading-none" style={{ color: accent }}>
        {value}
        <span className="ml-1 text-[9.5px] font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  )
}

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx, kondisiUnit } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { GradePill, KondisiPill, StatusPill, ScoreRing } from '../components/ui'
import { IconX, IconAlert, IconClipboard, IconTruck, IconDroplet } from '../components/icons'
import { GROUP_ICON } from '../components/icons'

export default function DetailDrawer({ unit, data, records, onClose, navigate }) {
  const groups = unit.tipe === 'Mesin' ? data.groups.mesin : data.groups.irrigator
  const history = records.filter((r) => r.tipe === unit.tipe && r.kode === unit.kode).slice(0, 4)

  /* tutup dengan Esc + kunci scroll latar (hanya selama drawer tampil) */
  useScrollLock(!!unit)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modal = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Detail unit ${unit.kode}`}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl animate-fade-up flex-col overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-2xl sm:max-h-[92vh]">
        {/* ---------- header ---------- */}
        <div className="relative flex shrink-0 items-start gap-3 border-b border-slate-900/[0.09] bg-gradient-to-r from-brand/[0.09] via-transparent to-transparent px-4 py-3.5 sm:px-5">
          <ScoreRing score={unit.score} size={50} stroke={5} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[15px] font-bold text-slate-900">{unit.kode}</p>
              <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]', unit.tipe === 'Mesin' ? 'border-teal-600/25 bg-teal-600/10 text-teal-700' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700')}>
                {unit.tipe === 'Mesin' ? <IconTruck size={10} /> : <IconDroplet size={10} />} {unit.tipe}
              </span>
              <StatusPill status={unit.status} />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-600">
              {[unit.spec || unit.unit, unit.wilayah, unit.power && `${unit.power} HP`, unit.pompa, unit.nozzle && `Nozzle ${unit.nozzle}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-900/10 bg-slate-900/[0.03] p-1.5 text-slate-600 transition hover:border-slate-900/20 hover:text-slate-900"
            aria-label="Tutup detail"
          >
            <IconX size={15} />
          </button>
        </div>

        {/* ---------- body ---------- */}
        <div className="scroll-area min-h-0 flex-1 space-y-3 px-4 py-4 sm:px-5">
          {/* rekap + aksi */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid flex-1 grid-cols-4 gap-1.5">
              {[
                { k: 'A', v: unit.a, c: 'text-emerald-600', l: 'Baik' },
                { k: 'B', v: unit.b, c: 'text-amber-600', l: 'Perhatian' },
                { k: 'C', v: unit.c, c: 'text-rose-600', l: 'Rusak' },
                { k: 'Total', v: unit.total, c: 'text-slate-800', l: 'Komponen' },
              ].map((x) => (
                <div key={x.k} className="rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.02] px-2 py-2 text-center">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">{x.k}</p>
                  <p className={cx('font-mono text-[15px] font-semibold leading-tight', x.c)}>{x.v}</p>
                  <p className="text-[8.5px] text-slate-400">{x.l}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 sm:w-auto">
              <KondisiPill kondisi={kondisiUnit(unit)} />
              {String(unit.status).toLowerCase() === 'rusak' && unit.score >= 70 && (
                <span className="text-[10px] text-rose-600/80" title="Aturan: unit berstatus Rusak otomatis dinilai Kritis">
                  status Rusak → Kritis
                </span>
              )}
              {unit.komoditi && <span className="chip">{unit.komoditi}</span>}
            </div>
          </div>

          {unit.keterangan && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-[11.5px] leading-relaxed text-amber-700/90">
              <span className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                <IconAlert size={12} /> Keterangan master
              </span>
              {unit.keterangan}
            </div>
          )}

          {/* komponen per kelompok — 2 kolom di layar lebar */}
          <div className="grid gap-2.5 md:grid-cols-2">
            {groups.map((g) => {
              const Icon = GROUP_ICON[g.id] || IconClipboard
              const bad = g.items.filter((i) => unit.components?.[i] === 'B' || unit.components?.[i] === 'C').length
              return (
                <div key={g.id} className="rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.02]">
                  <div className="flex items-center gap-2 border-b border-slate-900/[0.09] px-3 py-2">
                    <Icon size={13} className="text-slate-500" />
                    <span className="truncate text-[11px] font-semibold text-slate-800">{g.label}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
                      {bad > 0 ? <span className="text-amber-600">{bad} temuan</span> : <span className="text-emerald-600">OK</span>}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-900/[0.06]">
                    {g.items.map((it) => (
                      <div key={it} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="flex-1 text-[11.5px] leading-snug text-slate-600">{it}</span>
                        <GradePill value={unit.components?.[it]} size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* riwayat */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Riwayat inspeksi</p>
            {history.length ? (
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.02] px-3 py-2">
                    <span className="font-mono text-[11px] text-slate-700">{h.tanggal}</span>
                    <span className="truncate text-[10.5px] text-slate-500">{h.inspector || '—'}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-emerald-600">{h.a}</span>
                      <span className="font-mono text-[10px] text-amber-600">{h.b}</span>
                      <span className="font-mono text-[10px] text-rose-600">{h.c}</span>
                      <KondisiPill kondisi={h.kondisi} />
                      <span className="font-mono text-[11px] font-semibold text-slate-800">{h.skor}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-900/10 px-3 py-3 text-center text-[11px] text-slate-500">
                Belum ada riwayat inspeksi untuk unit ini.
              </p>
            )}
          </div>
        </div>

        {/* ---------- footer aksi ---------- */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-900/[0.09] bg-white/90 px-4 py-3 sm:px-5">
          <button className="btn-ghost !text-[12px]" onClick={onClose}>Tutup</button>
          <button
            className="btn-primary ml-auto !text-[12px]"
            onClick={() => { onClose(); navigate('inspeksi', { tipe: unit.tipe, kode: unit.kode }) }}
          >
            <IconClipboard size={14} /> Inspeksi unit ini
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

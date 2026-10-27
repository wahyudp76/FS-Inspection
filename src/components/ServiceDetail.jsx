import React, { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { serviceStatusMeta } from '../lib/config'
import { riwayatUnit, INTERVAL_HM } from '../lib/service'
import { IconWrench, IconX, IconHistory, IconAlert } from './icons'

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('id-ID').format(n))

/** Detail satu engine: jadwal, HM, dan seluruh riwayat service-nya dari tb_service2. */
export default function ServiceDetail({ unit, log = [], onClose, onCatat }) {
  useScrollLock(!!unit)

  useEffect(() => {
    if (!unit) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [unit, onClose])

  const riwayat = useMemo(() => (unit ? riwayatUnit(log, unit.kode) : []), [unit, log])
  if (!unit) return null

  const m = serviceStatusMeta(unit.status)
  const sisa = unit.sisaHari
  const progres = unit.hm != null && unit.nextHm ? Math.min(100, Math.round((unit.hm / unit.nextHm) * 100)) : null

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Detail service ${unit.kode}`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => onClose?.()} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-900/10 bg-white shadow-2xl sm:max-w-[560px] sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-slate-900/[0.10] px-4 py-3.5">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <IconWrench size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-[15px] font-semibold text-slate-900">{unit.kode}</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {unit.jenis} · Posisi {unit.posisi || '—'} · interval {INTERVAL_HM} HM
            </p>
          </div>
          <span className={cx('mt-1 shrink-0 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold', m.cls)}>{m.label}</span>
          <button onClick={() => onClose?.()} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900" aria-label="Tutup">
            <IconX size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {sisa != null && (
            <div className={cx('mb-3 rounded-xl border p-3', sisa < 0 ? 'border-rose-500/40 bg-rose-500/10' : sisa <= 7 ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-900/[0.10] bg-slate-900/[0.02]')}>
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
                <IconAlert size={13} className={sisa < 0 ? 'text-rose-600' : sisa <= 7 ? 'text-amber-700' : 'text-slate-600'} />
                {sisa > 0 ? `Jatuh tempo dalam ${sisa} hari` : sisa === 0 ? 'Jatuh tempo hari ini' : `Sudah lewat ${-sisa} hari dari warning date`}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Jadwal sheet: {unit.nextIso || '—'} · sisa HM {unit.hm != null && unit.nextHm != null ? fmt(unit.nextHm - unit.hm) : '—'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Service terakhir', unit.terakhirIso || 'Belum pernah'],
              ['HM terakhir', fmt(unit.hm)],
              ['Next service', unit.nextIso || '—'],
              ['Next HM', fmt(unit.nextHm)],
              ['Rerata HM/hari', unit.rerata ? fmt(unit.rerata) : '—'],
              ['Warning date', unit.warning != null ? (unit.warning > 0 ? `+${unit.warning} hari` : `${unit.warning} hari`) : '—'],
              ['Pencatatan', `${riwayat.length} kali`],
              ['Catatan sheet', unit.note || '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.02] p-2">
                <p className="text-[9.5px] uppercase tracking-wider text-slate-500">{l}</p>
                <p className="mt-0.5 truncate font-mono text-[12px] font-semibold text-slate-900">{v}</p>
              </div>
            ))}
          </div>

          {progres != null && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-slate-500">
                <span>HM terpakai menuju service berikutnya</span>
                <span className="font-mono text-slate-700">{progres}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.05]">
                <div className={cx('h-full rounded-full', progres >= 90 ? 'bg-rose-400' : progres >= 75 ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${progres}%` }} />
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <IconHistory size={12} /> Riwayat service (tb_service2)
            </p>
            {riwayat.length ? (
              <div className="mt-2 space-y-1.5">
                {riwayat.map((r, i) => (
                  <div key={`${r.tanggal}-${r.no}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.02] px-2.5 py-2">
                    <span className="w-[74px] shrink-0 font-mono text-[11px] text-slate-700">{r.tanggal || '—'}</span>
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-500">
                      {r.bulan} · minggu {r.minggu ?? '—'} · {r.posisi || '—'}
                    </span>
                    <span className="shrink-0 font-mono text-[11.5px] font-semibold text-slate-900">HM {fmt(r.hm)}</span>
                    {r.hmDelta != null && (
                      <span
                        className={cx('w-[62px] shrink-0 text-right font-mono text-[10px]', r.hmAnomali ? 'text-amber-700' : 'text-emerald-700')}
                        title={r.hmAnomali ? 'Lonjakan HM tidak wajar — periksa input HM di sheet' : 'Kenaikan HM sejak service sebelumnya'}
                      >
                        {r.hmAnomali ? '⚠ ' : ''}+{fmt(r.hmDelta)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.02] px-3 py-3 text-[11.5px] text-slate-500">
                Belum ada catatan service untuk unit ini di sheet “Monitor Kasie FS”.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-900/[0.10] px-4 py-3">
          <button onClick={() => onClose?.()} className="btn-ghost flex-1 justify-center !py-2.5">Tutup</button>
          <button onClick={() => onCatat?.(unit)} className="btn-primary flex-1 justify-center !py-2.5">
            <IconWrench size={14} /> Catat Service
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

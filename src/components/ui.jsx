import { createPortal } from 'react-dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '../lib/analytics'
import { gradeMeta, kondisiMeta, statusUnitMeta } from '../lib/config'
import { IconAlert, IconChevronDown, IconCheck, IconSearch, IconX } from './icons'

export const Card = ({ className = '', children, ...p }) => (
  // min-w-0: cegah item grid/flex membengkak mengikuti isi (mis. tabel lebar) di layar kecil
  <div className={cx('card min-w-0', className)} {...p}>
    {children}
  </div>
)

export function CardHeader({ title, sub, right, icon }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-start gap-2.5">
        {/* ikon judul dalam ubin bergradasi teal (aksesori visual, konsisten di semua kartu) */}
        {icon && (
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-700 ring-1 ring-inset ring-teal-600/15">
            {icon}
          </span>
        )}
        <div>
          <h3 className="card-title">{title}</h3>
          {sub && <p className="card-sub mt-0.5">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

/* ------------------------------- KPI ------------------------------- */
export function Kpi({ label, value, unit, hint, icon, accent = '#0d9488', trend, onClick, active }) {
  /* Tanpa onClick kartu ini murni informasi — jangan dirender sebagai <button>,
     supaya tidak jadi "tombol mati" yang bisa ditekan tanpa reaksi. */
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick, 'aria-label': `${label}: ${value}${unit ? ' ' + unit : ''}` } : {})}
      className={cx(
        'card card-pad group relative min-w-0 overflow-hidden text-left transition',
        onClick && 'hover:-translate-y-0.5 hover:border-slate-900/15',
        active && 'ring-1 ring-brand/60'
      )}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.16] blur-2xl transition group-hover:opacity-30"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className="rounded-lg p-1.5" style={{ background: `${accent}1f`, color: accent }}>
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-semibold leading-none tracking-tight text-slate-900">{value}</span>
        {unit && <span className="text-[11px] font-medium text-slate-500">{unit}</span>}
      </div>
      {hint && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
      {typeof trend === 'number' && (
        <span className={cx('mt-2 inline-flex items-center gap-1 text-[11px] font-semibold', trend >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
        </span>
      )}
      {onClick && (
        <span className="absolute bottom-2.5 right-2.5 text-slate-400 transition group-hover:text-brand" aria-hidden="true">
          <IconChevronRightMini />
        </span>
      )}
    </Tag>
  )
}

function IconChevronRightMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

/* ----------------------------- Badges ----------------------------- */
export const GradePill = ({ value, size = 'sm', showLabel = false }) => {
  const m = gradeMeta(value)
  if (!m) return <span className="text-slate-400">—</span>
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border font-semibold',
        m.cls,
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      )}
      title={`${m.label} — ${m.desc}`}
    >
      {m.short}
      {showLabel && <span className="font-medium opacity-80">{m.label}</span>}
    </span>
  )
}

export const KondisiPill = ({ kondisi }) => {
  const m = kondisiMeta(kondisi)
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold', m.cls)}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
    {kondisi}
  </span>
}

export const StatusPill = ({ status }) => {
  const m = statusUnitMeta(status)
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', m.cls)}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
    {status || '—'}
  </span>
}

/* ---------------------------- Progress ---------------------------- */
export const Bar = ({ value, color = '#0d9488', height = 6, track = 'rgba(15,42,46,0.10)' }) => (
  <div className="relative w-full overflow-hidden rounded-full" style={{ height, background: track }}>
    <div
      className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
      style={{ width: `${Math.max(value > 0 ? 3 : 0, Math.min(100, value))}%`, background: color }}
    />
  </div>
)

export function ScoreRing({ score, size = 64, stroke = 6, color }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const col = color || (score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#f43f5e')
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={col}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * Math.min(100, Math.max(0, score))) / 100}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <span className="absolute font-mono text-[13px] font-semibold text-slate-900">{Math.round(score)}</span>
    </div>
  )
}

/* ----------------------------- Misc ------------------------------ */
export const Empty = ({ title, desc, action, icon }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <div className="rounded-2xl border border-slate-900/10 bg-slate-900/[0.03] p-3 text-slate-500">{icon || <IconAlert size={20} />}</div>
    <p className="text-[13px] font-semibold text-slate-700">{title}</p>
    {desc && <p className="max-w-sm text-[11px] leading-relaxed text-slate-500">{desc}</p>}
    {action}
  </div>
)

export const Skeleton = ({ className = '' }) => (
  <div className={cx('animate-pulse rounded-lg bg-slate-900/[0.05]', className)} />
)

export const Toast = ({ toast, onClose, duration }) => {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const timerRef = useRef(null)
  const startRef = useRef(0)
  const remainRef = useRef(0)
  const [paused, setPaused] = useState(false)

  // durasi tampil: error lebih lama supaya sempat dibaca
  const ms = duration ?? (toast?.type === 'error' ? 7000 : 4000)

  useEffect(() => {
    if (!toast) return undefined
    remainRef.current = ms
    startRef.current = Date.now()
    setPaused(false)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => closeRef.current?.(), ms)
    return () => clearTimeout(timerRef.current)
  }, [toast, ms])

  // jeda saat kursor di atas notifikasi (biar tidak hilang ketika mau dibaca)
  const pause = () => {
    if (!toast) return
    clearTimeout(timerRef.current)
    remainRef.current = Math.max(800, remainRef.current - (Date.now() - startRef.current))
    setPaused(true)
  }
  const resume = () => {
    if (!toast) return
    startRef.current = Date.now()
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => closeRef.current?.(), remainRef.current)
    setPaused(false)
  }

  if (!toast) return null
  const type = toast.type || 'info'
  const tones = {
    success: { ring: 'border-emerald-400/45', accent: 'bg-emerald-400', chip: 'bg-emerald-400/15 text-emerald-700 border-emerald-400/30', title: 'text-emerald-700', icon: 'M20 6 9 17l-5-5' },
    error: { ring: 'border-rose-400/45', accent: 'bg-rose-400', chip: 'bg-rose-400/15 text-rose-600 border-rose-400/30', title: 'text-rose-700', icon: 'M12 8v5M12 16.5v.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z' },
    info: { ring: 'border-teal-500/45', accent: 'bg-teal-500', chip: 'bg-teal-500/15 text-teal-700 border-teal-500/30', title: 'text-teal-700', icon: 'M12 16v-5M12 8v.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z' },
  }
  const t = tones[type] || tones.info
  const label = { success: 'Berhasil', error: 'Gagal', info: 'Informasi' }[type] || 'Informasi'

  return createPortal(
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4 sm:bottom-6 lg:pl-[268px] lg:pr-8">
      <div
        role="status"
        aria-live="polite"
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={resume}
        className={cx(
          'pointer-events-auto relative flex w-full max-w-[26rem] items-start gap-3 overflow-hidden rounded-2xl border',
          'bg-[#0d1524]/[0.97] px-3.5 pb-4 pt-3 pr-2.5 text-[12px] text-slate-800',
          'shadow-[0_24px_60px_-18px_rgba(0,0,0,0.95),0_2px_10px_-2px_rgba(0,0,0,0.7)] ring-1 ring-slate-900/[0.04] backdrop-blur-xl',
          t.ring
        )}
      >
        <span className={cx('absolute inset-y-0 left-0 w-[3px]', t.accent)} />
        <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border', t.chip)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d={t.icon} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className={cx('text-[10px] font-bold uppercase tracking-[0.14em]', t.title)}>{label}</p>
          <p className="mt-0.5 leading-relaxed text-slate-800">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="-mr-0.5 shrink-0 rounded-lg border border-slate-900/10 bg-slate-900/[0.04] p-1.5 text-slate-600 transition hover:border-slate-900/20 hover:bg-slate-900/10 hover:text-slate-900"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {/* bilah waktu: menyusut selama notifikasi tampil */}
        <span
          className={cx('toast-bar absolute bottom-0 left-0 h-[2px] w-full', t.accent)}
          style={{ animationDuration: `${ms}ms`, animationPlayState: paused ? 'paused' : 'running', opacity: 0.75 }}
        />
      </div>
    </div>,
    document.body
  )
}

export function Select({ value, onChange, options, className = '', placeholder }) {
  return (
    <div className={cx('relative', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input appearance-none pr-8"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const lab = typeof o === 'string' ? o : o.label
          return <option key={val} value={val} className="bg-white">{lab}</option>
        })}
      </select>
      <IconChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>
  )
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-900/10 bg-white/85 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-semibold transition',
            'max-sm:min-h-9',
            size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-1.5 text-[12px]',
            value === o.value ? 'bg-slate-900/10 text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------- MultiSelect ------------------------- */
/**
 * Dropdown filter model checklist: bisa pilih lebih dari satu nilai.
 * value: array of string. Array kosong = "semua".
 */
export function MultiSelect({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Semua',
  counts = null,
  searchable,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const withSearch = searchable ?? options.length > 8
  const shown = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return qq ? options.filter((o) => String(o).toLowerCase().includes(qq)) : options
  }, [options, q])

  const toggle = (opt) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt])

  const active = value.length > 0

  return (
    <div ref={boxRef} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[12px] transition',
          active
            ? 'border-brand/50 bg-brand/10 text-slate-900'
            : 'border-slate-900/10 bg-white text-slate-700 hover:border-slate-900/15'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
      >
        <span className="min-w-0 flex-1 truncate">
          {active ? (
            <span className="flex items-center gap-1.5">
              <span className="rounded-md bg-brand/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand">{value.length}</span>
              <span className="truncate text-slate-800">{value.length === 1 ? value[0] : `${label} dipilih`}</span>
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]) } }}
            className="rounded p-0.5 text-slate-500 hover:text-rose-600"
            title="Bersihkan filter"
          >
            <IconX size={12} />
          </span>
        )}
        <IconChevronDown size={14} className={cx('shrink-0 text-slate-500 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-full min-w-[210px] animate-fade-up overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-2 border-b border-slate-900/[0.09] px-2.5 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange([...options])}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/10"
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-900/5"
              >
                Reset
              </button>
            </div>
          </div>

          {withSearch && (
            <div className="relative border-b border-slate-900/[0.09] p-1.5">
              <IconSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari…"
                className="w-full rounded-lg border border-slate-900/10 bg-white px-2 py-1 pl-7 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-brand/50 focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {shown.map((opt) => {
              const checked = value.includes(opt)
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt)}
                  className={cx(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11.5px] transition',
                    checked ? 'bg-brand/10 text-slate-900' : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-800'
                  )}
                >
                  <span
                    className={cx(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition',
                      checked ? 'border-brand bg-brand text-white' : 'border-slate-900/20 bg-transparent'
                    )}
                  >
                    {checked && <IconCheck size={10} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{opt || '—'}</span>
                  {counts && <span className="shrink-0 font-mono text-[10px] text-slate-500">{counts[opt] ?? 0}</span>}
                </button>
              )
            })}
            {!shown.length && <p className="px-3 py-3 text-center text-[11px] text-slate-500">Tidak ada pilihan</p>}
          </div>

          <div className="flex items-center justify-between border-t border-slate-900/[0.09] px-2.5 py-1.5">
            <span className="text-[10px] text-slate-500">{value.length ? `${value.length} dipilih` : 'Semua data'}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-900/5">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

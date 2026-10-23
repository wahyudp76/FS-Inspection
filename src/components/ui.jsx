import React from 'react'
import { cx } from '../lib/analytics'
import { gradeMeta, kondisiMeta, statusUnitMeta } from '../lib/config'
import { IconAlert, IconChevronDown } from './icons'

export const Card = ({ className = '', children, ...p }) => (
  <div className={cx('card', className)} {...p}>
    {children}
  </div>
)

export function CardHeader({ title, sub, right, icon }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand">{icon}</span>}
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
export function Kpi({ label, value, unit, hint, icon, accent = '#38bdf8', trend, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'card card-pad group relative overflow-hidden text-left transition',
        onClick && 'hover:-translate-y-0.5 hover:border-white/15',
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
        <span className="font-mono text-[26px] font-semibold leading-none tracking-tight text-white">{value}</span>
        {unit && <span className="text-[11px] font-medium text-slate-500">{unit}</span>}
      </div>
      {hint && <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{hint}</p>}
      {typeof trend === 'number' && (
        <span className={cx('mt-2 inline-flex items-center gap-1 text-[11px] font-semibold', trend >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
        </span>
      )}
    </button>
  )
}

/* ----------------------------- Badges ----------------------------- */
export const GradePill = ({ value, size = 'sm', showLabel = false }) => {
  const m = gradeMeta(value)
  if (!m) return <span className="text-slate-600">—</span>
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
export const Bar = ({ value, color = '#38bdf8', height = 6, track = 'rgba(255,255,255,0.06)' }) => (
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
      <span className="absolute font-mono text-[13px] font-semibold text-white">{Math.round(score)}</span>
    </div>
  )
}

/* ----------------------------- Misc ------------------------------ */
export const Empty = ({ title, desc, action, icon }) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-slate-500">{icon || <IconAlert size={20} />}</div>
    <p className="text-[13px] font-semibold text-slate-300">{title}</p>
    {desc && <p className="max-w-sm text-[11px] leading-relaxed text-slate-500">{desc}</p>}
    {action}
  </div>
)

export const Skeleton = ({ className = '' }) => (
  <div className={cx('animate-pulse rounded-lg bg-white/[0.06]', className)} />
)

export const Toast = ({ toast, onClose }) => {
  if (!toast) return null
  const tone = {
    success: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-200',
    error: 'border-rose-500/40 bg-rose-500/12 text-rose-200',
    info: 'border-sky-500/40 bg-sky-500/12 text-sky-200',
  }[toast.type || 'info']
  return (
    <div className="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-fade-up sm:bottom-6">
      <div className={cx('flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[12px] shadow-2xl backdrop-blur-md', tone)}>
        <p className="flex-1 leading-relaxed">{toast.message}</p>
        <button onClick={onClose} className="text-current/70 hover:text-current" aria-label="Tutup">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
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
          return <option key={val} value={val} className="bg-ink-800">{lab}</option>
        })}
      </select>
      <IconChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>
  )
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-ink-900/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[10px] font-semibold transition',
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]',
            value === o.value ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

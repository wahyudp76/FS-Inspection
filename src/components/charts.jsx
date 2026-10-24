import React from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Line, ComposedChart, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Legend, LabelList,
} from 'recharts'
import { cx } from '../lib/analytics'

const AXIS = { stroke: 'rgba(148,163,184,0.35)', tick: { fill: '#64748b', fontSize: 11 } }

export function TipBox({ active, payload, label, suffix = '', formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2 shadow-2xl backdrop-blur">
      {label != null && <p className="mb-1 text-[11px] font-semibold text-slate-200">{label}</p>}
      <div className="space-y-0.5">
        {payload.filter((p) => p.value != null && p.value !== 0).map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-slate-400">{p.name}</span>
            <span className="ml-auto font-mono font-semibold text-slate-100">
              {formatter ? formatter(p.value, p) : `${p.value}${suffix}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --------------------------- Donut --------------------------- */
export function Donut({ data, height = 210, innerRadius = 54, outerRadius = 78, centerLabel, centerValue, onSlice, showLegend = true }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div>
      <div style={{ height }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={3}
              stroke="none"
              onClick={(d) => onSlice?.(d?.name || d?.payload?.name)}
            >
              {data.map((d) => <Cell key={d.name} fill={d.color} className={onSlice ? 'cursor-pointer' : ''} />)}
            </Pie>
            <Tooltip content={<TipBox formatter={(v) => `${v} unit · ${total ? Math.round((v / total) * 100) : 0}%`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold text-white">{centerValue ?? total}</span>
          {centerLabel && <span className="text-[10px] uppercase tracking-wider text-slate-500">{centerLabel}</span>}
        </div>
      </div>
      {showLegend && (
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {data.map((d) => (
            <button
              key={d.name}
              onClick={() => onSlice?.(d.name)}
              className={cx('rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left transition', onSlice && 'hover:bg-white/[0.06]')}
            >
              <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="font-mono text-[13px] font-semibold text-slate-100">{d.value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------- Wilayah stacked bar --------------------- */
export function WilayahChart({ data, height = 230, onBar }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="wilayah" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        <Bar dataKey="terpasang" name="Terpasang" stackId="a" fill="#38bdf8" radius={[0, 0, 0, 0]} onClick={(d) => onBar?.(d?.wilayah)} />
        <Bar dataKey="standby" name="Standby" stackId="a" fill="#a78bfa" />
        <Bar dataKey="rusak" name="Rusak" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------ Komponen bermasalah (horizontal) ------------------ */
export function IssuesBar({ data, height = 300, onItem }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 26, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" horizontal={false} />
        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={138}
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#cbd5e1', fontSize: 10 }}
          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="b" name="Perlu Perhatian (B)" stackId="s" fill="#f59e0b" onClick={(d) => onItem?.(d)} />
        <Bar dataKey="c" name="Rusak (C)" stackId="s" fill="#f43f5e" radius={[0, 4, 4, 0]} onClick={(d) => onItem?.(d)}>
          <LabelList dataKey="issue" position="right" style={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* --------------------------- Radar grup --------------------------- */
export function GroupRadar({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="78%" margin={{ top: 12, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="rgba(148,163,184,0.16)" />
        <PolarAngleAxis dataKey="grup" tick={{ fill: '#94a3b8', fontSize: 9.5 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip content={<TipBox formatter={(v) => `${v}%`} />} />
        <Radar name="Skor kondisi" dataKey="nilai" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.28} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/* ------------------------ Trend inspeksi ------------------------ */
export function TrendChart({ data, height = 250, showSkor = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gIns" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10.5 }} />
        <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
        {showSkor && (
          <YAxis yAxisId="r" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
        )}
        <Tooltip content={<TipBox />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        <Area yAxisId="l" type="monotone" dataKey="inspeksi" name="Jumlah inspeksi" stroke="#38bdf8" strokeWidth={2} fill="url(#gIns)" />
        {showSkor && <Line yAxisId="r" type="monotone" dataKey="skor" name="Skor rata-rata" stroke="#34d399" strokeWidth={2} dot={{ r: 2.5, fill: '#34d399' }} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ------------------ Distribusi skor (histogram) ------------------ */
export function ScoreHistogram({ data, height = 180, onBucket }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 6, left: -14, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Bar dataKey="count" name="Unit" radius={[5, 5, 0, 0]} onClick={(d) => onBucket?.(d?.label)} maxBarSize={38}>
          <LabelList dataKey="count" position="top" style={{ fill: '#cbd5e1', fontSize: 10.5, fontWeight: 700 }} />
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------ Distribusi skor: Mesin vs Irrigator ------------------ */
/**
 * Histogram dua batang per rentang. Klik batang → `onBar({ range, tipe })`
 * untuk membuka pop-up daftar unit + analisis rentang tersebut.
 */
export function ScoreHistogramSplit({ data, height = 200, onBar }) {
  const klik = (tipe) => (d) => {
    const label = d?.label ?? d?.payload?.label
    const range = data.find((x) => x.label === label)
    if (range) onBar?.({ range, tipe })
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 6, left: -16, bottom: 0 }} barCategoryGap="24%" barGap={2}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<TipBox suffix=" unit" />} />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 10.5, paddingTop: 2 }}
          formatter={(v) => <span style={{ color: '#94a3b8' }}>{v}</span>}
        />
        <Bar dataKey="mesin" name="Mesin (engine)" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={26} onClick={klik('Mesin')} cursor="pointer">
          <LabelList dataKey="mesin" position="top" style={{ fill: '#bae6fd', fontSize: 9.5, fontWeight: 700 }} />
        </Bar>
        <Bar dataKey="irrigator" name="Irrigator" fill="#22d3ee" radius={[4, 4, 0, 0]} maxBarSize={26} onClick={klik('Irrigator')} cursor="pointer">
          <LabelList dataKey="irrigator" position="top" style={{ fill: '#a5f3fc', fontSize: 9.5, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------ Mini sparkline untuk KPI ------------------ */
export function Spark({ data, color = '#38bdf8', height = 34 }) {
  if (!data?.length) return <div style={{ height }} />
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#sp-${color.replace('#', '')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/* ------------------ A/B/C stacked over period ------------------ */
export function GradeStack({ data, height = 220 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -26, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10.5 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" temuan" />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="a" name="A · Baik" stackId="g" fill="#22c55e" />
        <Bar dataKey="b" name="B · Perhatian" stackId="g" fill="#f59e0b" />
        <Bar dataKey="c" name="C · Rusak" stackId="g" fill="#f43f5e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

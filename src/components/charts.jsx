export function GradeStack({ data = [], height = 220, minH = 220 }) {
  /* Skala 100% (bukan jumlah mentah): komponen “A” bisa ribuan kali lipat B/C,
     sehingga batang B & C nyaris tak terlihat bila memakai angka mentah. */
  const rows = data.map((d) => {
    const total = (d.a || 0) + (d.b || 0) + (d.c || 0)
    const bag = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0)
    return { ...d, total, aPct: bag(d.a), bPct: bag(d.b), cPct: bag(d.c) }
  })
  const TipGrade = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const r = payload[0].payload
    const baris = [
      ['A · Baik', r.a, '#22c55e'],
      ['B · Perhatian', r.b, '#f59e0b'],
      ['C · Rusak', r.c, '#f43f5e'],
    ]
    return (
      <div className="rounded-xl border border-slate-900/[0.09] bg-white px-3 py-2 text-[11px] shadow-card">
        <p className="mb-1 font-semibold text-slate-800">{r.label}</p>
        {baris.map(([nama, nilai, warna]) => (
          <div key={nama} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: warna }} />
            <span className="text-slate-600">{nama}</span>
            <span className="ml-auto font-mono font-semibold text-slate-900">
              {nilai || 0}
              <span className="ml-1 font-normal text-slate-500">
                ({r.total ? Math.round(((nilai || 0) / r.total) * 100) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <ChartBox height={height} minH={minH}>
      <ResponsiveContainer width="100%" height={rcHeight(height)}>
        <BarChart data={rows} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10.5 }} />
          <YAxis
            domain={[0, 100]}
            width={38}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<TipGrade />} />
          <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="aPct" name="A · Baik" stackId="g" fill="#22c55e" />
          <Bar dataKey="bPct" name="B · Perhatian" stackId="g" fill="#f59e0b" />
          <Bar dataKey="cPct" name="C · Rusak" stackId="g" fill="#f43f5e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
  )
}

import React from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, Line, ComposedChart, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Legend, LabelList,
} from 'recharts'
import { cx } from '../lib/analytics'

const AXIS = { stroke: 'rgba(148,163,184,0.35)', tick: { fill: '#64748b', fontSize: 11 } }

/**
 * Pembungkus grafik.
 *
 * `height` angka  → tinggi tetap (dipakai di HP / saat tata letak berderet).
 * `height="fill"` → grafik MENGISI sisa tinggi kartu (kartu harus `flex flex-col`
 *                   dan pembungkusnya `flex-1 min-h-0`), sehingga tidak ada ruang
 *                   kosong menganga di bawah grafik saat kartu sebelahnya lebih
 *                   tinggi. `minH` menjaga grafik tetap terbaca di layar pendek.
 */
export function ChartBox({ height = 240, minH = 150, maxH, rasio = 1.25, className = '', children }) {
  /* Mode "fill": kartu menentukan tinggi kotak (grid membuat semua kartu satu
     baris sama tinggi), lalu grafik digambar setinggi kotak itu — TETAPI
     pertumbuhannya dibatasi `rasio` x tinggi desain supaya grafik tidak melar
     vertikal. Sisa ruang dibagi rata atas-bawah (justify-center) sehingga
     tidak menumpuk jadi pita kosong di bawah grafik.

     Tinggi diukur (ResizeObserver) lalu diteruskan sebagai piksel: persentase
     (height:100%) kolaps bila tinggi induk `auto` (HP). */
  const [ref, ukur] = useHeight()
  if (height === 'fill') {
    const batas = Math.max(maxH ?? Math.round(minH * rasio), minH)
    const px = ukur ? Math.min(Math.max(ukur, minH), batas) : minH
    return (
      <div
        ref={ref}
        className={cx('flex w-full flex-1 flex-col justify-center', className)}
        style={{ minHeight: minH }}
      >
        <div className="w-full" style={{ height: px }}>
          {typeof children === 'function' ? children(px) : children}
        </div>
      </div>
    )
  }
  return (
    <div className={cx('w-full', className)} style={{ height }}>
      {typeof children === 'function' ? children(height) : children}
    </div>
  )
}

/** Tinggi elemen (px) — dipakai ChartBox mode "fill". */
export function useHeight() {
  const ref = React.useRef(null)
  const [h, setH] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setH(Math.round(e.contentRect.height)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, h]
}

/** Lebar elemen (px) — untuk menyesuaikan label grafik di layar sempit. */
export function useWidth() {
  const ref = React.useRef(null)
  const [w, setW] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Tinggi efektif untuk ResponsiveContainer. */
const rcHeight = (h) => (h === 'fill' ? '100%' : h)

export function TipBox({ active, payload, label, suffix = '', formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-900/10 bg-white px-3 py-2 shadow-2xl backdrop-blur">
      {label != null && <p className="mb-1 text-[11px] font-semibold text-slate-800">{label}</p>}
      <div className="space-y-0.5">
        {payload.filter((p) => p.value != null && p.value !== 0).map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color || p.fill }} />
            <span className="text-slate-600">{p.name}</span>
            <span className="ml-auto font-mono font-semibold text-slate-900">
              {formatter ? formatter(p.value, p) : `${p.value}${suffix}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --------------------------- Donut --------------------------- */
export function Donut({ data, height = 210, minH = 210, innerRadius = '52%', outerRadius = '76%', centerLabel, centerValue, onSlice, showLegend = true }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    /* Tinggi "fill" → donat ikut membesar (radius memakai persentase) sehingga
       tidak menyisakan bidang kosong saat kartu sebelahnya lebih tinggi. */
    <ChartBox height={height} minH={minH}>
      <div className="relative h-full w-full">
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
          <span className="font-mono text-xl font-semibold text-slate-900">{centerValue ?? total}</span>
          {centerLabel && <span className="text-[10px] uppercase tracking-wider text-slate-500">{centerLabel}</span>}
        </div>
      </div>
    </ChartBox>
  )
}

/** Legenda kotak (dipisah agar bisa diletakkan di luar area grafik). */
export function DonutLegend({ data, onSlice }) {
  if (!data.length) return null
  return (
    <div className="grid grid-cols-3 gap-1.5">
          {data.map((d) => (
            <button
              key={d.name}
              onClick={() => onSlice?.(d.name)}
              className={cx('rounded-lg border border-slate-900/[0.09] bg-slate-900/[0.02] px-2 py-1.5 text-left transition', onSlice && 'hover:bg-slate-900/[0.05]')}
            >
              <span className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
                {d.name}
              </span>
              <span className="font-mono text-[13px] font-semibold text-slate-900">{d.value}</span>
            </button>
          ))}
    </div>
  )
}

/* --------------------- Wilayah stacked bar --------------------- */
export function WilayahChart({ data, height = 230, minH = 230, onBar }) {
  return (
    <ChartBox height={height} minH={minH}>
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="wilayah" axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        <Bar dataKey="terpasang" name="Terpasang" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} onClick={(d) => onBar?.(d?.wilayah)} />
        <Bar dataKey="standby" name="Standby" stackId="a" fill="#7c3aed" />
        <Bar dataKey="rusak" name="Rusak" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
    </ChartBox>
  )
}

/* ------------------ Komponen bermasalah (horizontal) ------------------ */
export function IssuesBar({ data, height = 300, minH = 300, onItem }) {
  return (
    <ChartBox height={height} minH={minH}>
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 26, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" horizontal={false} />
        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={138}
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#3f4d5a', fontSize: 10 }}
          tickFormatter={(v) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="b" name="Perlu Perhatian (B)" stackId="s" fill="#f59e0b" onClick={(d) => onItem?.(d)} />
        <Bar dataKey="c" name="Rusak (C)" stackId="s" fill="#f43f5e" radius={[0, 4, 4, 0]} onClick={(d) => onItem?.(d)}>
          <LabelList dataKey="issue" position="right" style={{ fill: '#5b6b7c', fontSize: 10, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </ChartBox>
  )
}

/* --------------------------- Radar grup --------------------------- */
export function GroupRadar({ data, height = 260, minH = 260 }) {
  /* Label grup memanjang (“Instrument & Monitoring”) gampang terpotong di HP.
     Lebar kartu diukur: layar sempit → radius dikecilkan & margin dilebarkan. */
  const [ref, w] = useWidth()
  const sempit = w > 0 && w < 360
  return (
    <div ref={ref} className="h-full w-full">
      <ChartBox height={height} minH={minH}>
        <ResponsiveContainer width="100%" height={rcHeight(height)}>
          <RadarChart
            data={data}
            outerRadius={sempit ? '62%' : '74%'}
            margin={sempit ? { top: 10, right: 12, bottom: 6, left: 12 } : { top: 12, right: 20, bottom: 8, left: 20 }}
          >
            <PolarGrid stroke="rgba(148,163,184,0.16)" />
            <PolarAngleAxis dataKey="grup" tick={{ fill: '#5b6b7c', fontSize: sempit ? 8.5 : 9.5 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={<TipBox formatter={(v) => `${v}%`} />} />
            <Radar name="Skor kondisi" dataKey="nilai" stroke="#0d9488" fill="#0d9488" fillOpacity={0.28} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </ChartBox>
    </div>
  )
}

/* ------------------------ Trend inspeksi ------------------------ */
export function TrendChart({ data, height = 250, minH = 250, showSkor = true }) {
  return (
    <ChartBox height={height} minH={minH}>
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="gIns" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
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
        <Area yAxisId="l" type="monotone" dataKey="inspeksi" name="Jumlah inspeksi" stroke="#0d9488" strokeWidth={2} fill="url(#gIns)" />
        {showSkor && <Line yAxisId="r" type="monotone" dataKey="skor" name="Skor rata-rata" stroke="#059669" strokeWidth={2} dot={{ r: 2.5, fill: '#059669' }} />}
      </ComposedChart>
    </ResponsiveContainer>
    </ChartBox>
  )
}

/* ------------------ Distribusi skor (histogram) ------------------ */
export function ScoreHistogram({ data, height = 180, minH = 180, onBucket }) {
  return (
    <ChartBox height={height} minH={minH}>
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
      <BarChart data={data} margin={{ top: 18, right: 6, left: -14, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 10 }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
        <Bar dataKey="count" name="Unit" radius={[5, 5, 0, 0]} onClick={(d) => onBucket?.(d?.label)} maxBarSize={38}>
          <LabelList dataKey="count" position="top" style={{ fill: '#3f4d5a', fontSize: 10.5, fontWeight: 700 }} />
          {data.map((d) => <Cell key={d.label} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </ChartBox>
  )
}

/* ------------------ Distribusi skor: Mesin vs Irrigator ------------------ */
/**
 * Histogram dua batang per rentang. Klik batang → `onBar({ range, tipe })`
 * untuk membuka pop-up daftar unit + analisis rentang tersebut.
 */
export function ScoreHistogramSplit({ data, height = 200, minH = 200, onBar }) {
  const klik = (tipe) => (d) => {
    const label = d?.label ?? d?.payload?.label
    const range = data.find((x) => x.label === label)
    if (range) onBar?.({ range, tipe })
  }
  return (
    <ChartBox height={height} minH={minH}>
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
      <BarChart data={data} margin={{ top: 18, right: 6, left: -16, bottom: 0 }} barCategoryGap="24%" barGap={2}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 10 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<TipBox suffix=" unit" />} />
        <Legend
          iconType="circle"
          iconSize={7}
          wrapperStyle={{ fontSize: 10.5, paddingTop: 2 }}
          formatter={(v) => <span style={{ color: '#5b6b7c' }}>{v}</span>}
        />
        <Bar dataKey="mesin" name="Mesin (engine)" fill="#0d9488" radius={[4, 4, 0, 0]} maxBarSize={26} onClick={klik('Mesin')} cursor="pointer">
          <LabelList dataKey="mesin" position="top" style={{ fill: '#0f766e', fontSize: 9.5, fontWeight: 700 }} />
        </Bar>
        <Bar dataKey="irrigator" name="Irrigator" fill="#0891b2" radius={[4, 4, 0, 0]} maxBarSize={26} onClick={klik('Irrigator')} cursor="pointer">
          <LabelList dataKey="irrigator" position="top" style={{ fill: '#0e7490', fontSize: 9.5, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </ChartBox>
  )
}

/* ------------------ Mini sparkline untuk KPI ------------------ */
export function Spark({ data, color = '#0d9488', height = 34 }) {
  if (!data?.length) return <div style={{ height }} />
  return (
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
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


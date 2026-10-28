import React, { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from 'recharts'
import { cx } from '../lib/analytics'
import { TipBox, ChartBox } from './charts'
import { IconCheck } from './icons'

const rcHeight = (h) => (h === 'fill' ? '100%' : h)

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('id-ID').format(n))

/* ============================================================
   1. TREN SERVICE ENGINE
   Batang bertumpuk: service tepat interval / terlambat / lebih awal,
   garis: % tepat waktu, garis putus: jumlah unit berbeda yang diservice.
   ============================================================ */
export function TrenServiceChart({ data = [], height = 270, minH = 270 }) {
  const [mode, setMode] = useState('tepat')

  const ringkas = useMemo(() => {
    const t = data.reduce((a, d) => ({ tepat: a.tepat + d.tepat, telat: a.telat + d.telat, awal: a.awal + d.awal }), { tepat: 0, telat: 0, awal: 0 })
    const dinilai = t.tepat + t.telat + t.awal
    return { ...t, dinilai, pct: dinilai ? Math.round((t.tepat / dinilai) * 100) : 0 }
  }, [data])

  if (!data.length) return <p className="px-3 py-6 text-center text-[11.5px] text-slate-500">Belum ada pencatatan service untuk dibuat tren.</p>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 px-1">
        {[
          { id: 'tepat', label: 'Ketepatan interval' },
          { id: 'volume', label: 'Volume & unit' },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cx(
              'tap-sm rounded-lg border px-2 text-[10.5px] font-semibold transition',
              mode === m.id ? 'border-brand/50 bg-brand/15 text-slate-900' : 'border-slate-900/10 bg-slate-900/[0.02] text-slate-600 hover:text-slate-800'
            )}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-slate-500">
          {ringkas.dinilai} service dinilai · <span className={ringkas.pct >= 70 ? 'text-emerald-700' : ringkas.pct >= 40 ? 'text-amber-700' : 'text-rose-600'}>{ringkas.pct}% tepat</span>
        </span>
      </div>

      <ChartBox height={height} minH={minH} className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 6, left: -22, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.10)" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 10 }} />
          <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
          <YAxis
            yAxisId="r"
            orientation="right"
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#475569', fontSize: 9.5 }}
            unit="%"
          />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox />} />
          <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 2 }} />

          {mode === 'tepat' ? (
            <>
              <Bar yAxisId="l" dataKey="tepat" name="Tepat (225–275 HM)" stackId="k" fill="#22c55e" />
              <Bar yAxisId="l" dataKey="telat" name="Terlambat (> 275 HM)" stackId="k" fill="#f43f5e" />
              <Bar yAxisId="l" dataKey="awal" name="Lebih awal (< 225 HM)" stackId="k" fill="#0d9488" radius={[3, 3, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="tepatPct" name="% tepat waktu" stroke="#facc15" strokeWidth={2} dot={{ r: 2.5, fill: '#facc15' }} connectNulls />
            </>
          ) : (
            <>
              <Bar yAxisId="l" dataKey="sesi" name="Service dilakukan" fill="#0d9488" radius={[3, 3, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={i === data.length - 1 ? '#0d9488' : 'rgba(56,189,248,0.5)'} />
                ))}
              </Bar>
              <Line yAxisId="l" type="monotone" dataKey="unit" name="Unit berbeda" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2.5, fill: '#7c3aed' }} />
              <Line yAxisId="l" type="monotone" dataKey="deltaRata" name="Rata-rata selisih HM" stroke="#059669" strokeWidth={1.6} strokeDasharray="4 3" dot={false} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      </ChartBox>
    </div>
  )
}

/* ============================================================
   2. CAKUPAN PER DIVISI — fokus "belum service"
   Batang 100% bertumpuk per posisi + ringkasan angka & tombol saring.
   ============================================================ */
export function DivisiCakupanChart({ data = [], onPick, height = 190, minH = 190 }) {
  const urut = useMemo(() => [...data].sort((a, b) => b.belum - a.belum || b.total - a.total), [data])
  const total = urut.reduce((a, d) => a + d.total, 0)
  const belum = urut.reduce((a, d) => a + d.belum, 0)

  if (!urut.length) return <p className="px-3 py-6 text-center text-[11.5px] text-slate-500">Belum ada data divisi.</p>

  const barData = urut.map((d) => ({
    posisi: d.posisi,
    Aman: d.aman,
    'Jatuh tempo': d.segera,
    'Lewat jadwal': d.terlambat,
    'Data HM kurang': d.tanpaJadwal,
    'Belum service': d.belum,
    total: d.total,
    belum: d.belum,
  }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2 px-1">
        <p className="text-[10.5px] text-slate-500">
          <span className="font-mono text-[15px] font-semibold text-rose-600">{belum}</span> dari{' '}
          <span className="font-mono text-slate-700">{total}</span> engine belum pernah diservice
        </p>
        <span className="rounded-md border border-rose-500/35 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-600">
          {total ? Math.round((belum / total) * 100) : 0}%
        </span>
      </div>

      <ChartBox height={height} minH={minH} className="flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 34, left: 4, bottom: 0 }} barCategoryGap="26%">
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" horizontal={false} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9.5 }} allowDecimals={false} />
          <YAxis type="category" dataKey="posisi" width={44} axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 11, fontWeight: 600 }} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" unit" />} />
          <Bar dataKey="Aman" stackId="a" fill="#22c55e" />
          <Bar dataKey="Jatuh tempo" stackId="a" fill="#f59e0b" />
          <Bar dataKey="Lewat jadwal" stackId="a" fill="#f43f5e" />
          <Bar dataKey="Data HM kurang" stackId="a" fill="#7c3aed" />
          <Bar dataKey="Belum service" stackId="a" fill="#475569" radius={[0, 3, 3, 0]}>
            <LabelList dataKey="total" position="right" style={{ fill: '#5b6b7c', fontSize: 9.5 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </ChartBox>

      <div className="mt-2 grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4">
        {urut.map((d) => (
          <button
            key={d.posisi}
            onClick={() => onPick?.(d.posisi)}
            className="rounded-lg border border-slate-900/[0.10] bg-slate-900/[0.02] px-2 py-1.5 text-left transition hover:border-slate-900/15 hover:bg-slate-900/[0.04]"
            title={`Saring tabel ke divisi ${d.posisi}`}
          >
            <p className="flex items-center justify-between text-[10px] font-semibold text-slate-700">
              {d.posisi}
              <span className="font-mono text-[10px] text-slate-500">{d.total}</span>
            </p>
            <p className={cx('mt-0.5 font-mono text-[11px] font-semibold', d.belum ? 'text-rose-600' : 'text-emerald-700')}>
              {d.belum ? `${d.belum} belum` : 'lengkap'}
            </p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.06]">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${d.sudahPct}%` }} />
            </div>
            <p className="mt-0.5 text-[9px] text-slate-500">{d.sudah}/{d.total} pernah diservice · {d.sudahPct}%</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ============================================================
   3. SEBARAN URGENSI — sisa hari menuju warning date
   ============================================================ */
export function UrgensiChart({ data = [], onClickEmber, height = 200, minH = 200 }) {
  const total = data.reduce((a, d) => a + d.jumlah, 0)
  if (!total) return <p className="px-3 py-6 text-center text-[11.5px] text-slate-500">Belum ada jadwal untuk dihitung.</p>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartBox height={height} minH={minH} className="flex-1">
    <ResponsiveContainer width="100%" height={rcHeight(height)}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 30, left: 2, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" horizontal={false} />
          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9.5 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={104} axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 9.5 }} />
          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox suffix=" engine" />} />
          <Bar dataKey="jumlah" name="Engine" radius={[0, 3, 3, 0]} onClick={(d) => onClickEmber?.(d?.payload?.id || d?.id)} className="cursor-pointer">
            {data.map((d) => (
              <Cell key={d.id} fill={d.color} />
            ))}
            <LabelList dataKey="jumlah" position="right" style={{ fill: '#3f4d5a', fontSize: 10 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartBox>
      <p className="shrink-0 px-1 text-[10px] leading-relaxed text-slate-500">
        Diurut dari yang paling mendesak. Klik batang untuk menyaring tabel evaluasi.
      </p>
    </div>
  )
}

/* ============================================================
   4. TOP 10 ENGINE PALING TERLAMBAT
   ============================================================ */
export function TopTerlambatChart({ data = [], height = 250, minH = 250, onPick }) {
  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
        <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-700"><IconCheck size={16} /></span>
        <p className="text-[12px] font-semibold text-slate-700">Tidak ada engine yang lewat jadwal</p>
        <p className="text-[10.5px] text-slate-500">Semua engine masih dalam masa service.</p>
      </div>
    )
  }
  const barData = [...data].reverse().map((d) => ({ ...d, label: d.kode }))
  return (
    <div className="flex h-full min-h-0 flex-col">
    <ChartBox height={height} minH={minH} className="flex-1">
    <ResponsiveContainer width="100%" height={rcHeight(height) === '100%' ? '100%' : rcHeight(height)}>
      <BarChart data={barData} layout="vertical" margin={{ top: 2, right: 32, left: 2, bottom: 0 }} barCategoryGap="24%">
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(148,163,184,0.08)" horizontal={false} />
        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9.5 }} unit=" hr" />
        <YAxis type="category" dataKey="label" width={66} axisLine={false} tickLine={false} tick={{ fill: '#5b6b7c', fontSize: 9.5, fontFamily: 'monospace' }} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<TipBox formatter={(v) => `${v} hari terlambat`} />} />
        <Bar dataKey="telat" name="Terlambat" radius={[0, 3, 3, 0]} onClick={(d) => onPick?.(d?.payload?.kode || d?.kode)} className="cursor-pointer">
          {barData.map((d, i) => (
            <Cell key={d.kode} fill={d.telat > 30 ? '#9f1239' : d.telat > 14 ? '#f43f5e' : '#fb7185'} opacity={0.55 + (i / barData.length) * 0.45} />
          ))}
          <LabelList dataKey="telat" position="right" style={{ fill: '#3f4d5a', fontSize: 9.5 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </ChartBox>
    {/* batang grafik tipis di HP → sediakan tombol daftar yang pasti bisa ditekan */}
    <div className="mt-1 flex shrink-0 flex-wrap gap-1">
      {data.slice(0, 5).map((d) => (
        <button
          key={d.kode}
          onClick={() => onPick?.(d.kode)}
          className="tap-sm rounded-md border border-slate-900/10 bg-slate-900/[0.03] px-1.5 font-mono text-[9.5px] text-slate-700 transition hover:border-brand/40 hover:text-slate-900"
          title={`Buka detail ${d.kode} — telat ${d.telat} hari`}
        >
          {d.kode} <span className="text-rose-600">{d.telat}h</span>
        </button>
      ))}
    </div>
    </div>
  )
}

/* ============================================================
   5. PETA MINGGU SERVICE — kapan service biasa dilakukan
   Matriks jenis engine × minggu (1–5) dari tb_service2.
   ============================================================ */
export function PetaMingguService({ log = [], height }) {
  const perJenis = useMemo(() => {
    const map = new Map()
    for (const r of log) {
      if (!r.minggu) continue
      const jenis = String(r.kode).slice(0, 3)
      const cur = map.get(jenis) || { jenis, w: [0, 0, 0, 0, 0], total: 0 }
      const idx = Math.min(5, Math.max(1, Number(r.minggu))) - 1
      cur.w[idx] += 1
      cur.total += 1
      map.set(jenis, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [log])

  if (!perJenis.length) return null
  const maks = Math.max(...perJenis.flatMap((j) => j.w))

  return (
    <div style={height ? { maxHeight: height, overflow: 'auto' } : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-left">
          <thead>
            <tr className="text-[9.5px] uppercase tracking-wider text-slate-500">
              <th className="py-1 pr-2 font-semibold">Jenis</th>
              {[1, 2, 3, 4, 5].map((w) => (
                <th key={w} className="px-1 py-1 text-center font-semibold">M{w}</th>
              ))}
              <th className="py-1 pl-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {perJenis.map((j) => (
              <tr key={j.jenis}>
                <td className="py-1 pr-2 font-mono text-[10.5px] font-semibold text-slate-800">{j.jenis}</td>
                {j.w.map((n, i) => {
                  const t = maks ? n / maks : 0
                  return (
                    <td key={i} className="px-1 py-1 text-center">
                      <span
                        className="inline-flex h-6 w-full min-w-[26px] items-center justify-center rounded font-mono text-[9.5px]"
                        style={{
                          background: n ? `rgba(56,189,248,${0.12 + t * 0.62})` : 'rgba(255,255,255,0.03)',
                          color: n ? '#e2e8f0' : '#475569',
                        }}
                        title={`${j.jenis} · minggu ${i + 1}: ${n} service`}
                      >
                        {n || '–'}
                      </span>
                    </td>
                  )
                })}
                <td className="py-1 pl-2 text-right font-mono text-[10px] text-slate-600">{j.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

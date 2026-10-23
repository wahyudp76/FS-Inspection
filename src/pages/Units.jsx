import React, { useMemo, useState } from 'react'
import { kondisiOf, latestByUnit, fmtDateTime, cx, uniq } from '../lib/analytics'
import { Card, CardHeader, Bar, StatusPill, Empty, Segmented, Select } from '../components/ui'
import { IconSearch, IconTruck, IconDroplet, IconDownload } from '../components/icons'
import DetailDrawer from './UnitsDetail'

const PAGE = 20

export default function Units({ data, records, navigate }) {
  const [tipe, setTipe] = useState('Semua')
  const [q, setQ] = useState('')
  const [wilayah, setWilayah] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('skor-asc')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState(null)

  const all = useMemo(
    () => [
      ...data.mesin.map((u) => ({ ...u, tipe: 'Mesin' })),
      ...data.irrigator.map((u) => ({ ...u, tipe: 'Irrigator' })),
    ],
    [data]
  )
  const wilayahList = useMemo(() => uniq(all.map((u) => u.wilayah)).filter(Boolean).sort(), [all])
  const latest = useMemo(() => latestByUnit(records), [records])

  const rows = useMemo(() => {
    let r = all
    if (tipe !== 'Semua') r = r.filter((u) => u.tipe === tipe)
    if (wilayah) r = r.filter((u) => u.wilayah === wilayah)
    if (status) r = r.filter((u) => u.status === status)
    const qq = q.trim().toLowerCase()
    if (qq) r = r.filter((u) => [u.kode, u.spec, u.unit, u.pompa, u.nozzle, u.wilayah].filter(Boolean).join(' ').toLowerCase().includes(qq))
    const cmp = {
      'skor-asc': (a, b) => a.score - b.score,
      'skor-desc': (a, b) => b.score - a.score,
      kode: (a, b) => a.kode.localeCompare(b.kode),
      c: (a, b) => b.c - a.c || b.b - a.b,
    }[sort]
    return [...r].sort(cmp)
  }, [all, tipe, wilayah, status, q, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const view = rows.slice(page * PAGE, page * PAGE + PAGE)

  const exportCsv = () => {
    const head = ['Tipe', 'Kode', 'Wilayah', 'Spec/Unit', 'Status', 'A', 'B', 'C', 'Total', 'Skor', 'Kondisi']
    const body = rows.map((u) => [u.tipe, u.kode, u.wilayah, u.spec || u.unit, u.status, u.a, u.b, u.c, u.total, u.score, kondisiOf(u.score)])
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `master-aset-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={tipe}
          onChange={(v) => { setTipe(v); setPage(0) }}
          options={[
            { value: 'Semua', label: 'Semua' },
            { value: 'Mesin', label: 'Mesin' },
            { value: 'Irrigator', label: 'Irrigator' },
          ]}
        />
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Cari kode / spec…" className="input !py-2 !pl-9 !text-[12px]" />
        </div>
        <Select value={wilayah} onChange={(v) => { setWilayah(v); setPage(0) }} placeholder="Semua wilayah" options={wilayahList} className="min-w-[130px]" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(0) }} placeholder="Semua status" options={['Terpasang', 'Standby', 'Rusak']} className="min-w-[130px]" />
        <Select
          value={sort}
          onChange={(v) => setSort(v)}
          options={[
            { value: 'skor-asc', label: 'Skor terendah' },
            { value: 'skor-desc', label: 'Skor tertinggi' },
            { value: 'c', label: 'Temuan C terbanyak' },
            { value: 'kode', label: 'Kode A-Z' },
          ]}
          className="min-w-[140px]"
        />
        <button onClick={exportCsv} className="btn-ghost !py-2 !text-[12px]">
          <IconDownload size={14} /> CSV
        </button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Master Aset"
          sub={`${rows.length} unit ditampilkan dari ${all.length} unit`}
          right={<span className="chip">tb_mesin + tb_irrigator</span>}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-y border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 font-semibold">Kode Unit</th>
                <th className="px-2 py-2 font-semibold">Tipe</th>
                <th className="px-2 py-2 font-semibold">Wilayah</th>
                <th className="px-2 py-2 font-semibold">Spesifikasi</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 text-center font-semibold">A / B / C</th>
                <th className="px-2 py-2 font-semibold">Skor</th>
                <th className="px-2 py-2 font-semibold">Inspeksi Terakhir</th>
                <th className="px-4 py-2 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {view.map((u) => {
                const rec = latest.get(`${u.tipe}:${u.kode}`)
                return (
                  <tr key={`${u.tipe}-${u.kode}`} className="group border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <button onClick={() => setDetail(u)} className="font-mono text-[12px] font-semibold text-white hover:text-brand">{u.kode}</button>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]', u.tipe === 'Mesin' ? 'border-sky-500/25 bg-sky-500/10 text-sky-300' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300')}>
                        {u.tipe === 'Mesin' ? <IconTruck size={10} /> : <IconDroplet size={10} />} {u.tipe}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-[11.5px] text-slate-300">{u.wilayah || '—'}</td>
                    <td className="max-w-[190px] truncate px-2 py-2.5 text-[11.5px] text-slate-400" title={u.spec || u.unit}>
                      {u.spec || u.unit}{u.power ? ` · ${u.power} HP` : ''}{u.nozzle ? ` · Nozzle ${u.nozzle}` : ''}
                    </td>
                    <td className="px-2 py-2.5"><StatusPill status={u.status} /></td>
                    <td className="px-2 py-2.5 text-center font-mono text-[11px]">
                      <span className="text-emerald-400">{u.a}</span><span className="text-slate-600">/</span>
                      <span className="text-amber-400">{u.b}</span><span className="text-slate-600">/</span>
                      <span className="text-rose-400">{u.c}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <Bar value={u.score} color={u.score >= 90 ? '#22c55e' : u.score >= 70 ? '#f59e0b' : '#f43f5e'} height={5} />
                        <span className="w-9 shrink-0 font-mono text-[11px] text-slate-300">{Math.round(u.score)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[10.5px] text-slate-500">
                      {rec ? <span title={fmtDateTime(rec.timestamp)}>{rec.tanggal} · {rec.inspector || '—'}</span> : <span className="text-amber-500/80">belum ada</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => navigate('inspeksi', { tipe: u.tipe, kode: u.kode })}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10.5px] font-semibold text-slate-300 transition hover:border-brand/40 hover:text-brand"
                      >
                        Inspeksi
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <Empty title="Tidak ada unit" desc="Ubah filter atau kata kunci pencarian." icon={<IconSearch size={20} />} />}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2.5">
            <span className="text-[11px] text-slate-500">
              Halaman {page + 1} dari {pages} · {rows.length} unit
            </span>
            <div className="flex gap-1">
              <button className="btn-ghost !px-2 !py-1 !text-[11px]" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
              <button className="btn-ghost !px-2 !py-1 !text-[11px]" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
            </div>
          </div>
        )}
      </Card>

      {detail && <DetailDrawer unit={detail} data={data} records={records} onClose={() => setDetail(null)} navigate={navigate} />}
    </div>
  )
}

import React, { useMemo, useState } from 'react'
import { cx, fmtDateTime, trendByPeriod, periodKey, pct, kondisiOf } from '../lib/analytics'
import { GRADES } from '../lib/config'
import { Card, CardHeader, Bar, GradePill, KondisiPill, StatusPill, Empty, Segmented, Select } from '../components/ui'
import { TrendChart, GradeStack } from '../components/charts'
import { IconDownload, IconSearch, IconHistory, IconChevronDown, IconClipboard, IconAlert, IconSheet, IconRefresh } from '../components/icons'
import { TARGET_SHEET } from '../lib/config'

export default function History({ records, data, navigate, onSync, syncing }) {
  const [tipe, setTipe] = useState('Semua')
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('minggu')
  const [inspector, setInspector] = useState('')
  const [expanded, setExpanded] = useState(null)

  const groupFor = (t) => (t === 'Mesin' ? data.groups.mesin : data.groups.irrigator)

  const inspectors = useMemo(() => [...new Set(records.map((r) => r.inspector).filter(Boolean))].sort(), [records])

  const filtered = useMemo(() => {
    let r = records
    if (tipe !== 'Semua') r = r.filter((x) => x.tipe === tipe)
    if (inspector) r = r.filter((x) => x.inspector === inspector)
    const qq = q.trim().toLowerCase()
    if (qq) r = r.filter((x) => [x.kode, x.wilayah, x.inspector, x.catatan, x.tanggal].filter(Boolean).join(' ').toLowerCase().includes(qq))
    return r
  }, [records, tipe, inspector, q])

  const trend = useMemo(() => trendByPeriod(filtered, period), [filtered, period])
  const summary = useMemo(() => {
    const total = filtered.length
    const a = filtered.reduce((s, r) => s + (r.a || 0), 0)
    const b = filtered.reduce((s, r) => s + (r.b || 0), 0)
    const c = filtered.reduce((s, r) => s + (r.c || 0), 0)
    const skor = total ? Math.round((filtered.reduce((s, r) => s + (r.skor || 0), 0) / total) * 10) / 10 : 0
    const unit = new Set(filtered.map((r) => `${r.tipe}:${r.kode}`)).size
    return { total, a, b, c, skor, unit, pending: filtered.filter((r) => r.pending).length }
  }, [filtered])

  const exportCsv = () => {
    const head = ['Tanggal', 'Waktu Kirim', 'Tipe', 'Kode Unit', 'Wilayah', 'Petugas', 'A', 'B', 'C', 'Total', 'Skor', 'Kondisi', 'Catatan']
    const body = filtered.map((r) => [r.tanggal, r.timestamp, r.tipe, r.kode, r.wilayah, r.inspector, r.a, r.b, r.c, r.total, r.skor, r.kondisi, r.catatan])
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `riwayat-inspeksi-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={tipe}
          onChange={setTipe}
          options={[
            { value: 'Semua', label: 'Semua' },
            { value: 'Mesin', label: 'Mesin' },
            { value: 'Irrigator', label: 'Irrigator' },
          ]}
        />
        <div className="relative min-w-[170px] flex-1 sm:max-w-[260px]">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari unit / petugas / catatan…" className="input !py-2 !pl-9 !text-[12px]" />
        </div>
        <Select value={inspector} onChange={setInspector} placeholder="Semua petugas" options={inspectors} className="min-w-[140px]" />
        <div className="ml-auto flex gap-2">
          <button onClick={onSync} className="btn-ghost !py-2 !text-[12px]">
            <IconRefresh size={13} className={syncing ? 'animate-spin' : ''} /> Tarik dari Sheet
          </button>
          <button onClick={exportCsv} className="btn-ghost !py-2 !text-[12px]"><IconDownload size={14} /> CSV</button>
        </div>
      </div>

      {summary.pending > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-2.5 text-[11.5px] text-amber-200">
          <IconAlert size={14} />
          <span>{summary.pending} inspeksi masih di antrean lokal (belum terkirim ke Google Sheets).</span>
          <button onClick={() => navigate('pengaturan')} className="ml-auto rounded-lg border border-amber-500/40 px-2 py-1 text-[10.5px] font-semibold hover:bg-amber-500/15">
            Atur koneksi
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Total Sesi', value: summary.total, unit: 'inspeksi' },
          { label: 'Unit Diinspeksi', value: summary.unit, unit: 'unit' },
          { label: 'Rata-rata Skor', value: summary.skor, unit: '/100' },
          { label: 'Temuan B', value: summary.b, unit: 'titik' },
          { label: 'Temuan C', value: summary.c, unit: 'titik' },
        ].map((k) => (
          <div key={k.label} className="card card-pad">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{k.label}</p>
            <p className="mt-1 font-mono text-[22px] font-semibold text-white">{k.value}<span className="ml-1 text-[10px] font-normal text-slate-500">{k.unit}</span></p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="Tren Inspeksi"
            sub="Volume sesi & rata-rata skor"
            right={
              <Segmented value={period} onChange={setPeriod} size="sm" options={[
                { value: 'hari', label: 'Hari' }, { value: 'minggu', label: 'Minggu' }, { value: 'bulan', label: 'Bulan' },
              ]} />
            }
          />
          <div className="px-1 pb-3 pt-1">
            {trend.length ? <TrendChart data={trend} height={240} /> : <Empty title="Belum ada data" desc="Tarik data dari sheet atau kirim inspeksi baru." icon={<IconHistory size={20} />} />}
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHeader title="Komposisi Temuan" sub="A / B / C per periode" />
          <div className="px-1 pb-3 pt-1">
            {trend.length ? <GradeStack data={trend} height={240} /> : <Empty title="Belum ada temuan" icon={<IconAlert size={20} />} />}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Daftar Inspeksi"
          sub={`${filtered.length} sesi · sheet “${TARGET_SHEET.name}”`}
          right={<a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !text-[11px]"><IconSheet size={13} /> Buka sheet</a>}
        />
        {filtered.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-y border-white/[0.06] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 font-semibold">Tanggal</th>
                  <th className="px-2 py-2 font-semibold">Unit</th>
                  <th className="px-2 py-2 font-semibold">Tipe</th>
                  <th className="px-2 py-2 font-semibold">Petugas</th>
                  <th className="px-2 py-2 text-center font-semibold">A/B/C</th>
                  <th className="px-2 py-2 font-semibold">Skor</th>
                  <th className="px-2 py-2 font-semibold">Kondisi</th>
                  <th className="px-4 py-2 text-right font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map((r) => {
                  const key = r.id || `${r.kode}-${r.timestamp}`
                  const isOpen = expanded === key
                  const groups = groupFor(r.tipe)
                  return (
                    <React.Fragment key={key}>
                      <tr className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <p className="font-mono text-[11.5px] text-slate-200">{r.tanggal}</p>
                          <p className="text-[9.5px] text-slate-500">{fmtDateTime(r.timestamp).split('·')[1]}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="font-mono text-[12px] font-semibold text-white">{r.kode}</span>
                          <p className="text-[9.5px] text-slate-500">{r.wilayah}</p>
                          {r.pending && <span className="mt-0.5 inline-block rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-300">antrean lokal</span>}
                        </td>
                        <td className="px-2 py-2.5 text-[11px] text-slate-400">{r.tipe}</td>
                        <td className="px-2 py-2.5 text-[11.5px] text-slate-300">{r.inspector || '—'}</td>
                        <td className="px-2 py-2.5 text-center font-mono text-[11px]">
                          <span className="text-emerald-400">{r.a}</span><span className="text-slate-600">/</span>
                          <span className="text-amber-400">{r.b}</span><span className="text-slate-600">/</span>
                          <span className="text-rose-400">{r.c}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <Bar value={r.skor} color={r.skor >= 90 ? '#22c55e' : r.skor >= 70 ? '#f59e0b' : '#f43f5e'} height={5} />
                            <span className="w-8 shrink-0 font-mono text-[11px] text-slate-300">{Math.round(r.skor)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><KondisiPill kondisi={r.kondisi} /></td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setExpanded(isOpen ? null : key)} className="rounded-lg border border-white/10 bg-white/[0.03] p-1 text-slate-400 transition hover:text-brand">
                            <IconChevronDown size={14} className={cx('transition', isOpen && 'rotate-180')} />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-white/[0.04] bg-ink-900/40">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {groups.map((g) => {
                                const items = g.items.filter((i) => r.komponen?.[i])
                                if (!items.length) return null
                                return (
                                  <div key={g.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                    <p className="mb-1 text-[10.5px] font-semibold text-slate-300">{g.label}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {items.map((it) => (
                                        <span key={it} className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-300">
                                          {it} <GradePill value={r.komponen[it]} size="xs" />
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {r.catatan && (
                              <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11.5px] text-slate-300">
                                <span className="text-slate-500">Catatan: </span>{r.catatan}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            {filtered.length > 200 && (
              <p className="px-4 py-2 text-center text-[10.5px] text-slate-500">Menampilkan 200 sesi terbaru dari {filtered.length}. Gunakan filter atau ekspor CSV.</p>
            )}
          </div>
        ) : (
          <Empty
            title="Belum ada riwayat inspeksi"
            desc="Kirim inspeksi pertama dari menu Inspeksi, atau tarik data dari sheet Data Inspeksi."
            icon={<IconClipboard size={20} />}
            action={
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button className="btn-primary" onClick={() => navigate('inspeksi')}>Mulai Inspeksi</button>
                <button className="btn-ghost" onClick={onSync}>Tarik dari Sheet</button>
                <button className="btn-ghost" onClick={() => navigate('pengaturan')}>Isi inspeksi awal dari master</button>
              </div>
            }
          />
        )}
      </Card>
    </div>
  )
}

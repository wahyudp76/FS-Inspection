import React, { useMemo, useState } from 'react'
import {
  fleetSummary, componentIssues, byWilayah, scoreBucketsSplit, groupProfile, unitTypeBreakdown,
  trendByPeriod, topInspectors, latestByUnit, pct, fmtDateTime, relativeTime, kondisiOf, cx, periodKey, scoreColor,
  rekapRecord,
} from '../lib/analytics'
import { daysAgoWIB } from '../lib/time'
import { Card, CardHeader, Kpi, Bar, KondisiPill, StatusPill, Empty, Segmented, ScoreRing, GradePill } from '../components/ui'
import { Donut, WilayahChart, IssuesBar, GroupRadar, TrendChart, ScoreHistogramSplit, TipBox } from '../components/charts'
import BucketModal from '../components/BucketModal'
import DetailDrawer from './UnitsDetail'
import {
  IconTruck, IconDroplet, IconShield, IconAlert, IconClipboard, IconTrend, IconChevron, IconSpark,
  IconCalendar, IconUser, IconGauge, IconList, IconCheck,
} from '../components/icons'

const STATUS_COLORS = { Terpasang: '#0d9488', Standby: '#7c3aed', Rusak: '#f43f5e' }

export default function Dashboard({ data, records, navigate }) {
  const [tipe, setTipe] = useState('Semua')
  const [period, setPeriod] = useState('bulan')
  const [issueTab, setIssueTab] = useState('Mesin')
  /* pop-up distribusi skor: { range, tipe } */
  const [bucketSel, setBucketSel] = useState(null)
  /* detail unit yang dibuka dari dalam pop-up (tanpa pindah tab) */
  const [detailUnit, setDetailUnit] = useState(null)

  const mesin = data.mesin || []
  const irrigator = data.irrigator || []

  const scoped = useMemo(() => (tipe === 'Mesin' ? mesin : tipe === 'Irrigator' ? irrigator : [...mesin, ...irrigator]), [tipe, mesin, irrigator])
  const sum = useMemo(() => fleetSummary(scoped), [scoped])
  const sumMesin = useMemo(() => fleetSummary(mesin), [mesin])
  const sumIrr = useMemo(() => fleetSummary(irrigator), [irrigator])

  const statusData = useMemo(
    () => [
      { name: 'Terpasang', value: sum.terpasang, color: STATUS_COLORS.Terpasang },
      { name: 'Standby', value: sum.standby, color: STATUS_COLORS.Standby },
      { name: 'Rusak', value: sum.rusak, color: STATUS_COLORS.Rusak },
    ],
    [sum]
  )

  const filteredRecords = useMemo(
    () => records.filter((r) => (tipe === 'Semua' ? true : r.tipe === tipe)),
    [records, tipe]
  )

  const trend = useMemo(() => trendByPeriod(filteredRecords, period), [filteredRecords, period])
  const wilayah = useMemo(() => byWilayah(scoped), [scoped])
  const bucketsSplit = useMemo(() => scoreBucketsSplit(mesin, irrigator), [mesin, irrigator])
  const issues = useMemo(
    () => componentIssues(issueTab === 'Mesin' ? mesin : irrigator, 10),
    [issueTab, mesin, irrigator]
  )
  const radar = useMemo(
    () => groupProfile(tipe === 'Irrigator' ? irrigator : mesin, tipe === 'Irrigator' ? data.groups.irrigator : data.groups.mesin),
    [tipe, mesin, irrigator, data.groups]
  )
  const komposisi = useMemo(() => unitTypeBreakdown(tipe === 'Irrigator' ? irrigator : mesin), [tipe, mesin, irrigator])

  /* periode sekarang vs sebelumnya */
  const periodStats = useMemo(() => {
    const nowKey = periodKey({ timestamp: new Date().toISOString() }, period)
    const current = filteredRecords.filter((r) => periodKey(r, period) === nowKey)
    const keys = [...new Set(filteredRecords.map((r) => periodKey(r, period)))].filter(Boolean).sort()
    const prevKey = keys[keys.indexOf(nowKey) - 1]
    const prev = prevKey ? filteredRecords.filter((r) => periodKey(r, period) === prevKey) : []
    /* temuan C dihitung dari nilai komponen (rekapRecord), bukan kolom sheet */
    const cNow = current.reduce((s, r) => s + rekapRecord(r).c, 0)
    const cPrev = prev.reduce((s, r) => s + rekapRecord(r).c, 0)
    return {
      count: current.length,
      unit: new Set(current.map((r) => `${r.tipe}:${r.kode}`)).size,
      cNow,
      cPrev,
      trend: prev.length ? Math.round(((current.length - prev.length) / prev.length) * 100) : null,
    }
  }, [filteredRecords, period])

  const inspectors = useMemo(() => topInspectors(filteredRecords, 4), [filteredRecords])
  const latest = useMemo(() => latestByUnit(filteredRecords), [filteredRecords])

  /* 0 = Kritis, 1 = Perlu Perhatian, 2 = Baik — dipakai untuk mengurutkan prioritas */
  const peringkatKondisi = (u) => {
    const k = kondisiOf(u.score, u.status)
    return k === 'Kritis' ? 0 : k === 'Perlu Perhatian' ? 1 : 2
  }

  /* unit prioritas: skor terendah + (jika ada riwayat) paling lama tidak diinspeksi */
  const prioritas = useMemo(() => {
    return [...scoped]
      .map((u) => {
        const rec = latest.get(`${tipe === 'Irrigator' ? 'Irrigator' : 'Mesin'}:${u.kode}`)
        return { ...u, last: rec || null, daysSince: rec ? daysAgoWIB(rec.timestamp) : null }
      })
      /* unit Rusak selalu tampil paling atas (Kritis), baru urut skor terendah */
      .sort(
        (a, b) =>
          peringkatKondisi(a) - peringkatKondisi(b) ||
          a.score - b.score ||
          (a.c + a.b) - (b.c + b.b)
      )
      .slice(0, 8)
  }, [scoped, latest, tipe])

  const recent = filteredRecords.slice(0, 6)
  const topIssues = issues.slice(0, 3).map((i) => i.name)

  return (
    <div className="space-y-4">
      {/* ---------------- filter bar ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={tipe}
          onChange={setTipe}
          options={[
            { value: 'Semua', label: `Semua (${mesin.length + irrigator.length})` },
            { value: 'Mesin', label: `Mesin (${mesin.length})` },
            { value: 'Irrigator', label: `Irrigator (${irrigator.length})` },
          ]}
        />
        <div className="w-full sm:w-auto">
          <Segmented
            value={period}
            onChange={setPeriod}
            size="sm"
            options={[
              { value: 'hari', label: 'Harian' },
              { value: 'minggu', label: 'Mingguan' },
              { value: 'bulan', label: 'Bulanan' },
            ]}
          />
        </div>
        <span
          className="ml-auto hidden items-center gap-1.5 text-[11px] text-slate-500 sm:flex"
          title={
            data.masterLive
              ? `Status & komponen diambil langsung dari sheet Mesin/Irrigator (${data.masterDiterapkan || 0} unit) — tarik ulang dengan tombol Sinkron di header`
              : 'Memakai snapshot build (assets.json). Tekan Sinkron di header untuk mengambil master terkini dari sheet.'
          }
        >
          <IconCalendar size={13} /> Master:{' '}
          {new Date(data.masterLive && data.masterSyncedAt ? data.masterSyncedAt : data.generatedAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
          <span
            className={
              data.masterLive
                ? 'rounded-md border border-teal-600/35 bg-teal-600/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-teal-700'
                : 'rounded-md border border-slate-900/15 bg-slate-900/[0.04] px-1.5 py-0.5 text-[9.5px] font-semibold text-slate-600'
            }
          >
            {data.masterLive ? 'live' : 'snapshot'}
          </span>
          {!!data.diterapkan && (
            <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700">
              +{data.diterapkan} dari inspeksi
            </span>
          )}
        </span>
      </div>

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Total Aset"
          value={sum.total}
          unit="unit"
          accent="#0d9488"
          icon={<IconTruck size={15} />}
          hint={`${mesin.length} mesin · ${irrigator.length} irrigator`}
          onClick={() => navigate('unit')}
        />
        <Kpi
          label="Siap Operasi"
          value={pct(sum.terpasang, sum.total)}
          unit="%"
          accent="#22c55e"
          icon={<IconShield size={15} />}
          hint={`${sum.terpasang} terpasang · ${sum.standby} standby`}
        />
        <Kpi
          label="Skor Kesehatan"
          value={sum.avgScore}
          unit="/100"
          accent="#7c3aed"
          icon={<IconGauge size={15} />}
          hint={`${kondisiOf(sum.avgScore)} · ${sum.comps.toLocaleString('id-ID')} titik komponen`}
        />
        <Kpi
          label="Komponen A"
          value={pct(sum.a, sum.a + sum.b + sum.c)}
          unit="%"
          accent="#0d9488"
          icon={<IconSpark size={15} />}
          hint={`${sum.a.toLocaleString('id-ID')} baik · ${sum.b.toLocaleString('id-ID')} perhatian`}
        />
        <Kpi
          label="Temuan Rusak (C)"
          value={sum.c.toLocaleString('id-ID')}
          unit="titik"
          accent="#f43f5e"
          icon={<IconAlert size={15} />}
          hint={`Tersebar di ${new Set(scoped.filter((u) => u.c > 0).map((u) => u.kode)).size} unit`}
        />
        <Kpi
          label={`Inspeksi ${period === 'bulan' ? 'Bulan Ini' : period === 'minggu' ? 'Minggu Ini' : 'Hari Ini'}`}
          value={periodStats.count}
          unit="sesi"
          accent="#f59e0b"
          icon={<IconClipboard size={15} />}
          hint={`${periodStats.unit} unit · ${periodStats.cNow} temuan C`}
          trend={periodStats.trend ?? undefined}
          onClick={() => navigate('riwayat')}
        />
      </div>

      {/* ---------------- insight banner ---------------- */}
      <div className="card card-pad flex flex-col gap-2 border-l-2 border-l-brand/70 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex items-center gap-2 text-[12px] font-semibold text-brand">
          <IconSpark size={14} /> Insight
        </span>
        <p className="min-w-[220px] flex-1 text-[12px] leading-relaxed text-slate-600">
          Komponen paling banyak bermasalah pada armada {issueTab.toLowerCase()}:{' '}
          {topIssues.length ? (
            <span className="font-semibold text-slate-800">{topIssues.join(' · ')}</span>
          ) : (
            <span className="text-slate-500">belum ada data</span>
          )}
          . {sum.rusak > 0 ? `${sum.rusak} unit berstatus rusak memerlukan tindak lanjut perbaikan.` : 'Semua unit dalam kondisi terpasang/standby.'}
        </p>
        <button onClick={() => navigate('inspeksi')} className="btn-primary ml-auto !py-1.5 !text-[12px]">
          <IconClipboard size={13} /> Mulai Inspeksi
        </button>
      </div>

      {/* ---------------- charts row 1 ---------------- */}
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-8">
          <CardHeader
            title="Tren Inspeksi"
            sub={`Jumlah sesi inspeksi & rata-rata skor per ${period}`}
            right={<span className="chip">{filteredRecords.length} sesi terdata</span>}
          />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-3 pt-2">
            {trend.length ? (
              <TrendChart data={trend} height="fill" />
            ) : (
              <Empty
                title="Belum ada riwayat inspeksi"
                desc="Grafik tren akan terisi otomatis setelah tim mengirim hasil inspeksi pertama ke sheet Data Inspeksi."
                icon={<IconTrend size={20} />}
                action={<button className="btn-primary mt-1" onClick={() => navigate('inspeksi')}>Mulai Inspeksi Sekarang</button>}
              />
            )}
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-4">
          <CardHeader title="Status Unit" sub="Distribusi status operasional aset" />
          <div className="card-pad flex min-h-0 flex-1 flex-col pt-2">
            <Donut
              data={statusData}
              height="fill"
              centerLabel="total unit"
              centerValue={sum.total}
              onSlice={(name) => navigate('unit')}
            />
            <div className="mt-auto space-y-2 pt-3">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="w-16 text-[11px] text-slate-600">{s.name}</span>
                  <Bar value={pct(s.value, sum.total)} color={s.color} height={5} />
                  <span className="w-10 text-right font-mono text-[11px] text-slate-600">{pct(s.value, sum.total)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------- charts row 2 ---------------- */}
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-7">
          <CardHeader
            title="Komponen Paling Bermasalah"
            sub="Akumulasi temuan B (perlu perhatian) & C (rusak) pada master aset"
            right={
              <Segmented
                value={issueTab}
                onChange={setIssueTab}
                size="sm"
                options={[
                  { value: 'Mesin', label: 'Mesin' },
                  { value: 'Irrigator', label: 'Irrigator' },
                ]}
              />
            }
          />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-3">
            {issues.length ? (
              <IssuesBar data={issues} height="fill" />
            ) : (
              <Empty
                title={`Tidak ada temuan pada ${issueTab === 'Mesin' ? 'mesin' : 'irrigator'}`}
                desc="Semua komponen bernilai A (baik) pada master aset saat ini."
                icon={<IconCheck size={20} />}
              />
            )}
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-5">
          <CardHeader title="Profil Kondisi per Sistem" sub={tipe === 'Irrigator' ? 'Kelompok komponen irrigator' : 'Kelompok komponen mesin'} />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-1">
            <GroupRadar data={radar} height="fill" />
          </div>
          <div className="border-t border-slate-900/[0.09] px-4 py-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {radar.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.nilai >= 90 ? '#22c55e' : r.nilai >= 70 ? '#f59e0b' : '#f43f5e' }} />
                  <span className="truncate text-[10.5px] text-slate-600" title={r.grup}>{r.grup}</span>
                  <span className="ml-auto font-mono text-[10.5px] font-semibold text-slate-700">{r.nilai}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------- charts row 3 ---------------- */}
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="flex flex-col xl:col-span-5">
          <CardHeader title="Kondisi per Wilayah" sub="Sebaran status unit tiap wilayah kerja" />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-3">
            <WilayahChart data={wilayah} height="fill" />
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-3">
          <CardHeader
            title="Distribusi Skor"
            sub="Mesin vs Irrigator · klik batang untuk analisa"
          />
          <div className="flex min-h-0 flex-1 flex-col px-1 pb-1">
            <ScoreHistogramSplit
              data={bucketsSplit}
              height="fill"
              onBar={({ range, tipe: t }) => setBucketSel({ range, tipe: t })}
            />
          </div>
          {/* HP: batang chart terlalu kecil untuk jari → sediakan tombol per rentang */}
          <div className="space-y-1 px-3 pb-2 sm:hidden">
            {bucketsSplit.map((b) => (
              <div key={`m-${b.label}`} className="flex items-center gap-1.5">
                <span className="w-12 shrink-0 font-mono text-[10.5px] text-slate-600">{b.label}</span>
                <button
                  onClick={() => setBucketSel({ range: b, tipe: 'Mesin' })}
                  disabled={!b.mesin}
                  className="flex min-h-9 flex-1 items-center justify-between rounded-lg border border-teal-600/25 bg-teal-600/[0.08] px-2 text-[10.5px] font-semibold text-teal-700 disabled:opacity-40"
                  aria-label={`Analisa ${b.label} Mesin, ${b.mesin} unit`}
                >
                  <span>Mesin</span>
                  <span className="font-mono">{b.mesin}</span>
                </button>
                <button
                  onClick={() => setBucketSel({ range: b, tipe: 'Irrigator' })}
                  disabled={!b.irrigator}
                  className="flex min-h-9 flex-1 items-center justify-between rounded-lg border border-cyan-500/25 bg-cyan-500/[0.08] px-2 text-[10.5px] font-semibold text-cyan-700 disabled:opacity-40"
                  aria-label={`Analisa ${b.label} Irrigator, ${b.irrigator} unit`}
                >
                  <span>Irrigator</span>
                  <span className="font-mono">{b.irrigator}</span>
                </button>
              </div>
            ))}
          </div>
          <p className="hidden px-4 pb-2 text-[9.5px] leading-relaxed text-slate-500 sm:block">
            Klik batang <span className="font-semibold text-teal-700">Mesin</span> atau{' '}
            <span className="font-semibold text-cyan-700">Irrigator</span> untuk melihat daftar unit + analisa rentang skor.
          </p>
          <div className="mt-auto space-y-1.5 border-t border-slate-900/[0.09] px-4 py-3">
            {komposisi.slice(0, 4).map((k) => (
              <div key={k.name} className="flex items-center gap-2">
                <span className="w-10 font-mono text-[10.5px] text-slate-600">{k.name}</span>
                <Bar value={pct(k.value, komposisi.reduce((s, x) => s + x.value, 0))} color="#7dd3fc" height={4} />
                <span className="w-7 text-right font-mono text-[10.5px] text-slate-500">{k.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Aktivitas Inspeksi" sub="Petugas & sesi terbaru" right={<span className="chip">{inspectors.length} petugas</span>} />
          <div className="card-pad space-y-2.5 pt-3">
            {inspectors.length ? (
              inspectors.map((i, idx) => (
                <div key={i.name} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900/[0.04] text-[10px] font-bold text-slate-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-slate-800">{i.name}</p>
                    <div className="mt-1"><Bar value={pct(i.jumlah, inspectors[0].jumlah)} color="#0d9488" height={4} /></div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11.5px] font-semibold text-slate-800">{i.jumlah}</p>
                    <p className="text-[9.5px] text-slate-500">skor {i.avg}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center">
                <IconUser size={22} className="mx-auto text-slate-300" />
                <p className="mt-2 text-[11.5px] text-slate-500">Belum ada petugas yang mengirim inspeksi</p>
              </div>
            )}
            <div className="divider my-1" />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Unit pernah diinspeksi</span>
              <span className="font-mono font-semibold text-slate-700">{latest.size}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Belum pernah diinspeksi</span>
              <span className="font-mono font-semibold text-amber-600">{Math.max(0, sum.total - latest.size)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------- priority + recent ---------------- */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="Unit Prioritas Perbaikan"
            sub="Unit Rusak/Kritis lebih dulu, lalu skor terendah"
            right={
              <button onClick={() => navigate('unit')} className="btn-ghost !py-1 !text-[11px]">
                Semua unit <IconChevron size={12} />
              </button>
            }
          />
          {/* mobile: daftar ringkas — semua data terlihat tanpa geser horizontal */}
          <div className="mt-3 space-y-1.5 sm:hidden">
            {prioritas.map((u) => {
              const type = tipe === 'Semua' ? (mesin.some((m) => m.kode === u.kode) ? 'Mesin' : 'Irrigator') : tipe
              return (
                <div
                  key={u.kode}
                  className="rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.02] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12.5px] font-bold text-slate-900">{u.kode}</span>
                    <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px]', type === 'Mesin' ? 'border-teal-600/25 bg-teal-600/10 text-teal-700' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700')}>
                      {type === 'Mesin' ? <IconTruck size={10} /> : <IconDroplet size={10} />} {type}
                    </span>
                    <span className="ml-auto"><StatusPill status={u.status} /></span>
                    {kondisiOf(u.score, u.status) === 'Kritis' && (
                      <span className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-rose-600">Kritis</span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[10.5px] text-slate-500">
                      {u.spec || u.unit} · {u.wilayah}
                    </p>
                    <button
                      onClick={() => navigate('inspeksi', { tipe: type, kode: u.kode })}
                      className="tap shrink-0 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] px-2.5 text-[10.5px] font-semibold text-slate-700 transition hover:border-brand/40 hover:text-brand"
                    >
                      Inspeksi
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[10px]">
                      <span className="text-emerald-600">{u.a}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-amber-600">{u.b}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-rose-600">{u.c}</span>
                    </span>
                    <Bar value={u.score} color={scoreColor(u.score, u.status)} height={5} />
                    <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-slate-700">{Math.round(u.score)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* tablet/desktop: tabel lengkap (bisa digeser bila sempit) */}
          <div className="mt-3 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-y border-slate-900/[0.09] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 font-semibold">Kode</th>
                  <th className="px-2 py-2 font-semibold">Tipe</th>
                  <th className="px-2 py-2 font-semibold">Wilayah</th>
                  <th className="px-2 py-2 text-center font-semibold">A/B/C</th>
                  <th className="px-2 py-2 font-semibold">Skor</th>
                  <th className="px-4 py-2 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {prioritas.map((u) => {
                  const type = tipe === 'Semua' ? (mesin.some((m) => m.kode === u.kode) ? 'Mesin' : 'Irrigator') : tipe
                  return (
                    <tr key={u.kode} className="border-b border-slate-900/[0.08] transition hover:bg-slate-900/[0.03]">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[12px] font-semibold text-slate-900">{u.kode}</span>
                        <span className="ml-2 text-[10px] text-slate-500">{u.spec || u.unit}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]', type === 'Mesin' ? 'border-teal-600/25 bg-teal-600/10 text-teal-700' : 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700')}>
                          {type === 'Mesin' ? <IconTruck size={10} /> : <IconDroplet size={10} />} {type}
                        </span>
                      </td>
                      <td className="px-2 py-2.5"><StatusPill status={u.status} /></td>
                      <td className="px-2 py-2.5 text-center font-mono text-[11px]">
                        <span className="text-emerald-600">{u.a}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-amber-600">{u.b}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-rose-600">{u.c}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <Bar value={u.score} color={scoreColor(u.score, u.status)} height={5} />
                          <span className="w-9 shrink-0 font-mono text-[11px] text-slate-700">{Math.round(u.score)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => navigate('inspeksi', { tipe: type, kode: u.kode })}
                          className="tap rounded-lg border border-slate-900/10 bg-slate-900/[0.03] px-2.5 text-[10.5px] font-semibold text-slate-700 transition hover:border-brand/40 hover:text-brand"
                        >
                          Inspeksi
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            title="Inspeksi Terbaru"
            sub="Hasil terakhir yang masuk ke sheet Data Inspeksi"
            right={
              <button onClick={() => navigate('riwayat')} className="btn-ghost !py-1 !text-[11px]">
                Riwayat <IconChevron size={12} />
              </button>
            }
          />
          <div className="card-pad space-y-2 pt-3">
            {recent.length ? (
              recent.map((r) => (
                <button
                  key={r.id || `${r.kode}-${r.timestamp}`}
                  onClick={() => navigate('riwayat')}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.02] px-3 py-2.5 text-left transition hover:border-slate-900/15 hover:bg-slate-900/[0.04]"
                >
                  <ScoreRing score={r.skor || 0} size={40} stroke={4} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] font-semibold text-slate-900">{r.kode}</span>
                      <span className="text-[9.5px] uppercase tracking-wide text-slate-500">{r.tipe}</span>
                    </div>
                    <p className="truncate text-[10.5px] text-slate-500">
                      {r.inspector || 'Tanpa nama'} · {relativeTime(r.timestamp)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <GradePill value="A" size="xs" />
                    <span className="font-mono text-[10px] text-emerald-600">{rekapRecord(r).a}</span>
                    <span className="font-mono text-[10px] text-rose-600">{rekapRecord(r).c}</span>
                  </div>
                </button>
              ))
            ) : (
              <Empty
                title="Belum ada inspeksi tercatat"
                desc="Kirim hasil inspeksi pertama, datanya akan langsung muncul di sini dan tersimpan di Google Sheets."
                icon={<IconList size={20} />}
                action={<button className="btn-primary mt-1" onClick={() => navigate('inspeksi')}>Buat Inspeksi</button>}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="pb-2 text-center text-[10px] text-slate-400">
        Skor kondisi = (A×100 + B×60 + C×0) ÷ total komponen · Master: tb_mesin ({mesin.length}) &amp; tb_irrigator ({irrigator.length})
      </div>

      <BucketModal
        open={!!bucketSel}
        range={bucketSel?.range}
        tipe={bucketSel?.tipe || 'Mesin'}
        mesin={mesin}
        irrigator={irrigator}
        onClose={() => setBucketSel(null)}
        onInspect={(u) => {
          setBucketSel(null)
          navigate('inspeksi', { tipe: bucketSel?.tipe || 'Mesin', kode: u.kode })
        }}
        onOpenUnit={(u) => setDetailUnit(u)}
        escDisabled={!!detailUnit}
      />

      {/* detail unit tampil di atas pop-up; menutupnya kembali ke daftar */}
      {detailUnit && (
        <DetailDrawer
          unit={detailUnit}
          data={data}
          records={records}
          onClose={() => setDetailUnit(null)}
          navigate={(r, p) => {
            setDetailUnit(null)
            setBucketSel(null)
            navigate(r, p)
          }}
        />
      )}
    </div>
  )
}

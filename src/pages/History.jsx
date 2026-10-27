import React, { useEffect, useMemo, useState } from 'react'
import { cx, fmtDateTime, trendByPeriod, periodKey, pct, kondisiOf, scoreColor, rekapRecord } from '../lib/analytics'
import { GRADES } from '../lib/config'
import { Card, CardHeader, Bar, GradePill, KondisiPill, StatusPill, Empty, Segmented, Select } from '../components/ui'
import { TrendChart, GradeStack } from '../components/charts'
import { IconDownload, IconSearch, IconHistory, IconChevronDown, IconClipboard, IconAlert, IconSheet } from '../components/icons'
import { TARGET_SHEET, getAutoSyncMaster } from '../lib/config'
import { updateInspection, deleteInspection, syncMaster } from '../lib/api'
import EditInspectionModal, { ConfirmDelete } from '../components/EditInspectionModal'
import { IconEdit, IconTrash } from '../components/icons'

export default function History({ records, data, navigate, onSync, onUpdated, onDeleted, notify, offline }) {
  const [tipe, setTipe] = useState('Semua')
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('minggu')
  const [inspector, setInspector] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(0)
  /* ubah / hapus satu sesi inspeksi */
  const [editRec, setEditRec] = useState(null)
  const [hapusRec, setHapusRec] = useState(null)
  const [busy, setBusy] = useState(false)

  const bolehUbah = (r) => !!r && !!r.id && !r.pending && !String(r.id).startsWith('LOCAL-') && !String(r.id).startsWith('DEMO-')

  const mulaiUbah = (r) => {
    if (!bolehUbah(r)) {
      notify?.({ type: 'info', message: 'Sesi ini belum tersimpan di Google Sheets (masih antrean lokal), jadi belum bisa diubah.' })
      return
    }
    if (offline) {
      notify?.({ type: 'info', message: 'Ubah/hapus butuh koneksi ke Apps Script. Atur endpoint di menu Pengaturan.' })
      return
    }
    setEditRec(r)
  }

  const mulaiHapus = (r) => {
    if (!bolehUbah(r)) {
      notify?.({ type: 'info', message: 'Sesi ini belum tersimpan di Google Sheets (masih antrean lokal), jadi belum bisa dihapus.' })
      return
    }
    if (offline) {
      notify?.({ type: 'info', message: 'Ubah/hapus butuh koneksi ke Apps Script. Atur endpoint di menu Pengaturan.' })
      return
    }
    setHapusRec(r)
  }

  /* setelah ubah/hapus: tulis ulang ringkasan ke sheet Mesin & Irrigator lalu tarik ulang riwayat */
  const sinkronSetelahPerubahan = async () => {
    let masterOk = false
    try {
      if (getAutoSyncMaster()) {
        await syncMaster()
        masterOk = true
      }
    } catch {
      /* master opsional — kegagalan tidak membatalkan perubahan di Data Inspeksi */
    }
    try { await onSync?.() } catch { /* abaikan */ }
    return masterOk
  }

  const simpanUbah = async (payload) => {
    setBusy(true)
    try {
      const rec = await updateInspection(payload)
      onUpdated?.(rec)
      setEditRec(null)
      notify?.({ type: 'success', message: `Inspeksi ${rec.kode} diperbarui di sheet Data Inspeksi — menyinkronkan…` })
      const masterOk = await sinkronSetelahPerubahan()
      notify?.({
        type: 'success',
        message: `Inspeksi ${rec.kode} tersimpan${masterOk ? ' dan sudah disinkronkan ke sheet Mesin & Irrigator' : ''}.`,
      })
    } catch (e) {
      notify?.({ type: 'error', message: `Gagal menyimpan perubahan: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  const konfirmasiHapus = async (rec) => {
    setBusy(true)
    try {
      await deleteInspection(rec.id)
      onDeleted?.(rec.id)
      setHapusRec(null)
      notify?.({ type: 'success', message: `Sesi ${rec.kode} (${rec.tanggal}) dihapus — menyinkronkan…` })
      const masterOk = await sinkronSetelahPerubahan()
      notify?.({
        type: 'success',
        message: `Sesi ${rec.kode} (${rec.tanggal}) dihapus${masterOk ? ' dan sheet Mesin & Irrigator sudah diperbarui' : ''}.`,
      })
    } catch (e) {
      notify?.({ type: 'error', message: `Gagal menghapus: ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

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

  /* ---------- paging ---------- */
  const totalHalaman = Math.max(1, Math.ceil(filtered.length / perPage))
  const halamanAman = Math.min(page, totalHalaman - 1)
  const mulai = halamanAman * perPage
  const sampai = Math.min(mulai + perPage, filtered.length)
  const barisHalaman = useMemo(() => filtered.slice(mulai, sampai), [filtered, mulai, sampai])

  useEffect(() => { setPage(0); setExpanded(null) }, [tipe, inspector, q, perPage])

  const trend = useMemo(() => trendByPeriod(filtered, period), [filtered, period])
  /* Semua angka diambil dari nilai KOMPONEN (rekapRecord), bukan kolom ringkasan
     sheet yang bisa basi — lihat catatan di src/lib/analytics.js. */
  const summary = useMemo(() => {
    const total = filtered.length
    let a = 0, b = 0, c = 0, skorSum = 0, perlu = 0
    for (const r of filtered) {
      const rk = rekapRecord(r)
      a += rk.a
      b += rk.b
      c += rk.c
      skorSum += rk.skor
      if (rk.selisihSheet) perlu++
    }
    const skor = total ? Math.round((skorSum / total) * 10) / 10 : 0
    const unit = new Set(filtered.map((r) => `${r.tipe}:${r.kode}`)).size
    return { total, a, b, c, skor, unit, perlu, pending: filtered.filter((r) => r.pending).length }
  }, [filtered])

  const exportCsv = () => {
    const head = ['Tanggal', 'Waktu Kirim', 'Tipe', 'Kode Unit', 'Wilayah', 'Petugas', 'A', 'B', 'C', 'Total', 'Skor', 'Kondisi', 'Catatan']
    const body = filtered.map((r) => {
      const rk = rekapRecord(r)
      return [r.tanggal, r.timestamp, r.tipe, r.kode, r.wilayah, r.inspector, rk.a, rk.b, rk.c, rk.total, rk.skor, rk.kondisi, r.catatan]
    })
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
          <button onClick={exportCsv} className="btn-ghost !py-2 !text-[12px]"><IconDownload size={14} /> CSV</button>
        </div>
      </div>

      {summary.pending > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3.5 py-2.5 text-[11.5px] text-amber-200">
          <IconAlert size={14} />
          <span>
            {summary.pending} inspeksi masih di antrean lokal — tekan <span className="font-semibold">Sinkron</span> di header
            untuk mengirimnya ke Google Sheets.
          </span>
        </div>
      )}

      {summary.perlu > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-[11.5px] text-amber-200/90">
          <IconAlert size={14} />
          <span>
            {summary.perlu} sesi di sheet punya <span className="font-semibold">kolom ringkasan A/B/C/Skor/Kondisi yang tidak cocok</span>
            {' '}dengan nilai komponennya. Angka di halaman ini sudah dihitung ulang dari komponen; rapikan sheet lewat
            {' '}<span className="font-semibold">Pengaturan ▸ Kualitas Data Sheet ▸ Perbaiki otomatis</span>.
          </span>
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

      <div className="flex flex-col gap-4">
      <div className="order-1 grid gap-4 xl:grid-cols-12">
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

      <Card className="order-2 overflow-hidden">
        <CardHeader
          title="Daftar Inspeksi"
          sub={`${filtered.length} sesi · sheet “${TARGET_SHEET.name}”`}
          right={<a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !text-[11px]"><IconSheet size={13} /> Buka sheet</a>}
        />
        {filtered.length ? (
          <>
          {/* ---------- MOBILE: kartu, semua kolom terbaca tanpa geser ---------- */}
          <div className="mt-3 space-y-2 sm:hidden">
            {barisHalaman.map((r) => {
              const key = r.id || `${r.kode}-${r.timestamp}`
              const isOpen = expanded === key
              const groups = groupFor(r.tipe)
              const rk = rekapRecord(r)
              const warna = scoreColor(rk.skor, r.statusUnit)
              return (
                <div key={`m-${key}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] font-bold text-white">{r.kode}</span>
                        <span className="chip !py-0.5 !text-[9.5px]">{r.tipe}</span>
                        <KondisiPill kondisi={rk.kondisi} />
                      </div>
                      <p className="mt-0.5 truncate text-[10.5px] text-slate-500">
                        {r.wilayah || '—'} · {r.inspector || 'Tanpa nama'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => mulaiUbah(r)}
                        className="tap rounded-lg border border-white/10 bg-white/[0.03] px-2 text-slate-400 transition hover:border-brand/40 hover:text-brand"
                        aria-label={`Ubah inspeksi ${r.kode}`}
                        title="Ubah"
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        onClick={() => mulaiHapus(r)}
                        className="tap rounded-lg border border-white/10 bg-white/[0.03] px-2 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                        aria-label={`Hapus inspeksi ${r.kode}`}
                        title="Hapus"
                      >
                        <IconTrash size={13} />
                      </button>
                      <button
                        onClick={() => setExpanded(isOpen ? null : key)}
                        className="tap rounded-lg border border-white/10 bg-white/[0.03] p-1 text-slate-400"
                        aria-label={isOpen ? 'Tutup rincian' : 'Buka rincian'}
                      >
                        <IconChevronDown size={14} className={cx('transition', isOpen && 'rotate-180')} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{r.tanggal}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{fmtDateTime(r.timestamp).split('·')[1]}</span>
                    <Bar value={rk.skor} color={warna} height={5} />
                    <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-300">{Math.round(rk.skor)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10.5px]">
                    <span className="font-mono">
                      <span className="text-emerald-400">{rk.a}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-amber-400">{rk.b}</span>
                      <span className="text-slate-600">/</span>
                      <span className="text-rose-400">{rk.c}</span>
                    </span>
                    {r.pending && <span className="rounded bg-amber-500/15 px-1 text-[9px] font-semibold text-amber-300">antrean lokal</span>}
                  </div>
                  {isOpen && (
                    <div className="mt-2 border-t border-white/[0.06] pt-2">
                      <div className="grid gap-2">
                        {groups.map((g) => {
                          const items = g.items.filter((i) => r.komponen?.[i])
                          if (!items.length) return null
                          return (
                            <div key={g.id}>
                              <p className="mb-1 text-[10px] font-semibold text-slate-400">{g.label}</p>
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
                        <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] text-slate-300">
                          <span className="text-slate-500">Catatan: </span>{r.catatan}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 hidden overflow-x-auto sm:block">
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
                  <th className="px-4 py-2 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {barisHalaman.map((r) => {
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
                          <span className="text-emerald-400">{rekapRecord(r).a}</span><span className="text-slate-600">/</span>
                          <span className="text-amber-400">{rekapRecord(r).b}</span><span className="text-slate-600">/</span>
                          <span className="text-rose-400">{rekapRecord(r).c}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <Bar value={rekapRecord(r).skor} color={scoreColor(rekapRecord(r).skor, r.statusUnit)} height={5} />
                            <span className="w-8 shrink-0 font-mono text-[11px] text-slate-300">{Math.round(rekapRecord(r).skor)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><KondisiPill kondisi={rekapRecord(r).kondisi} /></td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => mulaiUbah(r)}
                              className="rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-1 text-slate-400 transition hover:border-brand/40 hover:text-brand"
                              aria-label={`Ubah inspeksi ${r.kode}`}
                              title="Ubah sesi ini"
                            >
                              <IconEdit size={13} />
                            </button>
                            <button
                              onClick={() => mulaiHapus(r)}
                              className="rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-1 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                              aria-label={`Hapus inspeksi ${r.kode}`}
                              title="Hapus sesi ini"
                            >
                              <IconTrash size={13} />
                            </button>
                            <button onClick={() => setExpanded(isOpen ? null : key)} className="tap rounded-lg border border-white/10 bg-white/[0.03] p-1 text-slate-400 transition hover:text-brand">
                              <IconChevronDown size={14} className={cx('transition', isOpen && 'rotate-180')} />
                            </button>
                          </div>
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
          </div>
          </>
        ) : (
          <Empty
            title="Belum ada riwayat inspeksi"
            desc="Kirim inspeksi pertama dari menu Inspeksi, atau tarik data dari sheet Data Inspeksi."
            icon={<IconClipboard size={20} />}
            action={
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button className="btn-primary" onClick={() => navigate('inspeksi')}>Mulai Inspeksi</button>
                <button className="btn-ghost" onClick={() => navigate('pengaturan')}>Isi inspeksi awal dari master</button>
              </div>
            }
          />
        )}
      {/* ---------- pager ---------- */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] px-4 py-3">
          <p className="text-[11px] text-slate-500">
            Menampilkan{' '}
            <span className="font-mono font-semibold text-slate-300">
              {mulai + 1}–{sampai}
            </span>{' '}
            dari <span className="font-mono font-semibold text-slate-300">{filtered.length}</span> sesi
            {filtered.length !== records.length && (
              <span className="text-slate-600"> (difilter dari {records.length})</span>
            )}
          </p>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] text-slate-500">Baris</span>
            <Segmented
              value={String(perPage)}
              onChange={(v) => setPerPage(Number(v))}
              size="sm"
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
              ]}
            />

            <div className="ml-1 flex items-center gap-1">
              <button
                className="btn-ghost !px-2 !py-1 !text-[11px] max-sm:!min-h-10 max-sm:!min-w-10"
                disabled={halamanAman === 0}
                onClick={() => setPage(0)}
                title="Halaman pertama"
              >
                «
              </button>
              <button
                className="btn-ghost !px-2 !py-1 !text-[11px] max-sm:!min-h-10 max-sm:!min-w-10"
                disabled={halamanAman === 0}
                onClick={() => setPage(halamanAman - 1)}
              >
                Sebelumnya
              </button>
              <span className="px-1 font-mono text-[11px] text-slate-400">
                {halamanAman + 1} / {totalHalaman}
              </span>
              <button
                className="btn-ghost !px-2 !py-1 !text-[11px] max-sm:!min-h-10 max-sm:!min-w-10"
                disabled={halamanAman >= totalHalaman - 1}
                onClick={() => setPage(halamanAman + 1)}
              >
                Berikutnya
              </button>
              <button
                className="btn-ghost !px-2 !py-1 !text-[11px] max-sm:!min-h-10 max-sm:!min-w-10"
                disabled={halamanAman >= totalHalaman - 1}
                onClick={() => setPage(totalHalaman - 1)}
                title="Halaman terakhir"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}

      </Card>
      </div>

      <EditInspectionModal
        key={editRec?.id || 'no-edit'}
        record={editRec}
        data={data}
        saving={busy}
        offline={offline}
        onClose={() => { if (!busy) setEditRec(null) }}
        onSave={simpanUbah}
      />
      <ConfirmDelete
        record={hapusRec}
        busy={busy}
        onClose={() => { if (!busy) setHapusRec(null) }}
        onConfirm={konfirmasiHapus}
      />
    </div>
  )
}

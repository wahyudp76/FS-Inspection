import React, { useEffect, useMemo, useState } from 'react'
import { cx, fmtDateTime, relativeTime } from '../lib/analytics'
import { Card, CardHeader, Kpi, Empty, Segmented, StatusPill } from '../components/ui'
import { IconSwap, IconEngine, IconDroplet, IconAlert, IconRefresh, IconDownload, IconExternal, IconSearch, IconPlus, IconCheck } from '../components/icons'
import { SOURCE_SHEET } from '../lib/config'
import { bacaRiwayatTukar, tukarUnit, readSwapCache, ringkasTukar, daftarPosisi, kandidatTukar } from '../lib/swap'
import SwapForm from '../components/SwapForm'

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('id-ID').format(n))

/**
 * TUKAR UNIT — rotasi engine & irrigator.
 *
 * Halaman ini menjawab satu kebutuhan lapangan: “unit di lokasi X rusak/dipindah,
 * ganti dengan unit mana?” Pengganti boleh dari stock Standby maupun dari unit
 * yang sedang terpasang di lokasi lain. Semua perubahan ditulis ke sheet master
 * (Status + Wilayah) dan dicatat di sheet “Riwayat Tukar”.
 */
export default function Swap({ data, notify, offline, onSelesai }) {
  const cached = useMemo(() => readSwapCache(), [])
  const [riwayat, setRiwayat] = useState(cached?.riwayat || [])
  const [syncedAt, setSyncedAt] = useState(cached?.at || null)
  const [memuat, setMemuat] = useState(false)
  const [galat, setGalat] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [preset, setPreset] = useState({ tipe: 'Mesin', posisi: '' })
  const [fTipe, setFTipe] = useState('Semua')
  const [q, setQ] = useState('')

  const semuaUnit = useMemo(
    () => [
      ...(data?.mesin || []).map((u) => ({ ...u, tipe: 'Mesin' })),
      ...(data?.irrigator || []).map((u) => ({ ...u, tipe: 'Irrigator' })),
    ],
    [data]
  )
  const ringkas = useMemo(() => ringkasTukar(data || {}, riwayat), [data, riwayat])
  const posisiSemua = useMemo(() => daftarPosisi(semuaUnit, 'Semua'), [semuaUnit])

  const muatRiwayat = async ({ diam = false } = {}) => {
    if (offline) {
      setGalat('Endpoint Apps Script belum diatur (Pengaturan ▸ Koneksi sheet), jadi riwayat tukar belum bisa dimuat.')
      return
    }
    setMemuat(true)
    setGalat('')
    try {
      const r = await bacaRiwayatTukar()
      setRiwayat(r.riwayat)
      setSyncedAt(r.at)
      if (!diam) notify?.({ type: 'success', message: `Riwayat tukar dimuat — ${r.riwayat.length} catatan.` })
    } catch (e) {
      setGalat(e?.message || 'Gagal memuat riwayat tukar dari sheet.')
    } finally {
      setMemuat(false)
    }
  }

  /* muat sekali saat halaman dibuka (kalau endpoint siap) */
  useEffect(() => {
    if (!offline && !cached) muatRiwayat({ diam: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const daftar = useMemo(() => {
    let r = riwayat
    if (fTipe !== 'Semua') r = r.filter((x) => x.tipe === fTipe)
    const kk = q.trim().toUpperCase()
    if (kk) {
      r = r.filter((x) =>
        [x.keluar, x.masuk, x.posisi, x.petugas, x.alasan, x.catatan, x.posisiAsal]
          .filter(Boolean)
          .join(' ')
          .toUpperCase()
          .includes(kk)
      )
    }
    return [...r].sort((a, b) => String(b.tanggal || b.waktu).localeCompare(String(a.tanggal || a.waktu)))
  }, [riwayat, fTipe, q])

  const exportCsv = () => {
    const head = ['Tanggal', 'Tipe', 'Posisi', 'Kode Keluar', 'Status Keluar', 'Kode Masuk', 'Posisi Asal Masuk', 'Alasan', 'Petugas', 'Catatan']
    const body = daftar.map((r) => [r.tanggal, r.tipe, r.posisi, r.keluar, r.statusKeluar, r.masuk, r.posisiAsal, r.alasan, r.petugas, r.catatan])
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `riwayat-tukar-unit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const bukaForm = (tipe = 'Mesin', posisi = '') => {
    setPreset({ tipe, posisi })
    setFormOpen(true)
  }

  const kirim = async (payload) => {
    const hasil = await tukarUnit(payload)
    /* master di sheet sudah berubah → tarik ulang supaya Status/Wilayah di web ikut */
    onSelesai?.()
    setRiwayat((r) => [
      {
        waktu: new Date().toISOString(),
        tanggal: hasil.tanggal || payload.tanggal,
        tipe: payload.tipe,
        posisi: hasil.posisi || payload.posisi,
        keluar: hasil.keluar?.kode || payload.keluar || '',
        statusKeluar: hasil.keluar?.status || payload.statusKeluar || '',
        masuk: hasil.masuk?.kode || payload.masuk,
        posisiAsal: hasil.posisiKosong || '',
        alasan: payload.alasan,
        petugas: payload.petugas,
        catatan: payload.catatan,
      },
      ...r,
    ])
    return hasil
  }

  return (
    <div className="space-y-4">
      {/* ---------------- judul + aksi ---------------- */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              <IconSwap size={16} className="text-brand" /> Tukar Unit
            </h2>
            <p className="mt-0.5 max-w-[70ch] text-[11.5px] leading-relaxed text-slate-500">
              Ganti unit yang terpasang di suatu lokasi dengan unit lain — baik dari <span className="text-slate-700">stock Standby</span>{' '}
              maupun <span className="text-slate-700">unit yang sedang terpasang di lokasi lain</span>. Status &amp; wilayah ditulis ke
              sheet master <span className="font-mono text-slate-700">Mesin</span> / <span className="font-mono text-slate-700">Irrigator</span>,
              jejaknya tersimpan di sheet <span className="text-slate-700">Riwayat Tukar</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => bukaForm('Mesin')} className="btn-primary !px-3 !py-2 !text-[12px]">
              <IconPlus size={14} /> Tukar Unit
            </button>
            <button onClick={() => muatRiwayat()} disabled={memuat} className="btn-ghost !px-3 !py-2 !text-[12px]">
              <IconRefresh size={13} className={memuat ? 'animate-spin' : ''} /> {memuat ? 'Memuat…' : 'Muat riwayat'}
            </button>
            <button onClick={exportCsv} disabled={!daftar.length} className="btn-ghost !px-3 !py-2 !text-[12px]">
              <IconDownload size={13} /> CSV
            </button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <IconRefresh size={11} /> {syncedAt ? `Riwayat dimuat ${relativeTime(syncedAt)}` : 'Riwayat belum dimuat'}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconEngine size={11} /> {fmt(ringkas.standbyMesin)} engine standby · {fmt(ringkas.standbyIrrigator)} irrigator standby
          </span>
          <a href={SOURCE_SHEET.url} target="_blank" rel="noreferrer" className="tap-sm inline-flex items-center gap-1 font-semibold text-brand/90 hover:text-brand">
            Buka spreadsheet master <IconExternal size={10} />
          </a>
        </p>
        {offline && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
            <IconAlert size={13} className="mt-0.5 shrink-0" />
            <span>Endpoint belum diatur — tukar unit butuh koneksi ke Apps Script (menulis ke sheet master). Buka Pengaturan ▸ Koneksi sheet.</span>
          </div>
        )}
      </Card>

      {galat && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-[12px] leading-relaxed text-rose-700">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          <span>{galat}</span>
        </div>
      )}

      {/* ---------------- KPI ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Standby Engine"
          value={fmt(ringkas.standbyMesin)}
          unit="unit"
          hint="Siap dipakai untuk tukar"
          icon={<IconEngine size={14} />}
          accent="#7c3aed"
          onClick={() => { setPreset({ tipe: 'Mesin', posisi: '' }); setFormOpen(true) }}
        />
        <Kpi
          label="Standby Irrigator"
          value={fmt(ringkas.standbyIrrigator)}
          unit="unit"
          hint="Siap dipakai untuk tukar"
          icon={<IconDroplet size={14} />}
          accent="#0891b2"
          onClick={() => { setPreset({ tipe: 'Irrigator', posisi: '' }); setFormOpen(true) }}
        />
        <Kpi
          label="Tukar Bulan Ini"
          value={fmt(ringkas.tukarBulanIni)}
          unit="kali"
          hint={`Total ${fmt(ringkas.totalTukar)} catatan di sheet`}
          icon={<IconSwap size={14} />}
          accent="#0d9488"
        />
        <Kpi
          label="Unit Rusak"
          value={fmt(ringkas.rusak)}
          unit="unit"
          hint="Engine + irrigator berstatus Rusak"
          icon={<IconAlert size={14} />}
          accent="#f43f5e"
        />
      </div>

      {/* ---------------- stok per divisi ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Kesiapan Unit per Divisi"
          sub="Terpasang vs standby dari sheet master — klik divisi untuk langsung menukar"
          icon={<IconEngine size={15} />}
        />
        <div className="grid gap-2 px-3 pb-3 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {posisiSemua.map((p) => {
            const kand = kandidatTukar(semuaUnit, 'Mesin', p.posisi)
            const kandI = kandidatTukar(semuaUnit, 'Irrigator', p.posisi)
            /* daftarPosisi() menghitung gabungan → angka per tipe dihitung terpisah */
            return (
              <button
                key={p.posisi}
                type="button"
                onClick={() => bukaForm('Mesin', p.posisi)}
                className="group rounded-xl border border-slate-900/[0.10] bg-white px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-brand/40"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[13px] font-bold text-slate-900">{p.posisi}</p>
                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-brand">tukar</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1"><IconEngine size={11} /> {fmt(kand.terpasang.length)} terpasang</span>
                  <span className="inline-flex items-center gap-1"><IconDroplet size={11} /> {fmt(kandI.terpasang.length)} irrigator</span>
                </div>
                <p className="mt-1 text-[10.5px] text-slate-500">
                  Stok standby siap: <span className="font-semibold text-slate-700">{fmt(kand.standby.length)}</span> engine ·{' '}
                  <span className="font-semibold text-slate-700">{fmt(kandI.standby.length)}</span> irrigator
                </p>
              </button>
            )
          })}
          {posisiSemua.length === 0 && (
            <div className="sm:col-span-2 xl:col-span-3">
              <Empty title="Belum ada data divisi" desc="Master aset belum dimuat — tekan Sinkron di header." />
            </div>
          )}
        </div>
      </Card>

      {/* ---------------- riwayat ---------------- */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Riwayat Tukar Unit"
          sub={`${daftar.length} catatan · sheet “Riwayat Tukar”`}
          icon={<IconSwap size={15} />}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={fTipe}
                onChange={setFTipe}
                options={[
                  { value: 'Semua', label: 'Semua' },
                  { value: 'Mesin', label: 'Mesin' },
                  { value: 'Irrigator', label: 'Irrigator' },
                ]}
              />
              <div className="relative">
                <IconSearch size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="cari unit / posisi / petugas"
                  className="w-[170px] rounded-xl border border-slate-900/10 bg-white py-1.5 pl-7 pr-2 text-[11.5px] text-slate-700"
                  aria-label="Cari riwayat tukar"
                />
              </div>
            </div>
          }
        />
        {daftar.length ? (
          <>
            {/* HP: kartu */}
            <div className="mt-3 space-y-2 px-3 pb-3 sm:hidden">
              {daftar.slice(0, 60).map((r, i) => (
                <div key={`${r.waktu}-${i}`} className="rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[11.5px] font-semibold text-slate-800">{r.tanggal || (r.waktu || '').slice(0, 10)}</p>
                    <span className="chip !py-0.5 !text-[9.5px]">{r.tipe} · {r.posisi}</span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-700">
                    <span className="font-mono font-semibold">{r.keluar || '—'}</span>
                    <span className="text-slate-400"> → </span>
                    <span className="font-mono font-semibold text-teal-700">{r.masuk}</span>
                    {r.posisiAsal ? <span className="text-slate-500"> (dari {r.posisiAsal})</span> : ''}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-slate-500">{r.alasan || '—'} · {r.petugas || 'tanpa petugas'}</p>
                </div>
              ))}
            </div>
            {/* Desktop: tabel */}
            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[860px] text-left">
                <thead>
                  <tr className="border-y border-slate-900/[0.09] text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2 font-semibold">Tanggal</th>
                    <th className="px-2 py-2 font-semibold">Tipe / Posisi</th>
                    <th className="px-2 py-2 font-semibold">Keluar</th>
                    <th className="px-2 py-2 font-semibold">Masuk</th>
                    <th className="px-2 py-2 font-semibold">Alasan</th>
                    <th className="px-4 py-2 font-semibold">Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {daftar.map((r, i) => (
                    <tr key={`${r.waktu}-${i}`} className="border-b border-slate-900/[0.08] transition hover:bg-slate-900/[0.03]">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <p className="font-mono text-[11.5px] text-slate-800">{r.tanggal || (r.waktu || '').slice(0, 10)}</p>
                        <p className="text-[9.5px] text-slate-500">{r.waktu ? fmtDateTime(r.waktu).split('·')[1] || '' : ''}</p>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="chip !py-0.5 !text-[9.5px]">{r.tipe}</span>
                        <span className="ml-1 font-mono text-[11px] text-slate-600">{r.posisi}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="font-mono text-[12px] font-semibold text-slate-900">{r.keluar || '—'}</span>
                        {r.statusKeluar && <span className="ml-1.5"><StatusPill status={r.statusKeluar} /></span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="font-mono text-[12px] font-semibold text-teal-700">{r.masuk}</span>
                        {r.posisiAsal && <p className="text-[9.5px] text-amber-700">dipindah dari {r.posisiAsal}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-slate-600">{r.alasan || '—'}</td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-700">
                        {r.petugas || '—'}
                        {r.catatan && <p className="truncate text-[9.5px] text-slate-500" title={r.catatan}>{r.catatan}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="px-3 pb-4 pt-2">
            <Empty
              icon={<IconSwap size={20} />}
              title="Belum ada riwayat tukar"
              desc="Setiap tukar unit akan tercatat di sheet “Riwayat Tukar” beserta alasan dan petugasnya."
              action={
                <button onClick={() => bukaForm('Mesin')} className="btn-primary !px-3 !py-2 !text-[12px]">
                  <IconPlus size={13} /> Tukar unit pertama
                </button>
              }
            />
          </div>
        )}
      </Card>

      <SwapForm
        open={formOpen}
        units={semuaUnit}
        presetTipe={preset.tipe}
        presetPosisi={preset.posisi}
        onClose={() => setFormOpen(false)}
        onSubmit={kirim}
        notify={notify}
      />
    </div>
  )
}

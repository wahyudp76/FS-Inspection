import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { serviceStatusMeta } from '../lib/config'
import { IconX, IconAlert, IconClock, IconWrench, IconChevron, IconEngine } from './icons'

const fmt = (n) => (n == null || n === '' ? '—' : new Intl.NumberFormat('id-ID').format(n))
const perHal = 10

const sisaTeks = (sisa) => {
  if (sisa == null) return '—'
  if (sisa === 0) return 'hari ini'
  return sisa > 0 ? `${sisa} hari lagi` : `lewat ${-sisa} hari`
}

const IKON = { terlambat: IconAlert, segera: IconClock, belum: IconWrench }

/**
 * Pop-up ringkas untuk kartu KPI “Lewat Jadwal / Jatuh Tempo / Belum Service”.
 * Isi: sebaran per divisi (posisi), ringkasan cepat, lalu daftar unit (10 per halaman).
 * Klik satu unit → detail engine; tombol bawah → saring tabel evaluasi ke unit-unit ini.
 */
export default function ServiceStatusModal({ statusId, units = [], totalUnit = 0, onClose, onPick, onFilter }) {
  const buka = !!statusId
  useScrollLock(buka)

  const [fPosisi, setFPosisi] = useState(null)
  const [hal, setHal] = useState(0)

  useEffect(() => {
    setFPosisi(null)
    setHal(0)
  }, [statusId])
  useEffect(() => {
    setHal(0)
  }, [fPosisi])

  useEffect(() => {
    if (!buka) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [buka, onClose])

  const m = serviceStatusMeta(statusId)

  /* sebaran per divisi (posisi unit) */
  const perPosisi = useMemo(() => {
    const map = new Map()
    for (const u of units) {
      const p = u.posisi || 'TANPA POSISI'
      const cur = map.get(p) || { posisi: p, jumlah: 0, jenis: new Map() }
      cur.jumlah += 1
      cur.jenis.set(u.jenis || '—', (cur.jenis.get(u.jenis || '—') || 0) + 1)
      map.set(p, cur)
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        jenis: [...g.jenis.entries()].sort((a, b) => b[1] - a[1]),
        pct: units.length ? Math.round((g.jumlah / units.length) * 100) : 0,
      }))
      .sort((a, b) => b.jumlah - a.jumlah)
  }, [units])

  /* ringkasan cepat 1–2 baris */
  const insight = useMemo(() => {
    if (!units.length) return null
    const terbanyak = perPosisi[0]
    const dasar = terbanyak ? `${terbanyak.posisi} paling banyak (${terbanyak.jumlah} unit)` : ''
    if (statusId === 'terlambat') {
      const maks = units.reduce((a, u) => Math.max(a, u.warning ?? 0), 0)
      const rata = Math.round(units.reduce((a, u) => a + (u.warning ?? 0), 0) / units.length)
      const u0 = units.find((u) => (u.warning ?? 0) === maks)
      return `${dasar} · paling lama ${u0?.kode || '—'} (${maks} hari) · rata-rata telat ${rata} hari`
    }
    if (statusId === 'segera') {
      const min = units.reduce((a, u) => Math.min(a, u.sisaHari ?? 9999), 9999)
      const u0 = units.find((u) => u.sisaHari === min)
      return `${dasar} · paling cepat ${u0?.kode || '—'} (${sisaTeks(min)})`
    }
    if (statusId === 'belum') return `${dasar} dari ${fmt(totalUnit)} engine di tb_service1 sama sekali belum punya baris di tb_service2`
    return dasar
  }, [units, perPosisi, statusId, totalUnit])

  const daftar = useMemo(
    () => (fPosisi ? units.filter((u) => (u.posisi || 'TANPA POSISI') === fPosisi) : units),
    [units, fPosisi]
  )
  const totalHal = Math.max(1, Math.ceil(daftar.length / perHal))
  const halAman = Math.min(hal, totalHal - 1)
  const baris = daftar.slice(halAman * perHal, halAman * perHal + perHal)

  if (!buka) return null
  const Ikon = IKON[statusId] || IconEngine

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Ringkasan ${m.label}`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onClose?.()} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-850 shadow-2xl sm:max-w-[640px] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-white/[0.07] px-4 py-3.5">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: `${m.color}22`, color: m.color }}
          >
            <Ikon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-white">
              {m.label} <span className="font-mono text-slate-300">· {fmt(units.length)} unit</span>
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{m.desc}</p>
          </div>
          <button
            onClick={() => onClose?.()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
            aria-label="Tutup"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
          {!units.length ? (
            <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-6 text-center text-[12px] text-slate-400">
              Tidak ada unit pada kategori ini. Bagus.
            </p>
          ) : (
            <>
              {/* sebaran per divisi */}
              <p className="mb-1.5 text-[9.5px] uppercase tracking-wider text-slate-500">Dari divisi mana saja</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFPosisi(null)}
                  className={cx(
                    'rounded-lg border px-2 py-1 text-[11px] transition',
                    !fPosisi
                      ? 'border-brand/50 bg-brand/15 font-semibold text-brand'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                  )}
                >
                  Semua <span className="font-mono">{fmt(units.length)}</span>
                </button>
                {perPosisi.map((g) => (
                  <button
                    key={g.posisi}
                    onClick={() => setFPosisi(g.posisi === fPosisi ? null : g.posisi)}
                    aria-pressed={fPosisi === g.posisi}
                    data-div={g.posisi}
                    data-jumlah={g.jumlah}
                    className={cx(
                      'rounded-lg border px-2 py-1 text-[11px] transition',
                      fPosisi === g.posisi
                        ? 'border-brand/50 bg-brand/15 font-semibold text-brand'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
                    )}
                    title={g.jenis.map(([j, n]) => `${j}: ${n}`).join(' · ')}
                  >
                    {g.posisi} <span className="font-mono">{fmt(g.jumlah)}</span>
                    <span className="ml-1 text-[9.5px] text-slate-500">{g.pct}%</span>
                  </button>
                ))}
              </div>

              {/* bar komposisi divisi */}
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
                {perPosisi.map((g, i) => (
                  <div
                    key={g.posisi}
                    title={`${g.posisi}: ${g.jumlah} unit (${g.pct}%)`}
                    style={{
                      width: `${g.pct}%`,
                      background: ['#38bdf8', '#a78bfa', '#f59e0b', '#22c55e', '#f43f5e'][i % 5],
                    }}
                  />
                ))}
              </div>

              {insight && (
                <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-400">
                  {insight}
                </p>
              )}

              {/* daftar unit */}
              <div className="mb-1.5 mt-3 flex items-center justify-between">
                <p className="text-[9.5px] uppercase tracking-wider text-slate-500">
                  Daftar unit {fPosisi ? `· ${fPosisi}` : ''}
                </p>
                <p className="text-[9.5px] text-slate-500">klik unit → detail engine</p>
              </div>
              <div
                className="overflow-hidden rounded-xl border border-white/[0.07]"
                data-daftar-total={daftar.length}
                data-daftar-posisi={fPosisi || ''}
              >
                {baris.map((u, i) => (
                  <button
                    key={u.kode}
                    onClick={() => onPick?.(u)}
                    className={cx(
                      'flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.05]',
                      i > 0 && 'border-t border-white/[0.05]'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-slate-100">{u.kode}</span>
                        <span className="rounded border border-white/10 bg-white/[0.04] px-1 py-px text-[9px] text-slate-400">
                          {u.posisi || '—'}
                        </span>
                        <span className="text-[9px] text-slate-500">{u.jenis}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {statusId === 'belum'
                          ? 'Belum ada catatan service di tb_service2'
                          : `Service terakhir ${u.terakhirIso || '—'} · jadwal ${u.nextIso || '—'} · HM ${fmt(u.hm)}`}
                      </span>
                    </span>
                    {statusId !== 'belum' && (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                        style={{ background: `${m.color}1f`, color: m.color }}
                      >
                        {statusId === 'terlambat' ? `+${u.warning ?? 0} hr` : sisaTeks(u.sisaHari)}
                      </span>
                    )}
                    <IconChevron size={13} className="shrink-0 text-slate-500" />
                  </button>
                ))}
              </div>

              {totalHal > 1 && (
                <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-500">
                  <span>
                    {halAman * perHal + 1}–{Math.min(daftar.length, (halAman + 1) * perHal)} dari {daftar.length} unit
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => setHal(Math.max(0, halAman - 1))}
                      disabled={halAman <= 0}
                      className="btn-ghost !px-2 !py-1 !text-[10.5px] disabled:opacity-40"
                    >
                      <IconChevron size={12} className="rotate-180" /> Sebelumnya
                    </button>
                    <span className="font-mono">
                      {halAman + 1} / {totalHal}
                    </span>
                    <button
                      onClick={() => setHal(Math.min(totalHal - 1, halAman + 1))}
                      disabled={halAman >= totalHal - 1}
                      className="btn-ghost !px-2 !py-1 !text-[10.5px] disabled:opacity-40"
                    >
                      Berikutnya <IconChevron size={12} />
                    </button>
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-3">
          <button onClick={() => onClose?.()} className="btn-ghost !px-3 !py-1.5 !text-[11.5px]">
            Tutup
          </button>
          <button
            onClick={() => onFilter?.(statusId)}
            disabled={!units.length}
            className="btn-primary !px-3 !py-1.5 !text-[11.5px] disabled:opacity-40"
          >
            Saring tabel · {fmt(units.length)} unit
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

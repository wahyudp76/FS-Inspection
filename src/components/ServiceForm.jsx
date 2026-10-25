import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { INTERVAL_HM, mingguKe, namaBulan, hariIniIso } from '../lib/service'
import { serviceStatusMeta } from '../lib/config'
import { IconWrench, IconSearch, IconX, IconCheck, IconAlert, IconChevronDown } from './icons'

const angka = (v) => {
  const t = String(v ?? '').trim()
  if (!t) return null // kosong ≠ 0
  const n = Number(t.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) && t.replace(/[^\d]/g, '') !== '' ? n : null
}

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('id-ID').format(n))

/**
 * Pop-up pencatatan service engine → menulis SATU baris baru ke tb_service2
 * (sheet "Monitor Kasie FS"). Setelah tersimpan, tb_service1 dihitung ulang
 * oleh rumus sheet, jadi jadwal service ikut berubah.
 */
export default function ServiceForm({ open, units = [], log = [], presetKode, onClose, onSubmit, notify }) {
  const [kode, setKode] = useState(presetKode || '')
  const [cari, setCari] = useState('')
  const [daftarBuka, setDaftarBuka] = useState(false)
  const [tanggal, setTanggal] = useState(hariIniIso())
  const [hm, setHm] = useState('')
  const [minggu, setMinggu] = useState('')
  const [posisi, setPosisi] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [sukses, setSukses] = useState(null)
  const boxRef = useRef(null)

  useScrollLock(!!open)

  const unit = useMemo(() => units.find((u) => u.kode === kode) || null, [units, kode])

  /* reset tiap kali pop-up dibuka */
  useEffect(() => {
    if (!open) return
    const t = presetKode || ''
    setKode(t)
    setCari('')
    setDaftarBuka(!t)
    setTanggal(hariIniIso())
    setMinggu(String(mingguKe(hariIniIso()) || ''))
    setPosisi('')
    setSibuk(false)
    setGalat('')
    setSukses(null)
    const u = units.find((x) => x.kode === t)
    /* HM sengaja dibiarkan kosong: diisi angka hasil pembacaan hour meter saat ini.
       Nilai HM terakhir hanya jadi petunjuk (placeholder) supaya tidak tersimpan dobel. */
    setHm('')
    setPosisi(u?.posisi || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetKode])

  /* Esc untuk menutup */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (daftarBuka) setDaftarBuka(false)
        else onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, daftarBuka])

  /* klik di luar daftar unit → tutup daftar */
  useEffect(() => {
    if (!daftarBuka) return undefined
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setDaftarBuka(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [daftarBuka])

  const pilihUnit = (u) => {
    setKode(u.kode)
    setPosisi(u.posisi || '')
    setHm('')
    setCari('')
    setDaftarBuka(false)
    setGalat('')
  }

  const saring = useMemo(() => {
    const q = cari.trim().toUpperCase()
    const pool = q ? units.filter((u) => u.kode.includes(q) || (u.jenis || '').includes(q) || (u.posisi || '').includes(q)) : units
    /* urutkan: yang paling perlu service lebih dulu */
    const bobot = { terlambat: 0, segera: 1, tanpaJadwal: 2, belum: 3, aman: 4 }
    return [...pool].sort((a, b) => (bobot[a.status] - bobot[b.status]) || a.kode.localeCompare(b.kode)).slice(0, 40)
  }, [units, cari])

  const hmNum = angka(hm)
  const hmLama = unit?.hm ?? null
  const naik = hmNum != null && hmLama != null ? hmNum - hmLama : null
  const tidakNaik = hmNum != null && hmLama != null && hmNum <= hmLama

  /* perkiraan jadwal berikutnya memakai rerata HM/hari unit */
  const perkiraan = useMemo(() => {
    if (hmNum == null) return null
    const nextHm = hmNum + INTERVAL_HM
    const rerata = unit?.rerata
    if (rerata && rerata > 0) {
      const hariLagi = Math.ceil(INTERVAL_HM / rerata)
      const d = new Date(`${tanggal}T00:00:00`)
      d.setDate(d.getDate() + hariLagi)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { nextHm, hariLagi, nextIso: iso, rerata }
    }
    return { nextHm, hariLagi: null, nextIso: '', rerata: null }
  }, [hmNum, unit, tanggal])

  const bisaSimpan = !!kode && !!tanggal && hmNum != null && hmNum > 0 && !sibuk

  const simpan = async () => {
    setGalat('')
    if (!kode) return setGalat('Pilih kode mesin yang diservice dulu.')
    if (!tanggal) return setGalat('Tanggal service belum diisi.')
    if (hmNum == null || hmNum <= 0) return setGalat('HM service harus berupa angka lebih dari 0.')
    if (tidakNaik) return setGalat(`HM service (${fmt(hmNum)}) harus lebih besar dari HM terakhir (${fmt(hmLama)}).`)
    setSibuk(true)
    try {
      const hasil = await onSubmit?.({
        kode,
        tanggal,
        hm: hmNum,
        minggu: Number(minggu) || mingguKe(tanggal) || 1,
        posisi: posisi || unit?.posisi || '',
      })
      setSukses({ ...hasil, kode, hm: hmNum, tanggal })
      notify?.({
        type: 'success',
        message: `Service ${kode} (HM ${fmt(hmNum)}) tersimpan di sheet “Monitor Kasie FS”.`,
      })
      /* beri waktu pengguna membaca ringkasan hasil, lalu tutup */
      setTimeout(() => onClose?.(), 2200)
    } catch (e) {
      setGalat(e?.message || 'Gagal menyimpan ke sheet.')
      notify?.({ type: 'error', message: e?.message || 'Gagal menyimpan service ke sheet.' })
    } finally {
      setSibuk(false)
    }
  }

  if (!open) return null

  const statusUnit = unit ? serviceStatusMeta(unit.status) : null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Catat service engine">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !sibuk && onClose?.()} />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-850 shadow-2xl sm:max-w-[560px] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-white/[0.07] px-4 py-3.5">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <IconWrench size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-white">Catat Service Engine</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Tersimpan ke sheet <span className="text-slate-300">Monitor Kasie FS</span> (tb_service2), lalu jadwal di{' '}
              <span className="text-slate-300">Data Service Engine</span> (tb_service1) dihitung ulang otomatis.
            </p>
          </div>
          <button onClick={() => !sibuk && onClose?.()} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Tutup">
            <IconX size={16} />
          </button>
        </div>

        {/* isi */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
          {sukses ? (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200">
                <IconCheck size={15} /> Service {sukses.kode} tercatat
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-emerald-100/80">
                HM {fmt(sukses.hm)} · {sukses.tanggal}
                {sukses.baris ? ` · baris ${sukses.baris} sheet` : ''}
              </p>
              {sukses.eval && (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-300">
                  Jadwal berikutnya: <span className="font-semibold text-white">{sukses.eval.nextService || '—'}</span>
                  {sukses.eval.nextHm ? ` · HM ${fmt(sukses.eval.nextHm)}` : ''}
                  {sukses.eval.warning != null ? ` · ${sukses.eval.warning > 0 ? `lewat ${sukses.eval.warning} hari` : `sisa ${-sukses.eval.warning} hari`}` : ''}
                </p>
              )}
              {sukses.verified === false && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
                  <IconAlert size={13} className="mt-0.5 shrink-0" />
                  Baris tersimpan, tetapi rumus tb_service1 belum membacanya. Periksa rentang tabel tb_service2 di sheet.
                </p>
              )}
            </div>
          ) : null}

          {!sukses && (
            <>
              {/* pilih unit */}
              <div ref={boxRef} className="relative">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Kode mesin</label>
                <button
                  type="button"
                  onClick={() => setDaftarBuka((o) => !o)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition',
                    kode ? 'border-brand/45 bg-brand/10 text-white' : 'border-white/10 bg-ink-900/80 text-slate-400 hover:border-white/20'
                  )}
                  aria-haspopup="listbox"
                  aria-expanded={daftarBuka}
                >
                  <span className="min-w-0 flex-1 truncate">{kode || 'Pilih kode mesin…'}</span>
                  {unit && <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{unit.posisi}</span>}
                  {statusUnit && (
                    <span className={cx('shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', statusUnit.cls)}>{statusUnit.short}</span>
                  )}
                  <IconChevronDown size={14} className={cx('shrink-0 text-slate-500 transition', daftarBuka && 'rotate-180')} />
                </button>

                {daftarBuka && (
                  <div className="absolute left-0 right-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl">
                    <div className="relative border-b border-white/[0.06] p-2">
                      <IconSearch size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        autoFocus
                        value={cari}
                        onChange={(e) => setCari(e.target.value)}
                        placeholder="Cari kode / jenis (mis. SPC, DEC)…"
                        className="w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 pl-8 text-[12px] text-slate-100 placeholder:text-slate-600 focus:border-brand/50 focus:outline-none"
                      />
                    </div>
                    <div className="max-h-[46vh] overflow-y-auto py-1" role="listbox">
                      {saring.map((u) => {
                        const m = serviceStatusMeta(u.status)
                        return (
                          <button
                            key={u.kode}
                            type="button"
                            role="option"
                            aria-selected={u.kode === kode}
                            onClick={() => pilihUnit(u)}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono text-[12px] font-semibold text-slate-100">{u.kode}</span>
                              <span className="block truncate text-[10px] text-slate-500">
                                {u.jenis} · {u.posisi} · HM {fmt(u.hm)} · {u.nextIso ? `jadwal ${u.nextIso}` : 'belum ada jadwal'}
                              </span>
                            </span>
                            <span className={cx('shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold', m.cls)}>{m.short}</span>
                          </button>
                        )
                      })}
                      {!saring.length && <p className="px-3 py-4 text-center text-[11px] text-slate-500">Tidak ada unit yang cocok</p>}
                    </div>
                  </div>
                )}
              </div>

              {unit && (
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 sm:grid-cols-4">
                  {[
                    ['Service terakhir', unit.terakhirIso || 'Belum pernah'],
                    ['HM terakhir', fmt(unit.hm)],
                    ['Jadwal berikut', unit.nextIso || '—'],
                    ['Rerata HM/hari', unit.rerata ? `${fmt(unit.rerata)} HM` : '—'],
                  ].map(([l, v]) => (
                    <div key={l} className="min-w-0">
                      <p className="text-[9.5px] uppercase tracking-wider text-slate-500">{l}</p>
                      <p className="truncate font-mono text-[12px] font-semibold text-slate-100">{v}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* tanggal + minggu */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tanggal service</label>
                  <input
                    type="date"
                    value={tanggal}
                    onChange={(e) => {
                      setTanggal(e.target.value)
                      setMinggu(String(mingguKe(e.target.value) || ''))
                    }}
                    className="input"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    {namaBulan(Number(tanggal?.slice(5, 7)) || 0) || '—'} · otomatis
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Minggu ke-</label>
                  <select value={minggu} onChange={(e) => setMinggu(e.target.value)} className="input">
                    {[1, 2, 3, 4, 5].map((w) => (
                      <option key={w} value={String(w)} className="bg-ink-800">
                        Minggu {w}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">= ROUNDUP(tanggal/7)</p>
                </div>
              </div>

              {/* HM */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">HM service (hour meter)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={hm}
                  onChange={(e) => setHm(e.target.value)}
                  placeholder={hmLama != null ? `HM terakhir ${fmt(hmLama)}` : 'mis. 1139'}
                  className={cx('input font-mono', tidakNaik && 'border-rose-400/60')}
                />
                {naik != null && naik > 0 && (
                  <p className="mt-1 text-[10.5px] text-slate-500">
                    Naik <span className="font-semibold text-slate-300">{fmt(naik)} HM</span> dari service terakhir
                    {perkiraan?.nextIso ? ` · perkiraan jadwal berikutnya ${perkiraan.nextIso} (${perkiraan.hariLagi} hari)` : ''}
                  </p>
                )}
                {tidakNaik && (
                  <p className="mt-1 text-[10.5px] text-rose-300">HM harus lebih besar dari HM service terakhir ({fmt(hmLama)}).</p>
                )}
              </div>

              {perkiraan && (
                <div className="rounded-xl border border-brand/25 bg-brand/[0.07] p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-brand/90">Setelah dicatat</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-200">
                    HM service berikutnya <span className="font-mono font-semibold text-white">{fmt(perkiraan.nextHm)}</span>
                    {perkiraan.nextIso ? <> · sekitar <span className="font-semibold text-white">{perkiraan.nextIso}</span> ({perkiraan.hariLagi} hari lagi, asumsi {fmt(perkiraan.rerata)} HM/hari)</> : ' · tanggal belum bisa dihitung karena rerata HM/hari kosong di sheet'}
                  </p>
                </div>
              )}

              {galat && (
                <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-rose-200">
                  <IconAlert size={13} className="mt-0.5 shrink-0" /> {galat}
                </p>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {!sukses && (
          <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
            <button onClick={() => !sibuk && onClose?.()} className="btn-ghost flex-1 justify-center !py-2.5" disabled={sibuk}>
              Batal
            </button>
            <button onClick={simpan} disabled={!bisaSimpan} className="btn-primary flex-[1.6] justify-center !py-2.5 disabled:opacity-45">
              {sibuk ? 'Menyimpan ke sheet…' : 'Simpan ke Sheet'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { Card } from './ui'
import { IconX, IconCheck, IconAlert, IconEngine, IconDroplet, IconSwap, IconSearch } from './icons'
import { ALASAN_TUKAR, STATUS_KELUAR, TIPE_ASET, kandidatTukar, daftarPosisi } from '../lib/swap'

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('id-ID').format(n))
const hariIniIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Pop-up TUKAR UNIT.
 *
 * Satu unit di sebuah lokasi (unit keluar) diganti unit lain (unit masuk) yang
 * berasal dari stock Standby atau dari lokasi lain. Yang ditulis ke sheet:
 * Status unit keluar → Standby/Rusak, Status + Wilayah unit masuk → Terpasang
 * di lokasi itu, plus satu baris di sheet “Riwayat Tukar”.
 */
export default function SwapForm({ open, units = [], presetTipe, presetPosisi, onClose, onSubmit, notify }) {
  const [tipe, setTipe] = useState(presetTipe || 'Mesin')
  const [posisi, setPosisi] = useState(presetPosisi || '')
  const [keluar, setKeluar] = useState('')
  const [masuk, setMasuk] = useState('')
  const [statusKeluar, setStatusKeluar] = useState('Standby')
  const [alasan, setAlasan] = useState('rusak')
  const [tanggal, setTanggal] = useState(hariIniIso())
  const [petugas, setPetugas] = useState('')
  const [catatan, setCatatan] = useState('')
  const [cari, setCari] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [sukses, setSukses] = useState(null)

  useScrollLock(!!open)

  /* `units` sudah berupa daftar gabungan dengan penanda tipe (Mesin/Irrigator) */
  const semua = units

  const posisiList = useMemo(() => daftarPosisi(semua, tipe), [semua, tipe])
  const kand = useMemo(() => kandidatTukar(semua, tipe, posisi), [semua, tipe, posisi])

  /* reset tiap pop-up dibuka */
  useEffect(() => {
    if (!open) return
    setTipe(presetTipe || 'Mesin')
    setPosisi(presetPosisi || '')
    setKeluar('')
    setMasuk('')
    setStatusKeluar('Standby')
    setAlasan('rusak')
    setTanggal(hariIniIso())
    setPetugas('')
    setCatatan('')
    setCari('')
    setGalat('')
    setSukses(null)
    setSibuk(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ganti tipe → posisi & pilihan direset (unit tipe lain tidak berlaku) */
  useEffect(() => {
    setKeluar('')
    setMasuk('')
  }, [tipe])

  /* posisi pertama otomatis dipilih supaya form tidak kosong */
  useEffect(() => {
    if (!posisi && posisiList.length) setPosisi(posisiList[0].posisi)
  }, [posisiList, posisi])

  /* unit keluar default: unit terpasang pertama di posisi itu */
  useEffect(() => {
    if (keluar && kand.keluar.some((u) => u.kode === keluar)) return
    setKeluar(kand.keluar.length ? kand.keluar[0].kode : '')
  }, [kand, keluar])

  const unitKeluar = kand.keluar.find((u) => u.kode === keluar) || null
  const unitMasuk = useMemo(
    () => [...kand.standby, ...kand.terpasangLain].find((u) => u.kode === masuk) || null,
    [kand, masuk]
  )
  const relokasi = !!unitMasuk && String(unitMasuk.status || '').trim() === 'Terpasang' && unitMasuk.kode !== keluar

  const saring = (arr) => {
    const q = cari.trim().toUpperCase()
    if (!q) return arr
    return arr.filter((u) => [u.kode, u.spec, u.unit, u.jenis, u.wilayah].filter(Boolean).join(' ').toUpperCase().includes(q))
  }

  const bisaSimpan = !!masuk && !!posisi && !sibuk

  const simpan = async () => {
    setGalat('')
    if (!posisi) return setGalat('Pilih lokasi/posisi dulu.')
    if (!masuk) return setGalat('Pilih unit yang akan dipasang (unit masuk).')
    if (keluar && keluar === masuk) return setGalat('Unit keluar dan unit masuk tidak boleh sama.')

    const teks =
      `Tukar unit ${tipe} di ${posisi}:\n\n` +
      (unitKeluar ? `• keluar : ${unitKeluar.kode} → ${statusKeluar}\n` : '• tanpa unit keluar (hanya pasang)\n') +
      `• masuk  : ${masuk}${relokasi ? ` (dipindah dari ${unitMasuk.wilayah})` : ' (dari stock Standby)'}\n\n` +
      'Sheet master Mesin/Irrigator akan diubah (Status & Wilayah) dan satu baris masuk “Riwayat Tukar”. Lanjutkan?'
    if (typeof window !== 'undefined' && !window.confirm(teks)) return

    setSibuk(true)
    try {
      const hasil = await onSubmit?.({
        tipe,
        posisi,
        keluar: keluar || '',
        masuk,
        statusKeluar,
        alasan: (ALASAN_TUKAR.find((a) => a.id === alasan) || {}).label || alasan,
        tanggal,
        petugas,
        catatan,
      })
      setSukses({ ...(hasil || {}), keluarKode: keluar, masukKode: masuk, relokasi })
      notify?.({ type: 'success', message: `${masuk} sekarang terpasang di ${posisi}.` })
    } catch (e) {
      setGalat(e?.message || 'Gagal menyimpan tukar unit.')
      notify?.({ type: 'error', message: e?.message || 'Gagal menyimpan tukar unit.' })
    } finally {
      setSibuk(false)
    }
  }

  if (!open) return null

  const opsiMasuk = (arr) =>
    saring(arr).map((u) => (
      <option key={u.kode} value={u.kode}>
        {u.kode} · {u.wilayah || '—'} · {u.spec || u.unit || u.jenis || ''}
      </option>
    ))

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Tukar unit aset">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !sibuk && onClose?.()} />
      <div className="relative flex max-h-[93vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-900/10 bg-white shadow-2xl sm:max-w-[620px] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-start gap-3 border-b border-slate-900/[0.10] px-4 py-3.5">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <IconSwap size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold text-slate-900">Tukar Unit</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Mengubah <span className="text-slate-700">Status</span> & <span className="text-slate-700">Wilayah</span> di sheet master,
              lalu mencatat jejaknya di sheet <span className="text-slate-700">Riwayat Tukar</span>.
            </p>
          </div>
          <button onClick={() => !sibuk && onClose?.()} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900" aria-label="Tutup">
            <IconX size={16} />
          </button>
        </div>

        {/* isi */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
          {sukses ? (
            <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
                <IconCheck size={15} /> Tukar unit tercatat
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-emerald-800/90">
                {sukses.keluar?.kode || sukses.keluarKode
                  ? `${sukses.keluar?.kode || sukses.keluarKode} → ${sukses.keluar?.status || statusKeluar}`
                  : 'Tanpa unit keluar'}
                {' · '}
                <span className="font-semibold">{sukses.masuk?.kode || sukses.masukKode}</span> sekarang Terpasang di{' '}
                <span className="font-semibold">{sukses.posisi || posisi}</span>
              </p>
              {sukses.posisiKosong && (
                <p className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800">
                  Catatan: {sukses.masuk?.kode || sukses.masukKode} sebelumnya terpasang di <b>{sukses.posisiKosong}</b> — lokasi itu kini
                  kekurangan satu unit. Pasang unit pengganti bila perlu.
                </p>
              )}
              <button onClick={() => onClose?.()} className="btn-primary mt-3 w-full justify-center !py-2">
                Selesai
              </button>
            </div>
          ) : (
            <>
              {/* tipe + posisi */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tipe aset</label>
                  <div className="flex gap-1.5">
                    {TIPE_ASET.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipe(t)}
                        aria-pressed={tipe === t}
                        className={cx(
                          'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[12px] font-medium transition',
                          tipe === t
                            ? 'border-brand/50 bg-brand/10 text-brand'
                            : 'border-slate-900/10 bg-white text-slate-600 hover:border-slate-900/20'
                        )}
                      >
                        {t === 'Mesin' ? <IconEngine size={13} /> : <IconDroplet size={13} />} {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Lokasi / posisi</label>
                  <select className="input !py-2 font-mono text-[12.5px]" value={posisi} onChange={(e) => setPosisi(e.target.value)}>
                    {posisiList.length === 0 && <option value="">— belum ada data —</option>}
                    {posisiList.map((p) => (
                      <option key={p.posisi} value={p.posisi}>
                        {p.posisi} — {p.terpasang} terpasang · {p.standby} standby
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* unit keluar */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Unit keluar — yang sekarang terpasang di {posisi || '…'}
                </label>
                <select className="input !py-2 font-mono text-[12.5px]" value={keluar} onChange={(e) => setKeluar(e.target.value)}>
                  <option value="">— tanpa unit keluar (hanya memasang unit) —</option>
                  {kand.keluar.map((u) => (
                    <option key={u.kode} value={u.kode}>
                      {u.kode} · {u.spec || u.unit || u.jenis || ''}
                      {u.score != null ? ` · skor ${Math.round(u.score)}` : ''}
                    </option>
                  ))}
                </select>
                {kand.keluar.length === 0 && (
                  <p className="mt-1 text-[10.5px] text-amber-700">
                    Tidak ada unit Terpasang tercatat di {posisi || 'posisi ini'} — pilih posisi lain atau pakai mode “hanya memasang unit”.
                  </p>
                )}
              </div>

              {/* unit masuk */}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Unit masuk — pengganti</label>
                  <div className="relative">
                    <IconSearch size={11} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={cari}
                      onChange={(e) => setCari(e.target.value)}
                      placeholder="cari kode…"
                      className="w-[130px] rounded-lg border border-slate-900/10 bg-white py-1 pl-6 pr-1.5 text-[11px] text-slate-700"
                      aria-label="Cari unit masuk"
                    />
                  </div>
                </div>
                <select
                  className="input !py-2 font-mono text-[12.5px]"
                  value={masuk}
                  onChange={(e) => setMasuk(e.target.value)}
                >
                  <option value="">— pilih unit —</option>
                  <optgroup label={`Stock Standby (${kand.standby.length})`}>{opsiMasuk(kand.standby)}</optgroup>
                  <optgroup label={`Terpasang di lokasi lain (${kand.terpasangLain.length})`}>{opsiMasuk(kand.terpasangLain)}</optgroup>
                </select>
                {relokasi && (
                  <p className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-amber-800">
                    Unit ini sedang Terpasang di <b>{unitMasuk.wilayah}</b>. Setelah ditukar, {unitMasuk.wilayah} kehilangan satu unit —
                    catat juga penggantinya bila perlu.
                  </p>
                )}
              </div>

              {/* status keluar + alasan */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status unit keluar</label>
                  <div className="flex gap-1.5">
                    {STATUS_KELUAR.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStatusKeluar(s.id)}
                        aria-pressed={statusKeluar === s.id}
                        title={s.desc}
                        className={cx(
                          'flex-1 rounded-xl border px-2 py-2 text-[12px] font-medium transition',
                          statusKeluar === s.id
                            ? s.id === 'Rusak'
                              ? 'border-rose-500/50 bg-rose-500/10 text-rose-700'
                              : 'border-violet-500/50 bg-violet-500/10 text-violet-700'
                            : 'border-slate-900/10 bg-white text-slate-600 hover:border-slate-900/20'
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Alasan</label>
                  <select className="input !py-2 text-[12.5px]" value={alasan} onChange={(e) => setAlasan(e.target.value)}>
                    {ALASAN_TUKAR.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tanggal tukar</label>
                  <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="input !py-2 font-mono text-[12.5px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Petugas</label>
                  <input
                    value={petugas}
                    onChange={(e) => setPetugas(e.target.value)}
                    placeholder="nama kasie / teknisi"
                    className="input !py-2 text-[12.5px]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Catatan (opsional)</label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={2}
                  placeholder="mis. pompa bocor, diganti unit dari stock PG2"
                  className="input text-[12px] leading-relaxed"
                />
              </div>

              {/* ringkasan */}
              {masuk && (
                <Card className="border-brand/25 bg-brand/[0.06] !p-0">
                  <div className="p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-brand/90">Setelah disimpan</p>
                    <ul className="mt-1 space-y-0.5 text-[11.5px] leading-relaxed text-slate-800">
                      <li>
                        <span className="font-mono font-semibold">{masuk}</span> → <span className="font-semibold">Terpasang</span> di {posisi}
                        {relokasi ? ` (pindah dari ${unitMasuk.wilayah})` : ' (dari stock Standby)'}
                      </li>
                      <li>
                        {keluar ? (
                          <>
                            <span className="font-mono font-semibold">{keluar}</span> → <span className="font-semibold">{statusKeluar}</span>
                          </>
                        ) : (
                          <>Tidak ada unit yang dikeluarkan — jumlah unit di {posisi} bertambah 1</>
                        )}
                      </li>
                      <li className="text-slate-500">
                        Stok Standby {tipe} saat ini {fmt(kand.standby.length)} unit
                        {relokasi ? ` · ${unitMasuk.wilayah} tinggal ${fmt(kand.terpasangLain.filter((u) => u.wilayah === unitMasuk.wilayah).length - 1)} terpasang` : ''}
                      </li>
                    </ul>
                  </div>
                </Card>
              )}

              {galat && (
                <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-rose-700">
                  <IconAlert size={13} className="mt-0.5 shrink-0" /> {galat}
                </p>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {!sukses && (
          <div className="flex items-center gap-2 border-t border-slate-900/[0.10] px-4 py-3">
            <button onClick={() => !sibuk && onClose?.()} className="btn-ghost flex-1 justify-center !py-2.5" disabled={sibuk}>
              Batal
            </button>
            <button onClick={simpan} disabled={!bisaSimpan} className="btn-primary flex-1 justify-center !py-2.5 disabled:opacity-50">
              {sibuk ? 'Menyimpan…' : <><IconSwap size={14} /> Tukar Sekarang</>}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

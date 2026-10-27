import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx, scoreOf, kondisiOf, GRADE_COLOR } from '../lib/analytics'
import { useScrollLock } from '../lib/scrollLock'
import { GRADES } from '../lib/config'
import { ScoreRing, Bar } from './ui'
import { IconCheck, IconAlert, IconClipboard, IconTruck, IconDroplet } from './icons'

const GRADE_ORDER = GRADES.map((g) => g.value)

/**
 * Pop-up ubah satu sesi inspeksi.
 * Petugas, tanggal, catatan, serta nilai A/B/C tiap komponen bisa diubah;
 * skor & kondisi dihitung ulang otomatis (server juga menghitung ulang).
 */
export default function EditInspectionModal({ record, data, onClose, onSave, saving, offline }) {
  const groups = record?.tipe === 'Irrigator' ? data?.groups?.irrigator : data?.groups?.mesin
  const daftar = useMemo(() => (groups || []).flatMap((g) => g.items), [groups])

  const [tanggal, setTanggal] = useState(record?.tanggal || '')
  const [petugas, setPetugas] = useState(record?.inspector || '')
  const [catatan, setCatatan] = useState(record?.catatan || '')
  const [grades, setGrades] = useState(() => ({ ...(record?.komponen || {}) }))
  const [onlyFilled, setOnlyFilled] = useState(false)

  /* isi ulang form setiap kali record yang diedit berganti */
  useEffect(() => {
    if (!record) return
    setTanggal(record.tanggal || '')
    setPetugas(record.inspector || '')
    setCatatan(record.catatan || '')
    setGrades({ ...(record.komponen || {}) })
    setOnlyFilled(false)
  }, [record?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* kunci scroll hanya ketika benar-benar terbuka (bug: dulu body terkunci terus) */
  useScrollLock(!!record)
  useEffect(() => {
    if (!record) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [!!record, onClose]) // eslint-disable-line react-hooks/exhaustive-deps

  /* SEMUA hook harus dipanggil sebelum render kondisional (aturan React) */
  const nilai = useMemo(() => scoreOf(grades), [grades])

  if (!record) return null

  const kondisi = kondisiOf(nilai.score, record.statusUnit)
  const isIrr = record.tipe === 'Irrigator'
  const berubah =
    tanggal !== (record.tanggal || '') ||
    petugas !== (record.inspector || '') ||
    catatan !== (record.catatan || '') ||
    JSON.stringify(grades) !== JSON.stringify(record.komponen || {})

  const setGrade = (name, v) =>
    setGrades((g) => {
      const next = { ...g }
      if (next[name] === v) delete next[name]
      else next[name] = v
      return next
    })

  const simpan = () => {
    if (!petugas.trim()) return
    onSave?.({
      id: record.id,
      tipe: record.tipe,
      kode: record.kode,
      tanggal,
      inspector: petugas.trim(),
      catatan: catatan.trim(),
      statusUnit: record.statusUnit || '',
      wilayah: record.wilayah || '',
      unitJenis: record.unitJenis || '',
      spec: record.spec || '',
      komponen: grades,
    })
  }

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/35 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ubah inspeksi ${record.kode}`}
        className="relative flex max-h-[94vh] w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-slate-900/10 bg-white shadow-[0_40px_100px_-20px_rgba(0,0,0,0.95)] sm:max-w-3xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-900/[0.10] bg-gradient-to-r from-brand/[0.12] via-transparent to-transparent px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-brand/30 bg-brand/15 text-brand">
            {isIrr ? <IconDroplet size={17} /> : <IconTruck size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13.5px] font-bold leading-tight text-slate-900">Ubah inspeksi {record.kode}</h2>
            <p className="truncate text-[10.5px] text-slate-500">
              {record.tipe} · {record.wilayah || '—'} · sesi {record.tanggal}
            </p>
          </div>
          <ScoreRing score={nilai.score} size={40} stroke={4} />
          <button
            onClick={onClose}
            aria-label="Tutup form ubah"
            className="tap shrink-0 rounded-lg border border-slate-900/10 bg-slate-900/[0.04] text-slate-600 hover:text-slate-900"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {offline && (
            <p className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
              <IconAlert size={13} className="mt-0.5 shrink-0" />
              Endpoint Apps Script belum diatur — perubahan tidak bisa disimpan ke Google Sheets.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Petugas</label>
              <input value={petugas} onChange={(e) => setPetugas(e.target.value)} className="input" placeholder="Nama petugas" />
            </div>
            <div>
              <label className="label">Tanggal inspeksi</label>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="input" />
            </div>
          </div>
          <div className="mt-2">
            <label className="label">Catatan / temuan</label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              className="input resize-y"
              placeholder="Contoh: radiator bocor halus, perlu pressure test."
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="chip"><IconClipboard size={12} /> {nilai.total} komponen terisi</span>
            <span className="chip !border-emerald-500/30 !text-emerald-700">A {nilai.a}</span>
            <span className="chip !border-amber-500/30 !text-amber-700">B {nilai.b}</span>
            <span className="chip !border-rose-500/30 !text-rose-600">C {nilai.c}</span>
            <span className="chip">skor <span className="font-mono">{nilai.score}</span> · {kondisi}</span>
            <button
              className="btn-ghost ml-auto !py-1 !text-[11px]"
              onClick={() => setOnlyFilled((v) => !v)}
            >
              {onlyFilled ? 'Tampilkan semua' : 'Hanya yang terisi'}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {(groups || []).map((g) => {
              const items = g.items.filter((it) => (onlyFilled ? grades[it] : true))
              if (!items.length) return null
              return (
                <div key={g.id} className="rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] p-2.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{g.label}</p>
                  <div className="space-y-1">
                    {items.map((it) => (
                      <div key={it} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700" title={it}>{it}</span>
                        <div className="flex shrink-0 gap-1">
                          {GRADE_ORDER.map((v) => {
                            const aktif = grades[it] === v
                            return (
                              <button
                                key={v}
                                onClick={() => setGrade(it, v)}
                                aria-pressed={aktif}
                                aria-label={`${it} ${v}`}
                                className={cx(
                                  'h-8 w-8 rounded-lg border text-[11px] font-bold transition',
                                  aktif ? 'text-slate-900' : 'border-slate-900/10 bg-slate-900/[0.03] text-slate-600 hover:text-slate-900'
                                )}
                                style={aktif ? { background: GRADE_COLOR[v], borderColor: GRADE_COLOR[v] } : undefined}
                              >
                                {v}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {!daftar.length && (
              <p className="rounded-xl border border-slate-900/[0.10] bg-slate-900/[0.02] px-3 py-6 text-center text-[11.5px] text-slate-500">
                Daftar komponen tidak tersedia.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-900/[0.10] bg-white px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Bar value={nilai.score} color={nilai.score >= 90 ? '#22c55e' : nilai.score >= 70 ? '#f59e0b' : '#f43f5e'} height={5} />
              <span className="shrink-0 font-mono text-[11px] text-slate-700">{nilai.score}</span>
            </div>
          </div>
          <button className="btn-ghost !py-2 !text-[11.5px]" onClick={onClose}>Batal</button>
          <button
            className="btn-primary !py-2 !text-[11.5px]"
            disabled={saving || !berubah || !petugas.trim()}
            onClick={simpan}
          >
            {saving ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/60 border-t-ink-950" /> Menyimpan…</>
            ) : (
              <><IconCheck size={14} /> Simpan perubahan</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Dialog konfirmasi hapus. */
export function ConfirmDelete({ record, onClose, onConfirm, busy }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!record) return null
  return createPortal(
    <div
      className="no-print fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Hapus inspeksi ${record.kode}`}
        className="w-full max-w-sm rounded-2xl border border-slate-900/10 bg-white p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-600">
            <IconAlert size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-slate-900">Hapus sesi inspeksi {record.kode}?</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
              Baris <span className="font-mono text-slate-700">{record.tanggal}</span> oleh{' '}
              {record.inspector || 'tanpa nama'} akan dihapus dari sheet <span className="font-mono">Data Inspeksi</span>.
              Tindakan ini tidak bisa dibatalkan.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost !py-2 !text-[11.5px]" onClick={onClose}>Batal</button>
          <button className="btn-danger !py-2 !text-[11.5px]" disabled={busy} onClick={() => onConfirm?.(record)}>
            {busy ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

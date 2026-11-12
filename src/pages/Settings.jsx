import React, { useState } from 'react'
import { Card, CardHeader, Toast } from '../components/ui'
import { getEndpoint, setEndpoint, isConfigured, getAutoSyncMaster, setAutoSyncMaster, TARGET_SHEET, SOURCE_SHEET } from '../lib/config'
import { ping, pendingCount, backfillMaster, auditData, repairData, serviceRepair, syncMaster } from '../lib/api'
import { IconSheet, IconExternal, IconCheck, IconAlert, IconRefresh, IconCloud, IconShield, IconSpark, IconEngine, IconWrench, IconChevron } from '../components/icons'
import { TAHAP_SYNC } from '../lib/sync'
import { cx, relativeTime } from '../lib/analytics'

/**
 * HALAMAN PENGATURAN — disusun ulang agar tidak ramai.
 *
 * Prinsipnya cuma lima blok, berurutan sesuai yang dibutuhkan:
 *   1. Koneksi sheet       → satu kolom URL + uji koneksi (paling sering dipakai)
 *   2. Sinkronisasi        → 4 tahap sebagai baris ringkas, penjelasan dilipat
 *   3. Otomatisasi         → 3 sakelar (master, muat ulang, demo)
 *   4. Perawatan data      → audit, perbaikan, rumus service, inspeksi awal
 *   5. Referensi           → panduan deploy & skema tabel (dilipat, jarang dibuka)
 *
 * Yang dulu memenuhi layar (paragraf panjang per tahap, dua kartu spreadsheet
 * terpisah, rincian audit selalu terbuka) sekarang jadi baris ringkas atau
 * panel yang bisa dibuka sendiri.
 */

const STEPS = [
  { t: 'Buka spreadsheet tujuan', d: 'Buka "Update ZPAS637" lalu menu Extensions → Apps Script.' },
  { t: 'Tempel kode Code.gs', d: 'Salin seluruh isi file apps-script/Code.gs dari repo ke editor Apps Script, lalu simpan.' },
  { t: 'Deploy sebagai Web App', d: 'Deploy → New deployment → Web app. Execute as: Me, Who has access: Anyone. Salin URL /exec.' },
  { t: 'Tempel URL di sini', d: 'Simpan endpoint, lalu uji koneksi. Sheet "Data Inspeksi" akan dibuat/diperbarui otomatis.' },
]

/** Baris sakelar ringkas (checkbox besar yang bisa ditekan di HP). */
function Sakelar({ checked, onChange, judul, ket, accent = 'accent-teal-600' }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-900/[0.025]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className={cx('mt-0.5 h-5 w-5 shrink-0', accent)} />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-slate-800">{judul}</span>
        {ket && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{ket}</span>}
      </span>
    </label>
  )
}

/** Panel lipat: judul kecil + isi yang hanya muncul saat dibuka. */
function Lipat({ judul, ket, children }) {
  return (
    <details className="group rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.015]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[11.5px] font-semibold text-slate-700 marker:hidden">
        <IconChevron size={13} className="shrink-0 text-slate-400 transition group-open:rotate-90" />
        <span className="min-w-0">
          {judul}
          {ket && <span className="ml-1.5 font-normal text-slate-500">{ket}</span>}
        </span>
      </summary>
      <div className="border-t border-slate-900/[0.07] px-3 py-2.5">{children}</div>
    </details>
  )
}

const nf = new Intl.NumberFormat('id-ID')

export default function Settings({ onRepairAll, repairing = false, onSync, records, demo, onToggleDemo, syncLaporan = null, syncing = false, syncedAt = null }) {
  const [url, setUrl] = useState(getEndpoint())
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)
  const [status, setStatus] = useState(null)
  const [tglAwal, setTglAwal] = useState('2026-03-05')
  const [autoMaster, setAutoMaster] = useState(() => getAutoSyncMaster())
  const [busyAwal, setBusyAwal] = useState(false)
  const [audit, setAudit] = useState(null)
  const [busyAudit, setBusyAudit] = useState(false)
  const [busyMaster, setBusyMaster] = useState(false)
  const [busyRepair, setBusyRepair] = useState(false)
  const [busyService, setBusyService] = useState(false)

  const save = () => {
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(url.trim())) {
      setToast({ type: 'error', message: 'URL harus berakhiran /exec dari deployment Apps Script.' })
      return
    }
    setEndpoint(url)
    setToast({ type: 'success', message: url ? 'Endpoint disimpan.' : 'Endpoint dihapus. Aplikasi berjalan mode lokal.' })
    setStatus(null)
  }

  const test = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const r = await ping()
      const v = r.version || '1.0.0 (lama)'
      const perlu = String(r.version || '').localeCompare('1.8.2', undefined, { numeric: true }) < 0
      const peringatan = perlu ? ' · ⚠ deployment masih versi lama — tempel ulang Code.gs lalu Deploy ▸ New version.' : ''
      setStatus({ ok: true, message: `Terhubung · sheet "${r.sheet || 'Data Inspeksi'}" · ${r.records ?? 0} baris · versi ${v}${peringatan}` })
      setToast({ type: 'success', message: 'Koneksi ke Apps Script berhasil.' })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
      setToast({ type: 'error', message: 'Koneksi gagal. Periksa URL & akses deployment (Anyone).' })
    } finally {
      setTesting(false)
    }
  }

  const pending = pendingCount()

  /* ringkasan angka per tahap sinkron (kosong bila belum pernah sinkron) */
  const infoTahap = (id) => {
    const r = syncLaporan?.[id]
    if (!r) return ''
    if (id === 'kirim') {
      if (r.terkirim) return `${nf.format(r.terkirim)} terkirim${r.sisa ? ` · ${nf.format(r.sisa)} antre` : ''}`
      return r.sisa ? `${nf.format(r.sisa)} menunggu` : 'tidak ada antrean'
    }
    if (id === 'tulis' && r.dilewati) return 'manual saja'
    if (id === 'master') return r.ok ? `${nf.format(r.unit)} unit` : 'gagal'
    if (id === 'riwayat') return r.ok ? `${nf.format(r.jumlah)} baris` : 'gagal'
    if (id === 'service') return r.ok ? `${nf.format(r.log)} catatan` : 'gagal'
    return ''
  }

  const auditTotal = audit
    /* statusBeda bersifat informasi (master tetap acuan) → tidak dihitung sebagai temuan */
    ? ['ringkasan', 'skor', 'kondisi', 'komponenHilang', 'komponenAsing', 'idGanda', 'kodeAsing', 'tanggalRusak'].reduce((n, k) => n + (audit.hitung?.[k] || 0), 0) +
      (audit.master?.mesin || 0) + (audit.master?.irrigator || 0)
    : 0
  const auditBermasalah = auditTotal > 0

  const jalankanAudit = async () => {
    setBusyAudit(true)
    try {
      const r = await auditData()
      setAudit(r)
      setToast({ type: 'info', message: `Audit selesai: ${r.baris ?? 0} baris diperiksa.` })
    } catch (e) {
      setToast({ type: 'error', message: `Audit gagal: ${e.message}` })
    } finally {
      setBusyAudit(false)
    }
  }

  const jalankanRepair = async () => {
    if (!window.confirm('Perbaiki sheet? Nilai komponen yang kosong akan diisi dari master, lalu A/B/C/Total/Skor/Kondisi dihitung ulang dari komponen.\n\nTermasuk: rumus service tb_service2 diperbaiki dan baris ganda di tb_service2 dibuang.')) return
    setBusyRepair(true)
    try {
      /* jalur utama: Repair All (ringkasan + rumus service + dedupe log service)
         — sama dengan tombol di banner & panel Service */
      if (onRepairAll) {
        const hasil = await onRepairAll()
        if (hasil) {
          setAudit(await auditData())
          setToast({ type: 'success', message: `Perbaikan selesai: ${hasil.ringkas}` })
        }
        return
      }
      const r = await repairData()
      setToast({
        type: 'success',
        message: `Perbaikan selesai · ${r.komponenDiisi ?? 0} sel komponen diisi · ${r.inspeksi ?? 0} baris inspeksi · ${(r.mesin ?? 0) + (r.irrigator ?? 0)} baris master`,
      })
      setAudit(await auditData())
      await onSync?.()
    } catch (e) {
      setToast({ type: 'error', message: `Perbaikan gagal: ${e.message}` })
    } finally {
      setBusyRepair(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ---------------- 1. Koneksi ---------------- */}
      <Card>
        <CardHeader
          title="Koneksi Sheet"
          sub="Satu Web App Apps Script untuk membaca & menulis sheet"
          right={<span className={cx('chip shrink-0 whitespace-nowrap', isConfigured() ? '!border-emerald-600/30 !bg-emerald-50 !text-emerald-700' : '!border-amber-500/30 !bg-amber-50 !text-amber-700')}>
            {isConfigured() ? 'Terhubung' : 'Belum diatur'}
          </span>}
        />
        <div className="card-pad space-y-2.5 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              aria-label="Apps Script Web App URL"
              className="input font-mono !text-[11.5px]"
            />
            <div className="flex gap-2">
              <button className="btn-primary flex-1 whitespace-nowrap sm:flex-none" onClick={save}>Simpan</button>
              <button className="btn-ghost flex-1 whitespace-nowrap sm:flex-none" onClick={test} disabled={testing || !url}>
                <IconCloud size={14} /> {testing ? 'Menguji…' : 'Uji'}
              </button>
            </div>
          </div>

          {status && (
            <p className={cx('flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed', status.ok ? 'bg-emerald-500/[0.08] text-emerald-700' : 'bg-rose-500/[0.08] text-rose-700')}>
              {status.ok ? <IconCheck size={13} className="mt-0.5 shrink-0" /> : <IconAlert size={13} className="mt-0.5 shrink-0" />}
              <span>{status.message}</span>
            </p>
          )}

          {/* dua spreadsheet sebagai baris tautan, bukan dua kartu penuh */}
          <div className="grid gap-1 rounded-xl border border-slate-900/[0.07] bg-slate-900/[0.02] p-1 sm:grid-cols-2">
            {[
              { label: 'Tulis inspeksi', nama: 'Update ZPAS637', sheet: 'Data Inspeksi', href: TARGET_SHEET.url },
              { label: 'Master aset', nama: 'Draft Dashboard', sheet: 'Mesin · Irrigator', href: SOURCE_SHEET.url },
            ].map((s) => (
              <a
                key={s.nama}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-white"
              >
                <IconSheet size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500">{s.label}</span>
                  <span className="block truncate text-[11.5px] font-semibold text-slate-800">{s.nama}</span>
                  <span className="block truncate font-mono text-[10px] text-slate-500">{s.sheet}</span>
                </span>
                <IconExternal size={12} className="shrink-0 text-slate-400" />
              </a>
            ))}
          </div>

          <Lipat judul="Cara memasang endpoint">
            <ol className="space-y-1.5">
              {STEPS.map((s, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-600">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded bg-brand/15 font-mono text-[9.5px] font-bold text-brand">{i + 1}</span>
                  <span><span className="font-semibold text-slate-800">{s.t}</span> — {s.d}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-teal-700">
              <IconShield size={12} className="mt-0.5 shrink-0" />
              Web App berjalan atas nama Anda dan hanya menulis ke sheet tujuan. Tidak ada API key di browser. Endpoint
              tersimpan per perangkat; default semua perangkat diisi lewat <code className="rounded bg-slate-900/[0.05] px-1 font-mono text-[10px]">VITE_APPS_SCRIPT_URL</code>.
            </p>
          </Lipat>
        </div>
      </Card>

      {/* ---------------- 2. Sinkronisasi ---------------- */}
      <Card>
        <CardHeader
          title="Sinkronisasi"
          sub={`Satu tombol Sinkron di header menjalankan ${TAHAP_SYNC.length} tahap sekaligus`}
          icon={<IconRefresh size={15} />}
          right={
            <span className={cx('chip shrink-0 whitespace-nowrap', syncing ? '!border-teal-600/30 !bg-teal-50 !text-teal-700' : syncedAt ? '!border-emerald-600/30 !bg-emerald-50 !text-emerald-700' : '!border-amber-500/30 !bg-amber-50 !text-amber-700')}>
              {syncing ? 'Berjalan…' : syncedAt ? `Tersinkron ${relativeTime(syncedAt)}` : 'Belum tersinkron'}
            </span>
          }
        />
        <div className="card-pad space-y-1 pt-2">
          {TAHAP_SYNC.map((t) => {
            const r = syncLaporan?.[t.id]
            /* `dilewati` = tahap ini memang tidak dijalankan (tarikan otomatis
               tidak menulis master). Itu bukan kegagalan → jangan diberi merah. */
            const dilewati = !!r?.dilewati
            const gagal = r && !r.ok && !dilewati
            return (
              <div key={t.id} className="rounded-lg px-2 py-1.5 transition hover:bg-slate-900/[0.02]">
                <div className="flex items-center gap-2">
                  <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md', gagal ? 'bg-rose-500/15 text-rose-600' : dilewati ? 'bg-slate-900/[0.05] text-slate-400' : r ? 'bg-emerald-500/15 text-emerald-700' : 'bg-slate-900/[0.05] text-slate-400')}>
                    {gagal ? <IconAlert size={11} /> : r && !dilewati ? <IconCheck size={11} /> : <IconRefresh size={11} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-800">{t.judul}</span>
                  {/* arah & angka disembunyikan di HP: nama tahap lebih penting daripada
                      kolom sempit yang membuat judul terpotong */}
                  <span className="hidden shrink-0 font-mono text-[9.5px] text-slate-400 sm:inline">{t.arah}</span>
                  <span className={cx('shrink-0 whitespace-nowrap text-right font-mono text-[10px] sm:w-[104px]', gagal ? 'text-rose-600' : dilewati ? 'text-slate-400' : r ? 'text-emerald-700/90' : 'text-slate-400')}>
                    {infoTahap(t.id) || '—'}
                  </span>
                </div>
                {gagal && r.error && (
                  <p className="mt-1 rounded bg-rose-500/10 px-2 py-1 font-mono text-[10px] leading-relaxed text-rose-600">{r.error}</p>
                )}
              </div>
            )
          })}

          {pending > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/[0.09] px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
              <IconAlert size={12} className="mt-0.5 shrink-0" />
              {nf.format(pending)} inspeksi tersimpan di perangkat ini dan dikirim pada Sinkron berikutnya.
            </p>
          )}
          {!isConfigured() && (
            <p className="flex items-start gap-1.5 rounded-lg bg-teal-600/[0.07] px-2.5 py-2 text-[11px] leading-relaxed text-teal-700">
              <IconWrench size={12} className="mt-0.5 shrink-0" />
              Isi endpoint di kartu atas agar Sinkron bisa bekerja. Tanpa endpoint, aplikasi memakai data lokal.
            </p>
          )}

          <Lipat judul="Apa yang dikerjakan tiap tahap?">
            <ul className="space-y-1.5">
              {TAHAP_SYNC.map((t) => (
                <li key={t.id} className="text-[11px] leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">{t.judul}</span>
                  <span className="ml-1 font-mono text-[9.5px] text-slate-400">({t.arah})</span>
                  <span className="block">{t.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
              Tidak ada tombol tarik/kirim terpisah di halaman lain. Tombol Sinkron juga menulis ringkasan master; tarikan
              saat halaman dimuat hanya membaca (tidak mengubah sheet).
            </p>
          </Lipat>
        </div>
      </Card>

      {/* ---------------- 3. Otomatisasi ---------------- */}
      <Card>
        <CardHeader title="Otomatisasi & Tampilan" sub="Perilaku aplikasi di perangkat ini" icon={<IconSpark size={15} />} right={<span className="chip">{demo ? 'demo aktif' : 'data asli'}</span>} />
        <div className="card-pad space-y-0.5 pt-2">
          <Sakelar
            checked={autoMaster}
            onChange={(v) => { setAutoMaster(v); setAutoSyncMaster(v) }}
            judul="Tulis ringkasan master setiap selesai inspeksi"
            ket="Nilai A/B/C masuk ke kolom komponen sheet Mesin & Irrigator, plus tanggal, skor, kondisi, dan temuan."
          />
          {/* v1.9.22: penarikan berkala dihapus. Data hanya ditarik saat halaman
             dimuat/di-reload dan saat tombol Sinkron ditekan. */}
          <div className="flex items-start gap-2 rounded-xl border border-slate-900/[0.09] bg-slate-900/[0.02] px-3 py-2.5">
            <IconCloud size={14} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-[11px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">Tidak ada penarikan otomatis.</span> Data sheet ditarik saat halaman
              dibuka/di-reload, dan saat tombol <span className="font-semibold text-slate-800">Sinkron</span> di header ditekan.
            </p>
          </div>
          <Sakelar
            accent="accent-amber-500"
            checked={demo}
            onChange={(v) => {
              onToggleDemo(v)
              setToast({ type: 'info', message: v ? 'Mode demo diaktifkan — grafik terisi data contoh.' : 'Mode demo dimatikan.' })
            }}
            judul="Mode demo"
            ket="Data contoh (±90 sesi, 10 minggu) hanya di perangkat ini dan tidak pernah dikirim ke sheet."
          />
        </div>
      </Card>

      {/* ---------------- 4. Perawatan data ---------------- */}
      <Card>
        <CardHeader
          title="Perawatan Data Sheet"
          sub="Perbaiki selisih nilai di spreadsheet, bukan di tampilan"
          icon={<IconShield size={15} />}
          right={
            audit ? (
              <span className={cx('chip shrink-0 whitespace-nowrap', auditBermasalah ? '!border-amber-500/30 !text-amber-700' : '!border-emerald-500/30 !text-emerald-700')}>
                {auditBermasalah ? `${auditTotal} temuan` : 'Bersih'}
              </span>
            ) : null
          }
        />
        <div className="card-pad space-y-3 pt-3">
          {/* a. kualitas data */}
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-slate-800">Kualitas Data Sheet</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !py-1.5 !text-[11.5px] max-sm:!min-h-11" disabled={busyAudit || !isConfigured()} onClick={jalankanAudit}>
                <IconRefresh size={13} /> {busyAudit ? 'Mengaudit…' : 'Audit data sheet'}
              </button>
              <button
                className="btn-ghost !py-1.5 !text-[11.5px] max-sm:!min-h-11"
                disabled={busyMaster || !isConfigured()}
                title="Menulis ulang ringkasan (A/B/C/Skor/Kondisi) ke sheet Mesin & Irrigator dan memasang warna kolom KONDISI"
                onClick={async () => {
                  setBusyMaster(true)
                  try {
                    const hasil = await syncMaster()
                    setToast({ type: 'success', message: `Ringkasan & warna master diperbarui · ${(hasil || []).join(' · ') || 'selesai'}` })
                    await onSync?.()
                  } catch (e) {
                    setToast({ type: 'error', message: `Gagal menulis ringkasan ke sheet master: ${e.message}` })
                  } finally {
                    setBusyMaster(false)
                  }
                }}
              >
                <IconSheet size={13} /> {busyMaster ? 'Menulis…' : 'Ringkasan & warna master'}
              </button>
              <button className="btn-primary !py-1.5 !text-[11.5px] max-sm:!min-h-11" disabled={busyRepair || repairing || !isConfigured()} onClick={jalankanRepair}>
                <IconCheck size={13} /> {busyRepair || repairing ? 'Memperbaiki…' : 'Perbaiki otomatis'}
              </button>
            </div>

            {audit && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {[
                    ['Baris diperiksa', audit.baris ?? 0, false],
                    ['Ringkasan salah', audit.hitung?.ringkasan ?? 0, false],
                    ['Skor salah', audit.hitung?.skor ?? 0, false],
                    ['Kondisi salah', audit.hitung?.kondisi ?? 0, false],
                    ['Komponen kosong', audit.hitung?.komponenHilang ?? 0, false],
                    ['Kode asing', audit.hitung?.kodeAsing ?? 0, false],
                    ['ID ganda', audit.hitung?.idGanda ?? 0, false],
                    ['Master Mesin', audit.master?.mesin ?? 0, false],
                    ['Master Irrigator', audit.master?.irrigator ?? 0, false],
                    ['Beda status *', audit.hitung?.statusBeda ?? 0, true],
                  ].map(([label, val, info]) => (
                    <div key={label} className="rounded-lg bg-slate-900/[0.03] px-2 py-1.5">
                      <p className="truncate text-[9px] uppercase tracking-wide text-slate-500">{label}</p>
                      <p className={cx('font-mono text-[13px] font-bold', val ? (info ? 'text-teal-700' : 'text-amber-700') : 'text-emerald-700')}>{val}</p>
                    </div>
                  ))}
                </div>

                {(audit.statusBeda?.length > 0 || audit.contoh?.length > 0) && (
                  <Lipat judul="Rincian temuan" ket={`${audit.contoh?.length || 0} contoh · ${audit.statusBeda?.length || 0} beda status`}>
                    {audit.statusBeda?.length > 0 && (
                      <div className="mb-2">
                        <p className="mb-1 text-[10px] uppercase tracking-wider text-teal-700/80">Status berbeda vs master — tentukan yang benar di sheet</p>
                        <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[10.5px] text-teal-700/80">
                          {audit.statusBeda.map((s) => (
                            <li key={`${s.tipe}-${s.kode}`} className="font-mono">
                              {s.kode} <span className="text-slate-500">({s.tipe})</span> · inspeksi “{s.sheet}” ≠ master “{s.master || '-'}”
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {audit.contoh?.length > 0 && (
                      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-900/[0.08]">
                        <table className="w-full text-left text-[11px]">
                          <thead className="sticky top-0 bg-teal-50/95 text-[10px] uppercase tracking-wider text-teal-800 backdrop-blur">
                            <tr><th className="px-2.5 py-1.5">Baris</th><th className="px-2.5 py-1.5">Unit</th><th className="px-2.5 py-1.5">Temuan</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/[0.06] text-slate-600">
                            {audit.contoh.slice(0, 40).map((c, i) => (
                              <tr key={i}>
                                <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-500">{c.baris}</td>
                                <td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-700">{c.kode}</td>
                                <td className="px-2.5 py-1.5">{c.pesan}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Lipat>
                )}
                <p className="text-[10px] leading-relaxed text-slate-500">
                  * Beda status hanya informasi: dashboard selalu memakai status master, riwayat inspeksi tidak ditulis ulang.
                </p>
              </div>
            )}
          </div>

          <hr className="border-slate-900/[0.07]" />

          {/* b. rumus service */}
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-slate-800">Rumus Service (tb_service2)</p>
            <p className="text-[10.5px] leading-relaxed text-slate-500">
              Kolom D–F di sheet “Monitor Kasie FS” memakai pemisah argumen <span className="font-mono">;</span> (lokal Indonesia).
              Bila tertulis <span className="font-mono">,</span> selnya <span className="font-semibold text-rose-600">#ERROR!</span> — tombol ini
              menulis ulang rumus (atau nilainya bila rumus ditolak sheet) untuk semua baris rusak.
            </p>
            <button
              className="btn-ghost !py-1.5 !text-[11.5px] max-sm:!min-h-11"
              disabled={busyService || !isConfigured()}
              onClick={async () => {
                setBusyService(true)
                try {
                  const r = await serviceRepair()
                  setToast({
                    type: r.gagal ? 'error' : 'success',
                    message: r.diperbaiki
                      ? `${r.diperbaiki} baris diperbaiki · ${r.diperiksa} baris diperiksa · pemisah rumus “${r.pemisah}”`
                      : `Tidak ada baris rusak · ${r.diperiksa ?? 0} baris diperiksa · pemisah rumus “${r.pemisah}”`,
                  })
                } catch (e) {
                  setToast({ type: 'error', message: `Gagal memperbaiki rumus: ${e.message}` })
                } finally {
                  setBusyService(false)
                }
              }}
            >
              <IconEngine size={13} /> {busyService ? 'Memeriksa…' : 'Perbaiki rumus service'}
            </button>
          </div>

          <hr className="border-slate-900/[0.07]" />

          {/* c. inspeksi awal */}
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-slate-800">Inspeksi Awal dari Master</p>
            <p className="text-[10.5px] leading-relaxed text-slate-500">
              Menyalin kondisi seluruh unit master (±274 baris) sebagai inspeksi awal. Aman diulang — baris yang sudah ada tidak
              diduplikasi. Unit <span className="font-semibold text-rose-600">Rusak</span> otomatis <span className="font-semibold text-rose-600">Kritis</span>.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-[150px]">
                <label className="label">Tanggal awal</label>
                <input type="date" value={tglAwal} onChange={(e) => setTglAwal(e.target.value)} className="input !py-1.5 !text-[11.5px]" />
              </div>
              <button
                className="btn-ghost !py-1.5 !text-[11.5px] max-sm:!min-h-11"
                disabled={busyAwal || !isConfigured()}
                onClick={async () => {
                  setBusyAwal(true)
                  try {
                    const r = await backfillMaster(tglAwal)
                    setToast({
                      type: 'success',
                      message: `${r.inserted ?? 0} baris inspeksi awal dimasukkan (${r.tanggal || tglAwal})` + (r.skipped ? ` · ${r.skipped} dilewati` : ''),
                    })
                    onSync?.()
                  } catch (e) {
                    setToast({ type: 'error', message: `Gagal: ${e.message}` })
                  } finally {
                    setBusyAwal(false)
                  }
                }}
              >
                <IconSpark size={13} /> {busyAwal ? 'Mengisi…' : 'Isi inspeksi awal'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------- 5. Referensi ---------------- */}
      <Card>
        <CardHeader title="Referensi" sub="Dibuka bila perlu saja" />
        <div className="card-pad space-y-2 pt-2">
          <Lipat judul="Skema tabel “Data Inspeksi”" ket="dibuat otomatis oleh Apps Script">
            <div className="overflow-x-auto rounded-lg border border-slate-900/[0.08]">
              <table className="w-full min-w-[440px] text-left text-[11px]">
                <thead className="bg-slate-900/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                  <tr><th className="px-2.5 py-1.5">Kolom</th><th className="px-2.5 py-1.5">Isi</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-900/[0.06] text-slate-600">
                  {[
                    ['ID Inspeksi', 'FSI-xxxxx (unik per sesi)'],
                    ['Tanggal / Timestamp', 'Tanggal inspeksi & waktu kirim'],
                    ['Tipe Aset', 'Mesin atau Irrigator'],
                    ['Kode Unit', 'Contoh SPC0095 / ITI0083'],
                    ['Wilayah · Jenis · Status', 'PG2/FM4/OP2 · SPC/DEC/BTI · Terpasang/Standby/Rusak'],
                    ['Petugas', 'Nama petugas inspeksi'],
                    ['A / B / C / Total / Skor / Kondisi', 'Rekap penilaian satu sesi'],
                    ['<Komponen>', 'Satu kolom per komponen (46 mesin, 29 irrigator) berisi A/B/C'],
                    ['Catatan', 'Temuan & rekomendasi'],
                  ].map(([k, v]) => (
                    <tr key={k}><td className="px-2.5 py-1.5 font-mono text-[10.5px] text-slate-700">{k}</td><td className="px-2.5 py-1.5">{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Lipat>

          <Lipat judul="Catatan teknis" ket="untuk yang mengelola repo">
            <ul className="space-y-1 text-[10.5px] leading-relaxed text-slate-600">
              <li>· Versi kode backend ada di <code className="font-mono">apps-script/Code.gs</code> (<code className="font-mono">SCRIPT_VERSION</code>); setelah mengubahnya, jalankan <span className="font-semibold">Deploy ▸ Manage deployments ▸ New version</span>.</li>
              <li>· Halaman ini hanya mengatur perangkat ini; endpoint build diatur lewat <code className="font-mono">VITE_APPS_SCRIPT_URL</code>.</li>
              <li>· Total inspeksi tersimpan di perangkat: {nf.format((records || []).length)} sesi{pending ? ` · ${nf.format(pending)} menunggu dikirim` : ''}.</li>
            </ul>
          </Lipat>
        </div>
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

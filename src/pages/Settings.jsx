import React, { useState } from 'react'
import { Card, CardHeader, Toast } from '../components/ui'
import { getEndpoint, setEndpoint, isConfigured, getAutoSyncMaster, setAutoSyncMaster, getAutoRefresh, setAutoRefresh, REFRESH_MS, TARGET_SHEET, SOURCE_SHEET } from '../lib/config'
import { ping, flushQueue, pendingCount, fetchHistory, syncMaster, backfillMaster, auditData, repairData, serviceRepair } from '../lib/api'
import { IconSheet, IconExternal, IconCheck, IconAlert, IconRefresh, IconCloud, IconShield, IconSpark, IconEngine } from '../components/icons'
import { cx } from '../lib/analytics'

const STEPS = [
  { t: 'Buka spreadsheet tujuan', d: `Buka "Update ZPAS637" lalu menu Extensions → Apps Script.` },
  { t: 'Tempel kode Code.gs', d: 'Salin seluruh isi file apps-script/Code.gs dari repo ke editor Apps Script, lalu simpan.' },
  { t: 'Deploy sebagai Web App', d: 'Deploy → New deployment → Web app. Execute as: Me, Who has access: Anyone. Salin URL /exec.' },
  { t: 'Tempel URL di sini', d: 'Simpan endpoint, lalu uji koneksi. Sheet "Data Inspeksi" akan dibuat/diperbarui otomatis.' },
]

export default function Settings({ onSync, records, demo, onToggleDemo }) {
  const [url, setUrl] = useState(getEndpoint())
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)
  const [status, setStatus] = useState(null)
  const [tglAwal, setTglAwal] = useState('2026-03-05')
  const [autoMaster, setAutoMaster] = useState(() => getAutoSyncMaster())
  const [autoRefresh, setAutoRefreshState] = useState(() => getAutoRefresh())
  const [busyAwal, setBusyAwal] = useState(false)
  const [audit, setAudit] = useState(null)
  const [busyAudit, setBusyAudit] = useState(false)
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
      const peringatan = String(r.version || '').localeCompare('1.4.0', undefined, { numeric: true }) < 0
        ? ' · ⚠ deployment masih versi lama (min. 1.4.0) — sinkron belum idempoten & selalu mengunduh data penuh'
        : ''
      setStatus({ ok: true, message: `Terhubung · sheet "${r.sheet || 'Data Inspeksi'}" · ${r.records ?? 0} baris · versi ${v}${peringatan}` })
      setToast({ type: 'success', message: 'Koneksi ke Apps Script berhasil.' })
    } catch (e) {
      setStatus({ ok: false, message: e.message })
      setToast({ type: 'error', message: 'Koneksi gagal. Periksa URL & akses deployment (Anyone).' })
    } finally {
      setTesting(false)
    }
  }

  const pushQueue = async () => {
    try {
      const r = await flushQueue()
      setToast({
        type: r.failed ? 'error' : 'success',
        message: r.sent ? `${r.sent} inspeksi lokal terkirim ke sheet.` : r.failed ? 'Gagal mengirim antrean.' : 'Tidak ada antrean.',
      })
      onSync?.()
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }

  const pending = pendingCount()
  const auditTotal = audit
    ? ['ringkasan', 'skor', 'kondisi', 'komponenHilang', 'komponenAsing', 'idGanda', 'kodeAsing', 'tanggalRusak'].reduce((n, k) => n + (audit.hitung?.[k] || 0), 0) +
      (audit.master?.mesin || 0) + (audit.master?.irrigator || 0)
    : 0
  const auditBermasalah = auditTotal > 0

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader
          title="Koneksi Google Sheets"
          sub="Dashboard menulis ke sheet “Data Inspeksi” lewat Google Apps Script Web App"
          right={<span className={cx('chip', isConfigured() ? '!border-emerald-500/30 !text-emerald-300' : '!border-amber-500/30 !text-amber-300')}>
            {isConfigured() ? 'Terhubung' : 'Belum diatur'}
          </span>}
        />
        <div className="card-pad space-y-3 pt-3">
          <div>
            <label className="label">Apps Script Web App URL (/exec)</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="input font-mono !text-[11.5px]"
              />
              <button className="btn-primary whitespace-nowrap" onClick={save}>Simpan</button>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-500">
              Endpoint disimpan di browser ini (localStorage). Untuk default di semua perangkat, isi variabel{' '}
              <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-slate-300">VITE_APPS_SCRIPT_URL</code> pada file <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-slate-300">.env</code> sebelum build.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={test} disabled={testing || !url}>
              <IconCloud size={14} /> {testing ? 'Menguji…' : 'Uji Koneksi'}
            </button>
            <button className="btn-ghost" onClick={() => fetchHistory().then(() => onSync?.()).catch((e) => setToast({ type: 'error', message: e.message }))}>
              <IconRefresh size={14} /> Tarik riwayat
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                try {
                  const r = await syncMaster()
                  setToast({ type: 'success', message: `Sheet master diperbarui: ${r.join(' · ')}` })
                } catch (e) {
                  setToast({ type: 'error', message: `Gagal sinkron master: ${e.message}` })
                }
              }}
            >
              <IconSheet size={14} /> Sinkron ke sheet Mesin &amp; Irrigator
            </button>
            {pending > 0 && (
              <button className="btn-ghost !border-amber-500/30 !text-amber-300" onClick={pushQueue}>
                Kirim {pending} antrean lokal
              </button>
            )}
          </div>
          {status && (
            <div className={cx('whitespace-pre-line rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed', status.ok ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-200' : 'border-rose-500/30 bg-rose-500/[0.08] text-rose-200')}>
              <span className="flex items-center gap-1.5">{status.ok ? <IconCheck size={13} /> : <IconAlert size={13} />} {status.message}</span>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Spreadsheet Tujuan" sub="Tempat hasil inspeksi disimpan" icon={<IconSheet size={15} />} />
          <div className="card-pad pt-2">
            <p className="text-[12px] font-semibold text-slate-200">Update ZPAS637</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Sheet: <span className="font-mono text-slate-400">Data Inspeksi</span> (tabel Mesin &amp; Irrigator)</p>
            <a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost mt-3 !py-1.5 !text-[11.5px] max-sm:!min-h-11">
              Buka spreadsheet <IconExternal size={12} />
            </a>
          </div>
        </Card>
        <Card>
          <CardHeader title="Spreadsheet Sumber" sub="Master aset mesin & irrigator" icon={<IconSheet size={15} />} />
          <div className="card-pad pt-2">
            <p className="text-[12px] font-semibold text-slate-200">Draft Dashboard</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Sheet: <span className="font-mono text-slate-400">Mesin</span> (tb_mesin) &amp; <span className="font-mono text-slate-400">Irrigator</span> (tb_irrigator)</p>
            <a href={SOURCE_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost mt-3 !py-1.5 !text-[11.5px] max-sm:!min-h-11">
              Buka spreadsheet <IconExternal size={12} />
            </a>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Inspeksi Awal dari Master"
          sub="Isi sheet “Data Inspeksi” dengan kondisi tb_mesin & tb_irrigator saat ini"
          icon={<IconSpark size={15} />}
          right={<span className="chip">{'idempoten'}</span>}
        />
        <div className="card-pad space-y-3 pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[170px]">
              <label className="label">Tanggal inspeksi awal</label>
              <input type="date" value={tglAwal} onChange={(e) => setTglAwal(e.target.value)} className="input" />
            </div>
            <button
              className="btn-primary"
              disabled={busyAwal || !isConfigured()}
              onClick={async () => {
                setBusyAwal(true)
                try {
                  const r = await backfillMaster(tglAwal)
                  setToast({
                    type: 'success',
                    message: `${r.inserted ?? 0} baris inspeksi awal dimasukkan (${r.tanggal || tglAwal})` +
                      (r.skipped ? ` · ${r.skipped} baris dilewati (sudah ada)` : ''),
                  })
                  onSync?.()
                } catch (e) {
                  setToast({ type: 'error', message: `Gagal: ${e.message}` })
                } finally {
                  setBusyAwal(false)
                }
              }}
            >
              {busyAwal ? 'Mengisi…' : 'Isi inspeksi awal'}
            </button>
            <button
              className="btn-ghost"
              disabled={!isConfigured()}
              onClick={async () => {
                try {
                  const r = await syncMaster()
                  setToast({ type: 'success', message: `Sheet master diperbarui: ${r.join(' · ')}` })
                } catch (e) {
                  setToast({ type: 'error', message: `Gagal: ${e.message}` })
                }
              }}
            >
              Sinkron ke Mesin &amp; Irrigator
            </button>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <input
              type="checkbox"
              checked={autoMaster}
              onChange={(e) => { setAutoMaster(e.target.checked); setAutoSyncMaster(e.target.checked) }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-sky-400"
            />
            <span className="text-[11.5px] leading-relaxed text-slate-300">
              <span className="font-semibold text-slate-100">Sinkron otomatis ke sheet Mesin &amp; Irrigator</span>
              <span className="block text-slate-500">
                Setiap selesai kirim inspeksi, sheet master diperbarui: nilai <span className="font-mono text-[10.5px]">A/B/C</span> ditulis ke
                kolom komponen (Accu, Klem Accu, Radiator, …) <em>dan</em> kolom ringkasan di kanan (tanggal, skor, kondisi, temuan).
                Matikan bila ingin sinkron manual saja.
              </span>
            </span>
          </label>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Menyalin kondisi seluruh unit master (±274 baris) sebagai inspeksi awal. Aman dijalankan berulang —
            baris yang sudah ada tidak diduplikasi. Unit berstatus <span className="font-semibold text-rose-300">Rusak</span>{' '}
            otomatis dinilai <span className="font-semibold text-rose-300">Kritis</span>.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Kualitas Data Sheet"
          sub="Cari & perbaiki selisih antara nilai komponen dan ringkasan A/B/C/Skor/Kondisi"
          icon={<IconShield size={15} />}
          right={
            audit ? (
              <span className={cx('chip', auditBermasalah ? '!border-amber-500/30 !text-amber-300' : '!border-emerald-500/30 !text-emerald-300')}>
                {auditBermasalah ? `${auditTotal} temuan` : 'Bersih'}
              </span>
            ) : null
          }
        />
        <div className="card-pad space-y-3 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost"
              disabled={busyAudit || !isConfigured()}
              onClick={async () => {
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
              }}
            >
              <IconRefresh size={14} /> {busyAudit ? 'Mengaudit…' : 'Audit data sheet'}
            </button>
            <button
              className="btn-primary"
              disabled={busyRepair || !isConfigured()}
              onClick={async () => {
                if (!window.confirm('Perbaiki sheet? Nilai komponen yang kosong akan diisi dari master, lalu A/B/C/Total/Skor/Kondisi dihitung ulang dari komponen.')) return
                setBusyRepair(true)
                try {
                  const r = await repairData()
                  setToast({
                    type: 'success',
                    message: `Perbaikan selesai · ${r.komponenDiisi ?? 0} sel komponen diisi · ${r.inspeksi ?? 0} baris inspeksi · ${(r.mesin ?? 0) + (r.irrigator ?? 0)} baris master`,
                  })
                  const ulang = await auditData()
                  setAudit(ulang)
                  onSync?.()
                } catch (e) {
                  setToast({ type: 'error', message: `Perbaikan gagal: ${e.message}` })
                } finally {
                  setBusyRepair(false)
                }
              }}
            >
              <IconCheck size={14} /> {busyRepair ? 'Memperbaiki…' : 'Perbaiki otomatis'}
            </button>
          </div>

          {audit && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ['Baris diperiksa', audit.baris ?? 0],
                  ['Ringkasan salah', audit.hitung?.ringkasan ?? 0],
                  ['Skor salah', audit.hitung?.skor ?? 0],
                  ['Kondisi salah', audit.hitung?.kondisi ?? 0],
                  ['Komponen kosong', audit.hitung?.komponenHilang ?? 0],
                  ['Kode asing', audit.hitung?.kodeAsing ?? 0],
                  ['ID ganda', audit.hitung?.idGanda ?? 0],
                  ['Master Mesin', audit.master?.mesin ?? 0],
                  ['Master Irrigator', audit.master?.irrigator ?? 0],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
                    <p className={cx('mt-0.5 font-mono text-[15px] font-bold', val ? 'text-amber-300' : 'text-emerald-300')}>{val}</p>
                  </div>
                ))}
              </div>
              {audit.contoh?.length > 0 && (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-[#0d1420] text-[10px] uppercase tracking-wider text-slate-500">
                      <tr><th className="px-3 py-1.5">Baris</th><th className="px-3 py-1.5">Unit</th><th className="px-3 py-1.5">Temuan</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04] text-slate-400">
                      {audit.contoh.slice(0, 40).map((c, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono text-[10.5px] text-slate-500">{c.baris}</td>
                          <td className="px-3 py-1.5 font-mono text-[10.5px] text-slate-300">{c.kode}</td>
                          <td className="px-3 py-1.5">{c.pesan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-slate-500">
            Audit membandingkan <span className="font-semibold text-slate-300">sel komponen</span> dengan kolom ringkasan
            (A/B/C/Total/Skor/Kondisi) di sheet “Data Inspeksi”, sheet <span className="font-mono text-[10.5px]">Mesin</span>, dan
            sheet <span className="font-mono text-[10.5px]">Irrigator</span>. Perbaikan mengisi komponen kosong dari master
            lebih dulu, baru menghitung ulang ringkasan — jadi nilai komponen tidak pernah ditimpa.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Rumus Service (tb_service2)"
          sub="Perbaiki kolom Month / Bulan Service / Minggu Service yang error di sheet “Monitor Kasie FS”"
          icon={<IconEngine size={15} />}
          right={<span className="chip">{'idempoten'}</span>}
        />
        <div className="card-pad space-y-3 pt-3">
          <p className="text-[11.5px] leading-relaxed text-slate-400">
            Kolom <span className="font-mono text-[10.5px] text-slate-300">D–F</span> diisi rumus saat service dicatat dari web.
            Spreadsheet berlokal Indonesia memakai <span className="font-semibold text-slate-200">koma sebagai desimal</span>,
            jadi pemisah argumen rumus harus <span className="font-mono text-[10.5px] text-slate-300">;</span> —
            kalau ditulis dengan <span className="font-mono text-[10.5px] text-slate-300">,</span> sel jadi
            <span className="font-semibold text-rose-300"> #ERROR!</span>. Tombol di bawah menulis ulang rumus
            (atau nilai jadi bila rumus tetap ditolak sheet) untuk semua baris yang rusak.
          </p>
          <button
            className="btn-ghost"
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
            <IconCheck size={14} /> {busyService ? 'Memeriksa…' : 'Perbaiki rumus service'}
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Sinkronisasi Otomatis" sub="Kapan data ditarik dan ditulis" icon={<IconRefresh size={15} />} />
        <div className="card-pad space-y-2.5 pt-3">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => { setAutoRefreshState(e.target.checked); setAutoRefresh(e.target.checked) }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-sky-400"
            />
            <span className="text-[11.5px] leading-relaxed text-slate-300">
              <span className="font-semibold text-slate-100">Muat ulang data terbaru dari sheet</span>
              <span className="block text-slate-500">
                Dashboard menarik ulang isi sheet “Data Inspeksi” setiap {Math.round(REFRESH_MS / 60000)} menit dan
                setiap kali tab kembali aktif — jadi hasil inspeksi petugas lain langsung terlihat tanpa klik Sinkron.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Panduan Deploy Apps Script" sub="Sekali setup, ± 3 menit" icon={<IconSpark size={15} />} />
        <div className="card-pad space-y-2.5 pt-3">
          {STEPS.map((s, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand/15 font-mono text-[11px] font-bold text-brand">{i + 1}</span>
              <div>
                <p className="text-[12px] font-semibold text-slate-200">{s.t}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{s.d}</p>
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-sky-200">
            <span className="flex items-center gap-1.5 font-semibold"><IconShield size={13} /> Keamanan</span>
            Web App dijalankan atas nama Anda dan hanya menulis ke sheet “Data Inspeksi”. Tidak ada API key yang disimpan di browser.
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Skema Tabel “Data Inspeksi”" sub="Dibuat otomatis oleh Apps Script saat inspeksi pertama masuk" />
        <div className="card-pad pt-3">
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-2">Kolom</th><th className="px-3 py-2">Isi</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-400">
                {[
                  ['ID Inspeksi', 'FSI-xxxxx (unik per sesi)'],
                  ['Tanggal / Timestamp', 'Tanggal inspeksi & waktu kirim'],
                  ['Tipe Aset', 'Mesin atau Irrigator'],
                  ['Kode Unit', 'Contoh SPC0095 / ITI0083'],
                  ['Wilayah · Jenis · Status', 'PG2/FM4/OP2 · SPC/DEC/BTI · Terpasang/Standby/Rusak'],
                  ['Petugas', 'Nama petugas inspeksi'],
                  ['A / B / C / Total / Skor / Kondisi', 'Rekap penilaian satu sesi'],
                  ['<Komponen>', 'Satu kolom per komponen (44 untuk mesin, 30 untuk irrigator) berisi A/B/C'],
                  ['Catatan', 'Temuan & rekomendasi'],
                ].map(([k, v]) => (
                  <tr key={k}><td className="px-3 py-1.5 font-mono text-[10.5px] text-slate-300">{k}</td><td className="px-3 py-1.5">{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Mode Demo"
          sub="Tampilkan data inspeksi contoh untuk melihat grafik & tren"
          right={<span className={cx('chip', demo ? '!border-amber-500/30 !text-amber-300' : '')}>{demo ? 'Aktif' : 'Nonaktif'}</span>}
        />
        <div className="card-pad flex flex-wrap items-center gap-3 pt-3">
          <p className="flex-1 text-[11.5px] leading-relaxed text-slate-400">
            Data demo dibuat lokal (±90 sesi, 10 minggu, 6 petugas) dan <span className="font-semibold text-slate-200">tidak pernah dikirim</span> ke Google Sheets.
            Matikan mode demo sebelum memakai data produksi.
          </p>
          <button
            className={demo ? 'btn-danger' : 'btn-ghost'}
            onClick={() => {
              onToggleDemo(!demo)
              setToast({ type: 'info', message: demo ? 'Mode demo dimatikan.' : 'Mode demo diaktifkan — grafik terisi data contoh.' })
            }}
          >
            {demo ? 'Matikan demo' : 'Aktifkan demo'}
          </button>
        </div>
      </Card>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

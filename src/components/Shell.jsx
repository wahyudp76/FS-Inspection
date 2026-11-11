import pkg from '../../package.json'
import React, { useEffect, useState } from 'react'
import { cx, relativeTime } from '../lib/analytics'
import {
  IconGauge, IconClipboard, IconList, IconHistory, IconSettings, IconMenu, IconX,
  IconCloud, IconCloudOff, IconExternal, IconRefresh, IconPlus, IconChevron, IconWrench,
  IconAlert, IconCheck,
} from './icons'
import { TARGET_SHEET } from '../lib/config'
import logoUrl from '../assets/logo-color-192.png'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: IconGauge, desc: 'Ringkasan & analitik' },
  { id: 'inspeksi', label: 'Inspeksi', icon: IconClipboard, desc: 'Form checklist' },
  { id: 'unit', label: 'Data Unit', icon: IconList, desc: 'Master aset' },
  { id: 'riwayat', label: 'Riwayat', icon: IconHistory, desc: 'Hasil inspeksi' },
  { id: 'service', label: 'Service Engine', icon: IconWrench, desc: 'Perawatan & jadwal' },
  { id: 'pengaturan', label: 'Pengaturan', icon: IconSettings, desc: 'Koneksi sheet' },
]

function NavItem({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      className={cx(
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
        active
          ? 'bg-gradient-to-r from-teal-50 to-cyan-50/60 font-semibold text-teal-900 ring-1 ring-inset ring-teal-600/15'
          : 'text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900'
      )}
    >
      {/* penanda menu aktif */}
      {active && <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-teal-500 to-cyan-500" aria-hidden="true" />}
      <span className={cx('rounded-lg p-1.5 transition', active ? 'bg-teal-600 text-white shadow-[0_6px_14px_-8px_rgba(13,148,136,0.9)]' : 'bg-slate-900/[0.04] text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-700')}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">{item.label}</span>
        <span className="block truncate text-[10.5px] text-slate-500">{item.desc}</span>
      </span>
    </button>
  )
}

/* tombol melayang: kembali ke paling atas */
function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 320)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Kembali ke atas"
      title="Kembali ke atas"
      className={cx(
        'no-print fixed bottom-5 right-4 z-[60] grid h-11 w-11 place-items-center rounded-full border sm:bottom-6 sm:right-6',
        'border-brand/45 bg-white text-brand shadow-[0_8px_22px_-10px_rgba(13,60,60,0.30)] backdrop-blur',
        'transition-all duration-200 hover:border-brand hover:bg-brand/15 hover:text-slate-900',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      <IconChevron size={17} className="-rotate-90" />
    </button>
  )
}

const VERSI = pkg.version

export default function Shell({ children, route, navigate, sync, onSync, offline, demo, onAddInspect, onAddService, master }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  /* header beku: beri bayangan saat halaman digulir agar jelas tetap di atas */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const current = NAV.find((n) => n.id === route) || NAV[0]

  const SidebarInner = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="sidebar-head relative flex shrink-0 items-center gap-2.5 overflow-hidden px-4 py-5">
        {/* aksesori: pendar teal di balik logo */}
        <span className="blob -left-6 -top-8 h-24 w-24 bg-teal-400/40" aria-hidden="true" />
        <img
          src={logoUrl}
          alt="FS Inspection"
          width={34}
          height={34}
          className="relative h-[34px] w-[34px] shrink-0 rounded-xl object-contain shadow-[0_6px_16px_-8px_rgba(13,148,136,0.8)]"
        />
        <div className="relative min-w-0">
          <p className="text-[13.5px] font-bold leading-tight tracking-tight text-slate-900">
            FS <span className="grad-text">Inspection</span>
          </p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">Engine &amp; Irrigator</p>
        </div>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900 lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
          <IconX />
        </button>
      </div>

      {/* area yang bisa digulir: penting untuk landscape HP / layar pendek */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="flex min-h-full flex-col">
      <div className="px-3">
        <p className="mb-1.5 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          <span className="h-1 w-1 rounded-full bg-teal-500" aria-hidden="true" /> Menu
        </p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={route === item.id}
              onClick={() => {
                navigate(item.id)
                setOpen(false)
              }}
            />
          ))}
        </nav>
      </div>

      <div className="mt-auto space-y-3 p-3">
        <div className="card-accent relative overflow-hidden rounded-xl border bg-white p-3">
          <span className="blob -right-6 -top-8 h-20 w-20 bg-cyan-300/45" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              {offline ? <IconCloudOff size={13} className="text-amber-600" /> : <IconCloud size={13} className="text-emerald-600" />}
              Google Sheets
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500" title="Semua sinkronisasi dijalankan dari tombol Sinkron di header">
              <IconRefresh size={12} className={sync?.syncing ? 'animate-spin text-brand' : ''} />
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            {sync?.syncing
              ? 'Menyinkronkan…'
              : sync?.syncedAt
              ? `Tersinkron ${relativeTime(sync.syncedAt)}`
              : 'Belum tersinkron'}
          </p>
          {/* status data master: chip peringatan bila layar memakai data lama */}
          <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] leading-relaxed">
            {master?.stale ? (
              <button
                onClick={onSync}
                className="tap-sm inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 font-semibold text-amber-700 hover:bg-amber-500/20"
                title="Data master di layar berasal dari cache. Tekan untuk menarik ulang dari sheet."
              >
                <IconAlert size={11} /> Master {master.teks} — tekan Sinkron
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-600/80">
                <IconCheck size={11} /> Master live {master?.teks || ''}
              </span>
            )}
          </p>
          <a
            href={TARGET_SHEET.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-brand/90 hover:text-brand"
          >
            Sheet “{TARGET_SHEET.name}” <IconExternal size={11} />
          </a>
        </div>
        <p className="sidebar-ver px-1 text-center text-[9.5px] leading-relaxed text-slate-400">
          FS Inspection v{VERSI} · Inspeksi (tb_mesin / tb_irrigator)<br />+ Service engine (tb_service1 / tb_service2)
        </p>
      </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen overflow-x-clip">
      {/* sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-teal-700/10 bg-white/90 backdrop-blur-xl lg:block">
        {SidebarInner}
      </aside>

      {/* drawer mobile */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-fade-up border-r border-slate-900/10 bg-white">
            {SidebarInner}
          </div>
        </div>
      )}

      <div className="lg:pl-[236px]">
        {/* topbar */}
        <header
          className={cx(
            'no-print sticky top-0 z-30 border-b border-teal-700/10 bg-white/95 backdrop-blur-xl transition-all',
            scrolled ? 'shadow-[0_12px_28px_-24px_rgba(13,148,136,0.9)]' : ''
          )}
        >
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-teal-500/70 via-cyan-500/50 to-emerald-400/0"
            aria-hidden="true"
          />
          <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
            <button className="grid h-11 w-11 place-items-center rounded-lg border border-slate-900/10 bg-slate-900/[0.03] text-slate-700 sm:h-9 sm:w-9 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
              <IconMenu size={16} />
            </button>
            {/* logo di topbar (HP/tablet) — desktop sudah punya di sidebar */}
            <img
              src={logoUrl}
              alt="FS Inspection"
              width={26}
              height={26}
              className="h-[26px] w-[26px] shrink-0 object-contain drop-shadow-[0_2px_4px_rgba(13,60,60,0.18)] lg:hidden"
            />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-[15px] font-semibold tracking-tight text-slate-900">
                {current.label}
                {demo && <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-700">Demo</span>}
              </h1>
              <p className="truncate text-[10.5px] text-slate-500">{current.desc}</p>
              <span className="mt-1 block h-[2px] w-9 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 lg:hidden" aria-hidden="true" />
            </div>
            <button
              onClick={() => (route === 'service' ? onAddService?.() : onAddInspect?.())}
              className="btn-primary !px-2.5 !py-1.5 max-sm:!h-11 max-sm:!w-11 max-sm:!px-0"
              title={route === 'service' ? 'Catat service engine (pop-up)' : 'Tambah inspeksi baru (pop-up)'}
              aria-label={route === 'service' ? 'Catat Service' : 'Tambah Inspeksi'}
            >
              {route === 'service' ? <IconWrench size={15} /> : <IconPlus size={15} />}
              <span className="hidden sm:inline">{route === 'service' ? 'Catat Service' : 'Tambah Inspeksi'}</span>
            </button>
            <button
              onClick={onSync}
              disabled={sync?.syncing}
              className="btn-ghost !px-2.5 !py-1.5 max-sm:!h-11 max-sm:!w-11 max-sm:!px-0"
              title="Sinkron semua: kirim antrean inspeksi ke sheet, lalu tarik master aset, riwayat inspeksi, dan service engine"
              aria-label="Sinkron semua data dari dan ke Google Sheets"
              data-sync="all"
            >
              <IconRefresh size={14} className={sync?.syncing ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{sync?.syncing ? 'Menyinkronkan…' : 'Sinkron'}</span>
            </button>
            <a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !px-2.5 !py-1.5 max-sm:!h-11 max-sm:!w-11 max-sm:!px-0" title="Buka Google Sheets" aria-label="Buka Google Sheets">
              <IconExternal size={14} />
              <span className="hidden md:inline">Buka Sheet</span>
            </a>
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
          {/* aksesori: siluet tetes logo sebagai watermark di pojok */}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none fixed right-3 top-24 hidden h-[260px] w-[260px] text-teal-700/[0.045] xl:block"
            fill="currentColor"
          >
            <path d="M12 2.2c3.4 4.1 6.9 8.6 6.9 12.6A6.9 6.9 0 1 1 5.1 14.8C5.1 10.8 8.6 6.3 12 2.2Z" />
          </svg>
          {children}
        </main>
        <BackToTop />
      </div>
    </div>
  )
}

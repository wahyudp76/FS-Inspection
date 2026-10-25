import React, { useEffect, useState } from 'react'
import { cx, relativeTime } from '../lib/analytics'
import {
  IconLogo, IconGauge, IconClipboard, IconList, IconHistory, IconSettings, IconMenu, IconX,
  IconCloud, IconCloudOff, IconExternal, IconRefresh, IconPlus, IconChevron, IconWrench,
} from './icons'
import { TARGET_SHEET } from '../lib/config'

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
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
        active ? 'bg-white/[0.07] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.06)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      )}
    >
      <span className={cx('rounded-lg p-1.5 transition', active ? 'bg-brand/15 text-brand' : 'bg-white/[0.04] text-slate-500 group-hover:text-slate-300')}>
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
        'border-brand/45 bg-ink-900/95 text-brand shadow-[0_10px_30px_-8px_rgba(0,0,0,0.9)] backdrop-blur',
        'transition-all duration-200 hover:border-brand hover:bg-brand/15 hover:text-white',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      <IconChevron size={17} className="-rotate-90" />
    </button>
  )
}

export default function Shell({ children, route, navigate, sync, onSync, offline, demo, onAddInspect, onAddService }) {
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
      <div className="sidebar-head flex shrink-0 items-center gap-2.5 px-4 py-5">
        <IconLogo size={34} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight text-white">FS Inspection</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">Engine &amp; Irrigator</p>
        </div>
        <button className="ml-auto grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
          <IconX />
        </button>
      </div>

      {/* area yang bisa digulir: penting untuk landscape HP / layar pendek */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        <div className="flex min-h-full flex-col">
      <div className="px-3">
        <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Menu</p>
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
        <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              {offline ? <IconCloudOff size={13} className="text-amber-400" /> : <IconCloud size={13} className="text-emerald-400" />}
              Google Sheets
            </span>
            <button onClick={onSync} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-white/[0.06] hover:text-brand" title="Sinkronkan data" aria-label="Sinkronkan data">
              <IconRefresh size={13} />
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            {sync?.syncing
              ? 'Menyinkronkan…'
              : sync?.syncedAt
              ? `Tersinkron ${relativeTime(sync.syncedAt)}`
              : 'Belum tersinkron'}
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
        <p className="sidebar-ver px-1 text-center text-[9.5px] leading-relaxed text-slate-600">
          FS Inspection v1.6 · Inspeksi (tb_mesin / tb_irrigator)<br />+ Service engine (tb_service1 / tb_service2)
        </p>
      </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen overflow-x-clip">
      {/* sidebar desktop */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-[236px] border-r border-white/[0.06] bg-ink-900/70 backdrop-blur-xl lg:block">
        {SidebarInner}
      </aside>

      {/* drawer mobile */}
      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-fade-up border-r border-white/10 bg-ink-900">
            {SidebarInner}
          </div>
        </div>
      )}

      <div className="lg:pl-[236px]">
        {/* topbar */}
        <header
          className={cx(
            'no-print sticky top-0 z-30 border-b backdrop-blur-xl transition-colors',
            scrolled
              ? 'border-white/10 bg-ink-950/95 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.95)]'
              : 'border-white/[0.06] bg-ink-950/80'
          )}
        >
          <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3">
            <button className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 sm:h-9 sm:w-9 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
              <IconMenu size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-[15px] font-semibold tracking-tight text-white">
                {current.label}
                {demo && <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-300">Demo</span>}
              </h1>
              <p className="truncate text-[10.5px] text-slate-500">{current.desc}</p>
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
            <button onClick={onSync} className="btn-ghost !px-2.5 !py-1.5 max-sm:!h-11 max-sm:!w-11 max-sm:!px-0" title="Sinkronkan riwayat inspeksi" aria-label="Sinkronkan riwayat inspeksi">
              <IconRefresh size={14} className={sync?.syncing ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Sinkron</span>
            </button>
            <a href={TARGET_SHEET.url} target="_blank" rel="noreferrer" className="btn-ghost !px-2.5 !py-1.5 max-sm:!h-11 max-sm:!w-11 max-sm:!px-0" title="Buka Google Sheets" aria-label="Buka Google Sheets">
              <IconExternal size={14} />
              <span className="hidden md:inline">Buka Sheet</span>
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        <BackToTop />
      </div>
    </div>
  )
}

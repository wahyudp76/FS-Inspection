import React, { useId } from 'react'

const S = ({ children, size = 18, ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  >
    {children}
  </svg>
)

export const IconGauge = (p) => (
  <S {...p}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /><path d="m13.4 10.6 3.6-3.6" /><path d="M3.5 18a9.5 9.5 0 1 1 17 0" /></S>
)
export const IconClipboard = (p) => (
  <S {...p}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" /><path d="m9 13 2 2 4-4" /></S>
)
export const IconList = (p) => (
  <S {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></S>
)
export const IconHistory = (p) => (
  <S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4l3 2" /></S>
)
export const IconSettings = (p) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z" /></S>
)
export const IconBolt = (p) => (<S {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></S>)
export const IconTemp = (p) => (<S {...p}><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z" /></S>)
export const IconFuel = (p) => (<S {...p}><path d="M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14" /><path d="M2 20h14" /><path d="M14 10h3a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" /></S>)
export const IconEngine = (p) => (<S {...p}><path d="M6 9h3V7h4v2h3l3 3h2v4h-2l-3 3H9v-2H6l-3-3V9h3Z" /><path d="M9 13h4" /></S>)
export const IconBody = (p) => (<S {...p}><rect x="3" y="7" width="18" height="10" rx="2" /><circle cx="7.5" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" /></S>)
export const IconHose = (p) => (<S {...p}><circle cx="9" cy="12" r="5" /><circle cx="9" cy="12" r="2" /><path d="M14 12h4a3 3 0 0 0 3-3V7" /></S>)
export const IconGun = (p) => (<S {...p}><path d="M3 20 14 9" /><path d="m13 4 6 6-3 3-6-6 3-3Z" /><path d="m17 3 4 4" /></S>)
export const IconSpark = (p) => (<S {...p}><path d="m12 3 1.8 4.8L18.6 9.6l-4.8 1.8L12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8L12 3Z" /></S>)
export const IconSearch = (p) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>)
export const IconCheck = (p) => (<S {...p}><path d="m20 6-11 11-5-5" /></S>)
export const IconX = (p) => (<S {...p}><path d="M18 6 6 18M6 6l12 12" /></S>)
export const IconEdit = (p) => (<S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></S>)
export const IconTrash = (p) => (<S {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /><path d="M10 11v5M14 11v5" /></S>)
export const IconPlus = (p) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>)
export const IconRefresh = (p) => (<S {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></S>)
export const IconDownload = (p) => (<S {...p}><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></S>)
export const IconAlert = (p) => (<S {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></S>)
export const IconChevron = (p) => (<S {...p}><path d="m9 18 6-6-6-6" /></S>)
export const IconChevronDown = (p) => (<S {...p}><path d="m6 9 6 6 6-6" /></S>)
export const IconMenu = (p) => (<S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>)
export const IconExternal = (p) => (<S {...p}><path d="M14 3h7v7" /><path d="M21 3 11 13" /><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></S>)
export const IconTruck = (p) => (<S {...p}><path d="M3 17V6h10v11" /><path d="M13 9h4l4 4v4h-8" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></S>)
export const IconDroplet = (p) => (<S {...p}><path d="M12 2.7 6.5 9a7.5 7.5 0 1 0 11 0L12 2.7Z" /><path d="M9 14a3 3 0 0 0 3 3" /></S>)
export const IconTrend = (p) => (<S {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></S>)
export const IconCloud = (p) => (<S {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.6 1.6A3.7 3.7 0 0 0 6.8 19h10.7Z" /></S>)
export const IconCloudOff = (p) => (<S {...p}><path d="M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-9.8-4.2" /><path d="M6.2 11.6A3.7 3.7 0 0 0 6.8 19h8" /><path d="m3 3 18 18" /></S>)
export const IconSheet = (p) => (<S {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></S>)
export const IconFilter = (p) => (<S {...p}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></S>)
export const IconUser = (p) => (<S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></S>)
export const IconCalendar = (p) => (<S {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></S>)
export const IconShield = (p) => (<S {...p}><path d="M12 3 5 6v6c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></S>)
export const IconLogo = ({ size = 28, id }) => {
  // id unik per instance: hindari bentrok gradien saat logo tampil 2x (sidebar + drawer)
  const uid = `fsi-${useId().replace(/[:]/g, '')}${id ? '-' + id : ''}`
  return (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${uid}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#38bdf8" />
        <stop offset="0.55" stopColor="#22d3ee" />
        <stop offset="1" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id={`${uid}-sh`} x1="12" y1="6" x2="44" y2="46" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ffffff" stopOpacity="0.26" />
        <stop offset="0.65" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill={`url(#${uid}-bg)`} />
    <rect width="64" height="64" rx="16" fill={`url(#${uid}-sh)`} />
    {/* perisai = jaminan sudah diperiksa, centang = hasil inspeksi */}
    <path
      d="M32 12.5 17 18.2v12.6c0 9.6 6.1 17 15 20.2 8.9-3.2 15-10.6 15-20.2V18.2Z"
      stroke="#04121d"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M25.4 32.4 30 37.6l9.2-11.4"
      stroke="#04121d"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
  )
}

export const GROUP_ICON = {
  kelistrikan: IconBolt,
  instrumen: IconGauge,
  bahanbakar: IconFuel,
  pendingin: IconTemp,
  power: IconEngine,
  sasis: IconBody,
  turbin: IconEngine,
  hose: IconHose,
  gun: IconGun,
  kaki: IconBody,
  hidro: IconGauge,
  lain: IconSpark,
}

export const IconWrench = (p) => (
  <S {...p}><path d="M14.7 6.3a3.6 3.6 0 0 0 4.8 4.8l-8.2 8.2a2.6 2.6 0 0 1-3.7-3.7l8.1-8.1-1-1.2Z" /><path d="M14.7 6.3 17 4a3.6 3.6 0 0 1 3 6l-2.5 1.1" /></S>
)
export const IconClock = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
)
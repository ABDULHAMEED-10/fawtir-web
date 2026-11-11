/**
 * Line icons for the Features page's tiles (owner, 4 Nov 2026). Drawn here because the project has
 * no icon library; 24 px grid, 1.6 stroke, in the site's blue.
 */
const PATHS: Record<string, string> = {
  barcode: 'M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14M3 3h4M17 3h4M3 21h4M17 21h4',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  split: 'M3 7h11a4 4 0 014 4v0M3 17h11a4 4 0 004-4v0M18 11l3 2-3 2',
  pause: 'M9 5v14M15 5v14M4 12a8 8 0 1016 0 8 8 0 10-16 0',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  building: 'M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2',
  wifiOff:
    'M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 015-2.7M19 12.5a10 10 0 00-3.2-2.1M2 8.8a15 15 0 014-2.3M22 8.8a15 15 0 00-9.5-3.8M12 20h.01',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM6 10v4M18 10v4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  percent:
    'M19 5L5 19M7 7h.01M17 17h.01M7 9a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  receipt: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  check: 'M12 22a10 10 0 100-20 10 10 0 000 20zM8 12l3 3 5-6',
  users:
    'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 3.5a4 4 0 010 7.5M22 21a7 7 0 00-4-6.3',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pie: 'M12 2v10l8.5 5A10 10 0 1112 2zM15 2.5A10 10 0 0121.5 9H15z',
  flow: 'M3 12h4l3-8 4 16 3-8h4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  branch: 'M6 3v12M6 21a3 3 0 100-6 3 3 0 000 6zM18 9a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9',
  key: 'M14 10a5 5 0 11-1.5-3.5L21 3M17 7l2 2',
  log: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
  phone: 'M7 2h10v20H7zM11 18h2',
  approve: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9',
  stamp: 'M8 21h8M5 17h14l-1-4H6zM12 13V8M9 4h6v4H9z',
}

export function FeatureIcon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2C4EB7"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[22px]"
    >
      <path d={PATHS[name] ?? PATHS.check} />
    </svg>
  )
}

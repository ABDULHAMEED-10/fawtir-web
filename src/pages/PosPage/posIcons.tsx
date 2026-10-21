/** POS glyphs — 24×24, currentColor so they inherit the button they sit in. */
type IconProps = { className?: string }

const BASE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function CartIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M2.25 3h1.886l2.25 11.25h12.75" />
      <path d="M5.625 11.625H18.75L21 6H4.875" />
      <circle cx="7.875" cy="18.375" r="1.125" />
      <circle cx="16.875" cy="18.375" r="1.125" />
    </svg>
  )
}

export function TrashIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3.75 6h16.5M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="M18.75 6v13.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V6" />
      <path d="M10.125 10.5v6M13.875 10.5v6" />
    </svg>
  )
}

export function MinusIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M5.25 12h13.5" />
    </svg>
  )
}

export function PlusIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 5.25v13.5M5.25 12h13.5" />
    </svg>
  )
}

export function InvoiceIcon({ className = 'size-6' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M6 2.25h8.25L19.5 7.5v14.25H6z" />
      <path d="M14.25 2.25V7.5h5.25" />
      <path d="M9 12.75h7.5M9 16.5h5.25" />
    </svg>
  )
}

export function ShieldIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12 3 4.5 5.75v5.5c0 4.6 3.1 8.2 7.5 9.75 4.4-1.55 7.5-5.15 7.5-9.75v-5.5z" />
      <path d="m9 12 2.25 2.25L15.75 9.75" />
    </svg>
  )
}

export function LockIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="1.5" />
      <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" />
    </svg>
  )
}

export function InfoIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11.25v5.25M12 7.75v.01" />
    </svg>
  )
}

/** A bank note: cash. */
export function CashIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="2.25" y="6" width="19.5" height="12" rx="1.5" />
      <circle cx="12" cy="12" r="2.625" />
      <path d="M5.25 9v.01M18.75 15v.01" />
    </svg>
  )
}

export function CardIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="2.25" y="5.25" width="19.5" height="13.5" rx="1.5" />
      <path d="M2.25 9.75h19.5M5.25 15h3" />
    </svg>
  )
}

/** A document with lines: bank transfer. */
export function DocumentIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M6 2.25h8.25L19.5 7.5v14.25H6z" />
      <path d="M14.25 2.25V7.5h5.25M9 12h7.5M9 15.75h7.5" />
    </svg>
  )
}

/** A building: on account (the company). */
export function BuildingIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3.75 21V4.5A1.5 1.5 0 0 1 5.25 3h7.5a1.5 1.5 0 0 1 1.5 1.5V21" />
      <path d="M14.25 9h4.5a1.5 1.5 0 0 1 1.5 1.5V21M2.25 21h19.5" />
      <path d="M7.5 7.5h3M7.5 11.25h3M7.5 15h3" />
    </svg>
  )
}

export function ClockIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2.25" />
    </svg>
  )
}

export function PrinterIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M6.75 9V3h10.5v6" />
      <path d="M6.75 17.25H4.5A1.5 1.5 0 0 1 3 15.75V10.5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5.25a1.5 1.5 0 0 1-1.5 1.5h-2.25" />
      <path d="M6.75 14.25h10.5V21H6.75z" />
    </svg>
  )
}

export function EnvelopeIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="2.25" y="5.25" width="19.5" height="13.5" rx="1.5" />
      <path d="m3 6 9 6.75L21 6" />
    </svg>
  )
}

export function PhoneIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="6.75" y="2.25" width="10.5" height="19.5" rx="1.5" />
      <path d="M11.25 18.75h1.5" />
    </svg>
  )
}

export function QrIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3.75" y="3.75" width="6" height="6" rx="0.75" />
      <rect x="14.25" y="3.75" width="6" height="6" rx="0.75" />
      <rect x="3.75" y="14.25" width="6" height="6" rx="0.75" />
      <path d="M14.25 14.25h2.25v2.25M20.25 14.25v.01M14.25 20.25h.01M18 18h2.25v2.25H18z" />
    </svg>
  )
}

export function SearchIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10.5" cy="10.5" r="6.75" />
      <path d="m15.75 15.75 4.5 4.5" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} strokeWidth={2} className={className}>
      <path d="m4.5 12.75 5.25 5.25L19.5 6.75" />
    </svg>
  )
}

/** Points forward in reading order: flipped in right-to-left. */
export function ArrowForwardIcon({ className = 'size-5' }: IconProps) {
  return (
    <svg {...BASE} className={['rtl:-scale-x-100', className].join(' ')}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </svg>
  )
}

export function PencilIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M16.2 4.2a2.52 2.52 0 0 1 3.6 3.6L9.6 18l-4.8 1.2L6 14.4z" />
    </svg>
  )
}

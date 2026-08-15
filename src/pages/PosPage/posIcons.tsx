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

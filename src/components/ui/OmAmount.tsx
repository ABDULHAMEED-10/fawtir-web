import type { ReactNode } from 'react'
import { RialMark } from './Rial'

type OmAmountProps = {
  amount: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  iconClassName?: string
  amountClassName?: string
  className?: string
  /** Invert icon for dark backgrounds */
  onDark?: boolean
  /** A direction ("−", "+") drawn ahead of the sign, as the frames print "− <rial> 35.910". */
  prefix?: ReactNode
}

/**
 * Width only — the sign is drawn at the Central Bank's 1.86:1 (tools/rial/build.mjs) and `h-auto`
 * keeps it there; a square box would squash it.
 */
const ICON_SIZE = {
  xs: 'w-4',
  sm: 'w-5',
  md: 'w-6',
  lg: 'w-8',
  xl: 'w-[38px]',
} as const

/** A status or brand colour on the figure — the sign wears it too (a red credit, a green +). */
const FIGURE_TONE =
  /(?:^|\s)(text-(?:danger|success|pending|warning|primary|error)-\d+|text-\[#[0-9a-fA-F]{3,8}\])(?=\s|$)/

/** A near-black or grey `text-[#…]` is still a plain figure — only a real hue counts. */
function isChromatic(cls: string) {
  const hex = cls.match(/#([0-9a-fA-F]{3,8})/)?.[1]
  if (!hex) return true
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return Math.max(r, g, b) - Math.min(r, g, b) > 24
}

export function OmAmount({
  amount,
  size = 'md',
  iconClassName = '',
  amountClassName = '',
  className = '',
  onDark = false,
  prefix,
}: OmAmountProps) {
  // The sign follows its amount's colour; beside a plain figure it keeps the ink every drawn copy
  // of it uses (#2C3342).
  const figure = amountClassName.match(FIGURE_TONE)?.[1]
  const tone = onDark
    ? 'text-white'
    : figure && isChromatic(figure)
      ? figure
      : 'text-text-secondary'
  return (
    <span className={['inline-flex items-center gap-1', className].filter(Boolean).join(' ')}>
      {prefix ? <span className={amountClassName}>{prefix}</span> : null}
      <RialMark className={[ICON_SIZE[size], tone, iconClassName].filter(Boolean).join(' ')} />
      <span className={amountClassName}>{amount}</span>
    </span>
  )
}

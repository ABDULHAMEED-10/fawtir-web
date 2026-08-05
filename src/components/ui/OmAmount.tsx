import type { ReactNode } from 'react'
import omrIcon from '../../assets/brand/omr.svg'

type OmAmountProps = {
  amount: ReactNode
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  iconClassName?: string
  amountClassName?: string
  className?: string
  /** Invert icon for dark backgrounds */
  onDark?: boolean
}

/**
 * Width only — the glyph is 32×20.99 (≈1.52:1) and its SVG sets `preserveAspectRatio="none"`,
 * so a square box stretches it vertically. `h-auto` keeps the natural proportions.
 */
const ICON_SIZE = {
  xs: 'w-4 h-auto',
  sm: 'w-5 h-auto',
  md: 'w-6 h-auto',
  lg: 'w-8 h-auto',
  xl: 'w-[38px] h-auto',
} as const

export function OmAmount({
  amount,
  size = 'md',
  iconClassName = '',
  amountClassName = '',
  className = '',
  onDark = false,
}: OmAmountProps) {
  return (
    <span className={['inline-flex items-center gap-1', className].filter(Boolean).join(' ')}>
      <img
        src={omrIcon}
        alt=""
        aria-hidden="true"
        className={[
          ICON_SIZE[size],
          'shrink-0',
          onDark ? 'brightness-0 invert' : '',
          iconClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      />
      <span className={amountClassName}>{amount}</span>
    </span>
  )
}

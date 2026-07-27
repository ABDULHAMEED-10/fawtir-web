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

const ICON_SIZE = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-6',
  lg: 'size-8',
  xl: 'size-[38px]',
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

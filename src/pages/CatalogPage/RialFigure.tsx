import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Rial } from '../../components/ui'

/**
 * A figure with the rial sign, never "OMR" in the copy: drawn as `withRial` draws a swapped
 * amount (the sign at text height, kept on the figure's line), the sign ahead of the figure in
 * English and after it in Arabic. As a `<Trans>` component (`<amount>{{amount}}</amount>`), the
 * interpolated figure arrives as its children.
 */
export function RialFigure({
  children,
  prefix,
  className,
}: {
  children?: ReactNode
  /** A direction ("−", "+") drawn ahead of the whole amount. */
  prefix?: ReactNode
  className?: string
}) {
  const { i18n } = useTranslation()
  const arabic = i18n.language.startsWith('ar')
  return (
    <span className={['whitespace-nowrap', className].filter(Boolean).join(' ')}>
      {prefix}
      {arabic ? (
        <>
          {children}
          {' '}
          <Rial />
        </>
      ) : (
        <>
          <Rial />
          {' '}
          {children}
        </>
      )}
    </span>
  )
}

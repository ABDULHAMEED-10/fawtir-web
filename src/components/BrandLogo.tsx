import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoMark from '../assets/brand/logo-mark.svg'
import logoMarkLight from '../assets/brand/logo-mark-light.svg'

type BrandLogoProps = {
  /** `onDark` = white mark for dark/auth panels; `onLight` = navy mark for light surfaces */
  tone?: 'onLight' | 'onDark'
  size?: 'sm' | 'md' | 'lg'
  to?: string
  className?: string
}

const SIZE = {
  sm: { mark: 'h-[28px] w-[27px]', text: 'text-[16px] tracking-[0.32px]', gap: '-ms-1.5' },
  md: { mark: 'h-[44px] w-[42px]', text: 'text-[22px] tracking-[0.44px]', gap: '-ms-2.5' },
  lg: { mark: 'h-[42px] w-[41px]', text: 'text-[26px] tracking-[0.5px]', gap: '-ms-2' },
} as const

export function BrandLogo({
  tone = 'onLight',
  size = 'md',
  to = '/',
  className = '',
}: BrandLogoProps) {
  const { t } = useTranslation()
  const s = SIZE[size]
  const onDark = tone === 'onDark'

  const content = (
    <span className="inline-flex items-end">
      <img
        src={onDark ? logoMarkLight : logoMark}
        alt=""
        className={[s.mark, s.gap, 'shrink-0'].join(' ')}
      />
      <span
        className={[
          'font-semibold leading-none',
          s.text,
          onDark ? 'text-white' : 'text-[#0f2a6b]',
        ].join(' ')}
      >
        {t('brand.wordmark')}
      </span>
    </span>
  )

  const wrapperClass = ['inline-block w-fit shrink-0', className].filter(Boolean).join(' ')

  if (!to) {
    return (
      <span className={wrapperClass} aria-label={t('brand.name')}>
        {content}
      </span>
    )
  }

  return (
    <Link to={to} className={wrapperClass} aria-label={t('brand.name')}>
      {content}
    </Link>
  )
}

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

/**
 * EN lockup (23:788): mark 41.76×43.55 + AWTIR 22px.
 * AR lockup (28:2720 / 28:2750): same mark + فوتر in Noto Sans Arabic Bold.
 */
const SIZE_EN = {
  sm: {
    mark: 'h-[28px] w-[27px]',
    text: 'text-[16px] font-semibold tracking-[0.32px] leading-none',
    overlap: '-me-[7.5px]',
  },
  md: {
    mark: 'h-[43.55px] w-[41.76px]',
    text: 'text-[22px] font-semibold tracking-[0.44px] leading-none',
    overlap: '-me-[11.53px]',
  },
  lg: {
    mark: 'h-[42px] w-[40px]',
    text: 'text-[26px] font-semibold tracking-[0.52px] leading-none',
    overlap: '-me-[11px]',
  },
} as const

const SIZE_AR = {
  sm: {
    mark: 'h-[28px] w-[27px]',
    text: 'text-[18px] font-bold leading-[1.4]',
    overlap: '-me-[7.5px]',
  },
  md: {
    mark: 'h-[43.55px] w-[41.76px]',
    text: 'text-[28px] font-bold leading-[1.4]',
    overlap: '-me-[11.53px]',
  },
  lg: {
    mark: 'h-[54px] w-[52px]',
    text: 'text-[32px] font-bold leading-[1.4]',
    overlap: '-me-[14px]',
  },
} as const

export function BrandLogo({
  tone = 'onLight',
  size = 'md',
  to = '/',
  className = '',
}: BrandLogoProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar' || i18n.language.startsWith('ar')
  const s = (isAr ? SIZE_AR : SIZE_EN)[size]
  const onDark = tone === 'onDark'

  const content = (
    /* Lockup order matches Figma 28:2720: mark then wordmark (LTR). */
    <span className="inline-flex items-end" dir="ltr">
      <img
        src={onDark ? logoMarkLight : logoMark}
        alt=""
        className={[s.mark, s.overlap, 'shrink-0 object-contain'].join(' ')}
      />
      <span
        className={[
          s.text,
          isAr ? 'font-[family-name:var(--font-arabic)]' : '',
          onDark ? 'text-white' : 'text-[#0f2a6b]',
        ]
          .filter(Boolean)
          .join(' ')}
        dir={isAr ? 'rtl' : 'ltr'}
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

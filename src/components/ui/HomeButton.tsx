import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HomeIcon } from './icons'

/** A square house that leads back to the public site, the same size and card as Back. */
export function HomeButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <Link
      to="/"
      aria-label={t('common.home')}
      title={t('common.home')}
      className={[
        'inline-flex size-[41px] shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-surface-card text-text-tertiary shadow-card transition-colors hover:border-border-default hover:text-primary-700',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <HomeIcon size={20} />
    </Link>
  )
}

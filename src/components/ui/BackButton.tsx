import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon } from './icons'

type BackButtonProps = {
  to: string
  state?: unknown
  className?: string
}

export function BackButton({ to, state, className = '' }: BackButtonProps) {
  const { t } = useTranslation()

  return (
    <Link
      to={to}
      state={state}
      className={[
        'inline-flex h-[41px] items-center gap-1.5 rounded-sm border border-border-subtle bg-surface-card px-[19px] text-sm font-semibold text-text-tertiary shadow-card transition-colors hover:border-border-default hover:text-text-secondary',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ChevronLeftIcon size={16} className="rtl:rotate-180" />
      {t('common.back')}
    </Link>
  )
}

import { useTranslation } from 'react-i18next'

/** The tab strip the Catalog lists carry, with a count on each — History's three tabs. */
export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  count,
}: {
  tabs: readonly { id: T; labelKey: string }[]
  value: T
  onChange: (id: T) => void
  count: (id: T) => number
}) {
  const { t } = useTranslation()
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-surface-background px-2 pt-4">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={[
              'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(tab.labelKey)}
            <span
              className={[
                'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                active ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-tertiary',
              ].join(' ')}
            >
              {count(tab.id)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

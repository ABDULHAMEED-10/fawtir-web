import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'

export type UnavailableModule =
  | 'pos'
  | 'catalog'
  | 'stock'
  | 'tradeDocuments'
  | 'billing'
  | 'closing'
  | 'export'
  | 'otaCallLog'
  | 'makeRole'

/**
 * A screen whose module has no server behind it yet. It used to draw a sample company's records
 * (Al Bahja Coffee's till, stock, quotations, bills…) as if they were the reader's, which is worse
 * than showing nothing: someone could act on numbers that are not theirs. The page code for these
 * modules stays in the tree for when the backend arrives; the routes land here until then.
 */
export function ModuleUnavailablePage({ module }: { module: UnavailableModule }) {
  return (
    <AppShell>
      <ModuleUnavailable module={module} />
    </AppShell>
  )
}

export function ModuleUnavailable({ module, heading = 'h1' }: { module: UnavailableModule; heading?: 'h1' | 'h2' }) {
  const { t } = useTranslation()
  const Heading = heading
  return (
    <section
      aria-labelledby={`unavailable-${module}`}
      className="mx-auto flex w-full max-w-[1144px] flex-col items-start gap-3 rounded-md bg-surface-card p-8"
    >
      <span className="inline-flex h-[26px] items-center rounded-sm bg-primary-50 px-[11px] text-[11.5px] font-semibold uppercase tracking-[0.3px] text-primary-700">
        {t('moduleUnavailable.badge')}
      </span>
      <Heading id={`unavailable-${module}`} className="text-2xl font-medium leading-[1.2] text-text-primary">
        {t(`moduleUnavailable.${module}.title`)}
      </Heading>
      <p className="max-w-[640px] text-sm font-medium leading-[1.6] text-text-tertiary">
        {t(`moduleUnavailable.${module}.body`)}
      </p>
      <p className="max-w-[640px] text-sm font-medium leading-[1.6] text-text-tertiary">
        {t('moduleUnavailable.noSampleData')}
      </p>
    </section>
  )
}

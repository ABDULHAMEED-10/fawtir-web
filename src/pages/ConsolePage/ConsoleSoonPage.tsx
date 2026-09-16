import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { CONSOLE_ITEMS } from '../../lib/consoleNav'

/**
 * A console screen the design has not reached yet.
 *
 * It says so plainly; the breadcrumb above it is the way back, one step up rather than a jump to
 * the console's home.
 */
export function ConsoleSoonPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const item = CONSOLE_ITEMS.find((entry) => entry.to === pathname)

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs items={[{ labelKey: item ? item.labelKey : 'console.soon.title' }]} />
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {item ? t(item.labelKey) : t('console.soon.title')}
        </h1>
        <section className="flex flex-col items-start gap-3 rounded-md bg-surface-card p-8">
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-primary-50 px-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-primary-800">
            {t('console.soon.badge')}
          </span>
          <p className="max-w-[560px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('console.soon.body')}
          </p>
        </section>
      </div>
    </ConsoleShell>
  )
}

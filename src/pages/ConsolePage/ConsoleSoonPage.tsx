import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { CONSOLE_ITEMS } from '../../lib/consoleNav'

/**
 * A console screen the design has not reached yet.
 *
 * It says so plainly and offers the way back, rather than dropping the reader on the home page
 * the way an unbuilt route otherwise would.
 */
export function ConsoleSoonPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const item = CONSOLE_ITEMS.find((entry) => entry.to === pathname)

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
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
          <Link
            to="/console"
            className="mt-1 inline-flex h-11 items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('console.soon.back')}
          </Link>
        </section>
      </div>
    </ConsoleShell>
  )
}

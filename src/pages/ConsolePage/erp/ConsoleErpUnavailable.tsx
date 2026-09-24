import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice } from '../../../layouts/ConsoleShell/ConsoleNotice'

/**
 * The platform's view of tenant ERP connections, which does not exist yet.
 *
 * <p>There is no platform-scoped ERP API: `/api/v1/erp/connections` is tenant-scoped and derives
 * the tenant from the session, so nothing an operator could read from here has been built. What
 * these two screens drew instead came from `consoleErp.ts` — a fixed-clock story fixture with nine
 * invented tenants — and it was indistinguishable from live data: connection states, mapping
 * health, "last collected" times, all of it made up.
 *
 * That is worse for an operator than an empty screen. Someone reading "Al Bahja · READY · last
 * collected 14 minutes ago" has no way to tell that no such connection exists, and would answer a
 * support call from it. The same reasoning retired the four tenant-side extraction screens in
 * Step 10 (`ConnectionFeatureUnavailable`), and this is that decision applied to the console.
 *
 * The routes stay reachable so an operator's bookmark does not 404, but they are off the console
 * nav. The fixture itself is kept: the ERP templates, add-on requests, audit and queue screens
 * still read it, and they are a separate question from this one.
 */
export function ConsoleErpUnavailable() {
  const { t } = useTranslation()

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.group.erp' },
            { labelKey: 'console.erp.unavailable.crumb' },
          ]}
        />
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary max-md:text-2xl">
            {t('console.erp.unavailable.title')}
          </h1>
          <p className="mt-1.5 max-w-[760px] text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('console.erp.unavailable.subtitle')}
          </p>
        </div>
        <ConsoleNotice
          badge={t('console.erp.unavailable.badge')}
          body={t('console.erp.unavailable.body')}
          action={{ to: '/console', label: t('console.erp.unavailable.action') }}
        />
      </div>
    </ConsoleShell>
  )
}

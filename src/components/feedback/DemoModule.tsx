import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsoleSoonPage } from '../../pages/ConsolePage/ConsoleSoonPage'
import { ModuleUnavailablePage, type UnavailableModule } from './ModuleUnavailable'
import { demoModulesEnabled } from '../../lib/demoModules'

/**
 * A prototype route. Without the opt-in it is the honest "not available yet" page; with it, the
 * prototype under a ribbon that cannot be dismissed, so a sample record is never read as the
 * company's own. Prototypes call no write API, and the invoice composer refuses their records
 * regardless of this switch (TRADE_DOCUMENTS_CONNECTED in CreateInvoicePage), so nothing sampled
 * can reach a real workflow.
 */
export function DemoModule({ module, children }: { module: UnavailableModule | 'console'; children: ReactNode }) {
  if (!demoModulesEnabled()) {
    return module === 'console' ? <ConsoleSoonPage /> : <ModuleUnavailablePage module={module} />
  }
  return (
    <>
      <DemoRibbon />
      {children}
    </>
  )
}

function DemoRibbon() {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] bg-warning-700 px-4 py-2 text-center text-sm font-semibold text-white"
    >
      {t('demoModule.ribbon')}
    </p>
  )
}

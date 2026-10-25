import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from '../../pages/SettingsPage/SettingsShell'
import { LoadingNotice, Notice } from '../feedback/ApiNotice'
import { useEntitlements } from '../../hooks/useEntitlements'
import { erpSwitchedOff } from '../../lib/identity/entitlements'
import { PlanGated } from './PlanGated'

/**
 * Every ERP screen, for a company whose ERP the platform has switched off (`erpEntitled: false`).
 *
 * The page's frame stays and its content gives way to the same "not enabled" notice the ERP
 * overview already used, so neither a direct URL nor a bookmark lands on create, test or upload
 * controls the server would refuse — and nobody is told their *role* is missing when it is the
 * company's switch. Nothing is deleted or hidden server-side: the connections, mappings and history
 * are still there when ERP is enabled again. With ERP on, the screens keep their own permission
 * checks; this gate grants nothing.
 */
export function ErpGated({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  // Until the snapshot is in, nothing of the screen: it would mount, start its reads and then be
  // replaced by the notice.
  if (!ready) {
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  if (erpSwitchedOff(entitlements)) {
    return (
      <SettingsShell group="integration">
        <Notice badge={t('erp.home.notEntitled')} body={t('erp.home.notEntitledBody')} />
      </SettingsShell>
    )
  }
  return (
    <PlanGated feature="erpMapping" shell="settings">
      {children}
    </PlanGated>
  )
}

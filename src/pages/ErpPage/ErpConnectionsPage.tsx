import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'

/** Placeholder until the screen lands — docs/erp-and-console-plan.md §2. */
export function ErpConnectionsPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.soon.title')} subtitle={t('erp.soon.body')} />
    </SettingsShell>
  )
}

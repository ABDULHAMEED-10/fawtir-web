import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { ActivityHistory } from './ActivityHistory'
import { LoadingNotice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { ACTIVITY_RESOURCE_TYPES } from '../../lib/activityLog'

/**
 * Settings › Activity log (Figma 135:41482), from the organisation's real log
 * (`GET /v1/settings/activity-log`, `admin.settings.manage`).
 *
 * This screen used to draw a realistic sample log: named people, figures and monthly totals that
 * belonged to no organisation. A customer could not tell it from their own record, which is worse
 * than an empty screen, so it now shows only what the server holds. The figures the design draws
 * above the list (entries this month, by person, by API, retention) and the PDF export have no
 * backend yet and are not drawn rather than invented.
 */
export function ActivityLogPage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const canRead = entitlements !== null && hasPermission(entitlements, 'admin.settings.manage')

  return (
    <SettingsShell group="records">
      <SettingsHeader title={t('activityLog.title')} subtitle={t('activityLog.subtitle')} />
      {!ready ? (
        <LoadingNotice />
      ) : !canRead ? (
        <PermissionDeniedNotice />
      ) : (
        <ActivityHistory resourceTypes={ACTIVITY_RESOURCE_TYPES} allowAll />
      )}
    </SettingsShell>
  )
}

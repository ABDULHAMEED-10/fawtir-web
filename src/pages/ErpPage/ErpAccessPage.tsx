import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { ActivityHistory } from '../SettingsPage/ActivityHistory'
import { LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { RowsView } from '../../components/ui'
import { SectionCard, TBODY_ROW, THEAD_ROW, Td, Th } from './overview/idiom'
import { Pill } from './ErpShell'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission, type Entitlements } from '../../lib/identity/entitlements'
import { ERP_RESOURCE_TYPES } from '../../lib/activityLog'
import { ERP_CAPABILITIES, ERP_PERSONAS } from '../../lib/erp/erpAccess'

/**
 * Settings › Integration › Access & history (`/settings/erp/access`).
 *
 * **Access** is the reader's own permission snapshot (`/v1/me/entitlements`), set against what each
 * ERP capability needs, and the personas of the ERP plan (Phase 3, DEC-B) as the permissions each
 * would need. Fawtir has no ready-made role for any of them: a role is built from these permissions
 * by an administrator. Nothing here creates or changes a role, and nothing claims a template the
 * server does not have.
 *
 * **History** is the organisation's real activity log narrowed to the ERP's resource kinds. The
 * server answers that log to holders of `admin.settings.manage` only, and to them it answers the
 * whole organisation's log; the kinds below are a convenience, not a scope. There is no
 * ERP-scoped audit read on the server for anyone else (plan risk R22), so other readers are told
 * so rather than shown a filtered view the screen would have to enforce on its own.
 */
export function ErpAccessPage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()

  return (
    <SettingsShell group="integration">
      <SettingsHeader title={t('erp.access.title')} subtitle={t('erp.access.subtitle')} />
      {!ready ? (
        <LoadingNotice />
      ) : (
        <div className="flex flex-col gap-5">
          <YourAccess entitlements={entitlements} />
          <Personas />
          <SectionCard title={t('erp.access.history.title')} note={t('erp.access.history.note')}>
            <div className="px-5 pb-5">
              {entitlements !== null && hasPermission(entitlements, 'admin.settings.manage') ? (
                <ActivityHistory resourceTypes={ERP_RESOURCE_TYPES} allowAll={false} />
              ) : (
                <Notice badge={t('appAccess.noAccess')} body={t('erp.access.history.adminOnly')} />
              )}
            </div>
          </SectionCard>
        </div>
      )}
    </SettingsShell>
  )
}

function YourAccess({ entitlements }: { entitlements: Entitlements | null }) {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('erp.access.yours.title')} note={t('erp.access.yours.note')}>
      <div className="relative max-md:px-5 max-md:pb-5">
        <RowsView>
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.access.yours.capability')}</Th>
                <Th>{t('erp.access.yours.permission')}</Th>
                <Th>{t('erp.access.yours.held')}</Th>
              </tr>
            </thead>
            <tbody>
              {ERP_CAPABILITIES.map((capability) => {
                const held =
                  entitlements !== null &&
                  capability.anyOf.some((code) => hasPermission(entitlements, code))
                return (
                  <tr key={capability.id} className={TBODY_ROW}>
                    <Td first>
                      <span className="font-medium text-text-primary">
                        {t(`erp.access.capability.${capability.id}`)}
                      </span>
                    </Td>
                    <Td>
                      <bdi dir="ltr" className="font-mono text-xs text-text-secondary">
                        {capability.anyOf.join(' | ')}
                      </bdi>
                    </Td>
                    <Td>
                      <Pill
                        tone={held ? 'success' : 'neutral'}
                        label={held ? t('erp.access.yours.yes') : t('erp.access.yours.no')}
                      />
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </RowsView>
      </div>
    </SectionCard>
  )
}

function Personas() {
  const { t } = useTranslation()
  return (
    <SectionCard title={t('erp.access.personas.title')} note={t('erp.access.personas.note')}>
      <ul className="flex flex-col gap-4 px-5 pb-5">
        {ERP_PERSONAS.map((persona) => (
          <li key={persona.id} className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-text-primary">
              {t(`erp.access.persona.${persona.id}.name`)}
            </span>
            <span className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t(`erp.access.persona.${persona.id}.body`)}
            </span>
            <bdi
              dir="ltr"
              className="font-mono text-xs leading-[1.6] text-text-secondary [overflow-wrap:anywhere]"
            >
              {persona.permissions.join(', ')}
            </bdi>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

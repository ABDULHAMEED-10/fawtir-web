import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import {
  ERP_ENTITLEMENT_PERMISSION,
  describeErpEntitlementFailure,
  erpEntitlementPath,
  grantErpEntitlement,
  revokeErpEntitlement,
  type ErpEntitlementStatus,
} from '../../../lib/console/erpEntitlement'
import { formatDate } from '../../../lib/format'
import { Input } from '../../../components/ui'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'

/**
 * Whether ERP integration is enabled for one real tenant, and the platform action that changes it.
 *
 * This replaces nothing in place: the sample "add-on requests" screen only ever changed local
 * fixture data. Here every state shown is the backend's answer — the row read on load, or the row
 * the grant or revoke returned — and nothing is assumed before the backend has answered.
 */
export function TenantErpEntitlementCard({ tenantId, tenantCode }: { tenantId: string; tenantCode: string }) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const allowed = entitlements !== null && hasPermission(entitlements, ERP_ENTITLEMENT_PERMISSION)
  const { read, retry } = useConsoleRead<ErpEntitlementStatus>(allowed ? erpEntitlementPath(tenantId) : null)
  const [changed, setChanged] = useState<ErpEntitlementStatus | null>(null)
  const [dialog, setDialog] = useState<'grant' | 'revoke' | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [confirmError, setConfirmError] = useState<string | undefined>()

  if (!allowed) return null

  const frame = (children: React.ReactNode) => (
    <section aria-labelledby="tenant-erp-entitlement" className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
      <h2 id="tenant-erp-entitlement" className="text-[17px] font-semibold text-text-primary">
        {t('console.erpEntitlement.title')}
      </h2>
      {children}
    </section>
  )

  if (read.status === 'loading') return frame(<ConsoleNotice busy body={t('console.erpEntitlement.loading')} />)
  if (read.status === 'failed') return frame(<ConsoleReadFailure error={read.error} retry={retry} />)

  const status = changed ?? read.data
  const when = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10), i18n.language) : t('console.tenants.none'))

  return frame(
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ConsoleStatusPill
          tone={status.entitled ? 'success' : 'neutral'}
          label={t(status.entitled ? 'console.erpEntitlement.state.enabled' : 'console.erpEntitlement.state.disabled')}
        />
        <p className="text-sm leading-[1.6] text-text-secondary">
          {status.entitled
            ? t('console.erpEntitlement.grantedOn', { date: when(status.grantedAt) })
            : status.revokedAt
              ? t('console.erpEntitlement.revokedOn', { date: when(status.revokedAt) })
              : t('console.erpEntitlement.never')}
        </p>
      </div>
      <p className="text-sm leading-[1.6] text-text-secondary">
        {t(status.entitled ? 'console.erpEntitlement.enabledBody' : 'console.erpEntitlement.disabledBody')}
      </p>
      <div>
        {status.entitled ? (
          <ConsoleButton variant="danger" onClick={() => setDialog('revoke')}>
            {t('console.erpEntitlement.revoke')}
          </ConsoleButton>
        ) : (
          <ConsoleButton variant="primary" onClick={() => setDialog('grant')}>
            {t('console.erpEntitlement.grant')}
          </ConsoleButton>
        )}
      </div>

      {dialog === 'grant' ? (
        <OperatorReasonDialog<ErpEntitlementStatus>
          formId="erp-entitlement-grant"
          title={t('console.erpEntitlement.grantTitle')}
          body={t('console.erpEntitlement.grantBody')}
          confirmLabel={t('console.erpEntitlement.grantConfirm')}
          confirmingLabel={t('console.erpEntitlement.sending')}
          send={(reason) => grantErpEntitlement(tenantId, reason)}
          describeFailure={describeErpEntitlementFailure}
          onDone={(answer) => {
            setChanged(answer)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === 'revoke' ? (
        <OperatorReasonDialog<ErpEntitlementStatus>
          formId="erp-entitlement-revoke"
          title={t('console.erpEntitlement.revokeTitle')}
          body={t('console.erpEntitlement.revokeBody')}
          fields={
            // Revoking stops a customer's live integration, so it takes more than a click: the
            // operator types the tenant's code, the same check a destructive console action asks.
            <Input
              id="erp-entitlement-confirm-code"
              name="confirmCode"
              label={t('console.erpEntitlement.confirmCodeLabel', { code: tenantCode })}
              value={confirmCode}
              onChange={(event) => {
                setConfirmCode(event.target.value)
                setConfirmError(undefined)
              }}
              error={confirmError}
              autoComplete="off"
              dir="ltr"
            />
          }
          validate={() => {
            if (confirmCode.trim() === tenantCode) return undefined
            setConfirmError(t('console.erpEntitlement.confirmCodeMismatch'))
            return 'confirmCode'
          }}
          confirmLabel={t('console.erpEntitlement.revokeConfirm')}
          confirmingLabel={t('console.erpEntitlement.sending')}
          send={(reason) => revokeErpEntitlement(tenantId, reason)}
          describeFailure={describeErpEntitlementFailure}
          onDone={(answer) => {
            setChanged(answer)
            setConfirmCode('')
            setDialog(null)
          }}
          onClose={() => {
            setConfirmCode('')
            setConfirmError(undefined)
            setDialog(null)
          }}
        />
      ) : null}
    </>,
  )
}

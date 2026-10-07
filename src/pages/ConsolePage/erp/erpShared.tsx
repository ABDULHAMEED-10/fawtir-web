import { useState, type FormEvent, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DateField, Input, Modal } from '../../../components/ui'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { formatDay } from '../../../lib/console/format'
import {
  NOW,
  allowanceOf,
  connectionsFor,
  consoleErpStore,
  pendingRequests,
  tenantName,
  watermarkAgeDays,
  type ConsoleErpState,
  type PlatformConnection,
  type TenantAddon,
} from '../../../lib/consoleErp'
import type {
  AddonState,
  ConnectionState,
  MappingStatus,
  RunState,
} from '../../../lib/erpConnector'
import { count } from '../../../lib/superAdmin'
import {
  Field,
  ModalFooter,
  QuickChips,
  TODAY_KEY,
  TextArea,
  dateOf,
  dayLabel,
  focusFirstInvalidField,
  type Errors,
} from '../subscriptions/modalFields'
import {
  CONSOLE_CARD_HEAD,
  CONSOLE_CARD_TITLE,
  CONSOLE_DANGER,
  CONSOLE_SECONDARY,
} from '../../../layouts/ConsoleShell/consoleStyle'

/**
 * What the console's ERP screens share: the pills (the tenant-side `ConnectionShell` tones, so a
 * state never changes colour between the two halves of the product), the short reason a
 * connection needs attention, the "time today, day otherwise" label the tables use, and the
 * tenant's add-on card with its two operator actions — drawn once, on the connection page and on
 * the tenant's ERP tab alike.
 */

/* ------------------------------------------------------------------- pills */

const CONNECTION_TONE: Record<ConnectionState, ConsolePillTone> = {
  DRAFT: 'neutral',
  CONNECTED: 'success',
  PAUSED: 'pending',
  ERROR: 'danger',
  DISCONNECTED: 'neutral',
}
const MAPPING_TONE: Record<MappingStatus, ConsolePillTone> = {
  UNMAPPED: 'neutral',
  DRAFT: 'pending',
  READY: 'pending',
  CERTIFIED: 'success',
  STALE: 'danger',
}
const RUN_TONE: Record<RunState, ConsolePillTone> = {
  RUNNING: 'pending',
  SUCCEEDED: 'success',
  PARTIAL: 'pending',
  FAILED: 'danger',
  SKIPPED_QUOTA: 'neutral',
  SKIPPED_LEASE: 'neutral',
}
const ADDON_TONE: Record<AddonState, ConsolePillTone> = {
  INACTIVE: 'neutral',
  PENDING_PAYMENT: 'pending',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  CANCELLED: 'neutral',
}

export function ConnectionStatePill({ state }: { state: ConnectionState }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill tone={CONNECTION_TONE[state]} label={t(`erp.connector.state.${state}`)} />
  )
}

export function MappingStatusPill({ status }: { status: MappingStatus }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill
      tone={MAPPING_TONE[status]}
      label={t(`erp.connector.mappingStatus.${status}`)}
    />
  )
}

export function RunStatePill({ state }: { state: RunState }) {
  const { t } = useTranslation()
  return <ConsoleStatusPill tone={RUN_TONE[state]} label={t(`erp.connector.runState.${state}`)} />
}

export function AddonStatePill({ state }: { state: AddonState }) {
  const { t } = useTranslation()
  return (
    <ConsoleStatusPill tone={ADDON_TONE[state]} label={t(`erp.connector.addon.state.${state}`)} />
  )
}

/* ----------------------------------------------------------------- helpers */

/** Why a connection is on the attention list — an error's cause, or how long it has been quiet. */
export function attentionReason(t: TFunction, c: PlatformConnection): string {
  if (c.state === 'ERROR')
    return t(`console.erp.connections.reason.${c.errorKey ?? 'threeFailures'}`)
  return t('console.erp.connections.reason.stale', { count: watermarkAgeDays(c) ?? 0 })
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** "14:00" when it is today on the console clock, "2 Sep 2026" otherwise. Digits stay Latin. */
export function whenLabel(date: Date | undefined, language: string): string {
  if (!date) return '—'
  if (sameDay(date, NOW))
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date)
  return formatDay(date.toISOString(), language)
}

export const TH = 'px-3 py-3 text-start font-semibold first:ps-4 last:pe-4'
export const TD = 'px-3 py-3.5 align-top first:ps-4 last:pe-4'

export const SECONDARY_BUTTON = CONSOLE_SECONDARY
export const DANGER_BUTTON = CONSOLE_DANGER

/** The console's card: a titled header and a body, as the Operations screen draws its panels. */
export function Card({
  title,
  aside,
  children,
  padded = true,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  padded?: boolean
}) {
  return (
    <section className="flex flex-col rounded-sm bg-surface-card">
      <div className={CONSOLE_CARD_HEAD}>
        <h2 className={CONSOLE_CARD_TITLE}>{title}</h2>
        {aside}
      </div>
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

/** A label/value line, as the Operations connection card and the subscription cards draw it. */
export function Line({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-[9px] text-[13.5px] last:border-b-0">
      <span className="font-medium text-text-muted">{label}</span>
      <span
        className={`text-end font-semibold ${tone === 'bad' ? 'text-danger-700' : 'text-text-primary'}`}
      >
        {value}
      </span>
    </div>
  )
}

/** The Tenants screen's quota bar, with its label under it. */
export function UsageBar({
  label,
  used,
  allowance,
  ofLabel,
}: {
  label: string
  used: number
  allowance: number
  ofLabel: string
}) {
  const share = allowance ? Math.min(used / allowance, 1) : 0
  const colour = share >= 1 ? 'bg-danger-700' : share >= 0.8 ? 'bg-pending-500' : 'bg-success-700'
  return (
    <div className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-tertiary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">{ofLabel}</span>
      </div>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-50">
        <span
          className={`block h-full rounded-full ${colour}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </span>
    </div>
  )
}

/* ------------------------------------------------------------- add-on card */

export type AddonAction = 'grant' | 'suspend' | 'resume'

/**
 * The tenant's add-on as an operator sees it, with the three things an operator may do about it.
 * `onAction` opens the modal; the page owns the modal and the "done" line so the store change and
 * its confirmation land in one place.
 */
export function ErpAddonCard({
  erp,
  tenantId,
  onAction,
}: {
  erp: ConsoleErpState
  tenantId: string
  onAction: (action: AddonAction) => void
}) {
  const { t, i18n } = useTranslation()
  const addon = erp.addons.find((a) => a.tenantId === tenantId)
  const day = (date: Date) => dayLabel(date, i18n.language)
  const key = (name: string) => `console.erp.connection.addon.${name}`

  if (!addon) {
    const pending = pendingRequests(erp).some((r) => r.tenantId === tenantId)
    return (
      <Card title={t(key('title'))}>
        <p className="py-2.5 text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(key('none'))}
          {pending ? (
            <>
              {' '}
              <Link
                to="/console/erp/add-on-requests"
                className="font-semibold text-primary-700 hover:text-primary-800"
              >
                {t(key('pendingRequest'))}
              </Link>
            </>
          ) : null}
        </p>
      </Card>
    )
  }

  const allowance = allowanceOf(addon)
  const connected = connectionsFor(erp, tenantId).filter((c) => c.state !== 'DISCONNECTED').length
  const liveGrants = addon.grants.filter((g) => g.expires.getTime() > NOW.getTime())

  return (
    <Card title={t(key('title'))} aside={<AddonStatePill state={addon.state} />}>
      <Line label={t(key('source'))} value={t(key(`sourceValue.${addon.source}`))} />
      {addon.since ? <Line label={t(key('since'))} value={day(addon.since)} /> : null}
      {addon.trialEndsAt ? (
        <Line label={t(key('trialEnds'))} value={day(addon.trialEndsAt)} />
      ) : null}
      {addon.state === 'SUSPENDED' && addon.suspendedReason ? (
        <Line label={t(key('suspendedFor'))} value={addon.suspendedReason} tone="bad" />
      ) : null}
      {addon.state === 'PENDING_PAYMENT' ? (
        <p className="border-b border-border-subtle py-2.5 text-xs font-medium leading-[1.5] text-pending-700">
          {t(key('pendingPayment'))}
        </p>
      ) : null}
      <Line
        label={t(key('limits'))}
        value={t(key('limitsValue'), {
          connections: addon.limits.connections,
          documents: count(addon.limits.documentsPerMonth),
        })}
      />
      <UsageBar
        label={t(key('connectionsUsed'))}
        used={connected}
        allowance={addon.limits.connections}
        ofLabel={t(key('of'), { used: connected, allowance: addon.limits.connections })}
      />
      <UsageBar
        label={t(key('collected'))}
        used={addon.collectedThisMonth}
        allowance={allowance}
        ofLabel={t(key('of'), {
          used: count(addon.collectedThisMonth),
          allowance: count(allowance),
        })}
      />
      <div className="border-t border-border-subtle py-2.5">
        <p className="text-sm font-medium text-text-tertiary">{t(key('grants'))}</p>
        {addon.grants.length === 0 ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">{t(key('noGrants'))}</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {addon.grants.map((grant) => {
              const live = liveGrants.includes(grant)
              return (
                <li key={grant.id} className="text-xs font-medium leading-[1.5]">
                  <span
                    className={live ? 'text-text-primary' : 'text-text-quaternary line-through'}
                  >
                    {t(key('grantLine'), {
                      documents: count(grant.documents),
                      date: day(grant.expires),
                      by: grant.by,
                    })}
                  </span>
                  <span className="block text-text-quaternary">{grant.reason}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2.5 border-t border-border-subtle py-4">
        {addon.state === 'ACTIVE' ? (
          <>
            <button type="button" onClick={() => onAction('grant')} className={SECONDARY_BUTTON}>
              {t(key('grant'))}
            </button>
            <button type="button" onClick={() => onAction('suspend')} className={DANGER_BUTTON}>
              {t(key('suspend'))}
            </button>
          </>
        ) : addon.state === 'SUSPENDED' ? (
          <button type="button" onClick={() => onAction('resume')} className={SECONDARY_BUTTON}>
            {t(key('resume'))}
          </button>
        ) : null}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ modals */

type ModalProps = {
  tenantId: string
  onClose: () => void
  /** The line the page shows once the store has changed; the modal closes itself first. */
  onDone: (message: string) => void
}

const GRANT_FORM = 'erp-grant-quota'
type GrantField = 'documents' | 'expires' | 'reason'
const GRANT_ORDER: GrantField[] = ['documents', 'expires', 'reason']
const GRANT_CHIPS = [100, 300, 500]

/** Extra extraction documents on top of the add-on's allowance until a date — recorded. */
export function GrantErpQuotaModal({ tenantId, onClose, onDone }: ModalProps) {
  const { t, i18n } = useTranslation()
  const [documents, setDocuments] = useState('')
  const [expires, setExpires] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<GrantField>>({})
  const key = (name: string) => `console.erp.connection.grant.${name}`

  const clear = (field: GrantField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<GrantField> = {}
    const amount = Number(documents.replace(/[,\s]/g, ''))
    if (!documents.trim()) next.documents = t('validation.required')
    else if (!Number.isInteger(amount) || amount <= 0)
      next.documents = t('console.subscriptionActions.error.documents')
    const date = dateOf(expires)
    if (!date) next.expires = t('validation.required')
    else if (expires <= TODAY_KEY) next.expires = t('console.subscriptionActions.error.past')
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !date) {
      focusFirstInvalidField(event.currentTarget, GRANT_ORDER, next)
      return
    }
    consoleErpStore.grantQuota(tenantId, amount, date, reason.trim())
    onDone(
      t(key('done'), {
        tenant: tenantName(tenantId),
        documents: count(amount),
        date: dayLabel(date, i18n.language),
      }),
    )
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t(key('title'))}
      subtitle={t(key('subtitle'), { tenant: tenantName(tenantId) })}
      footer={<ModalFooter formId={GRANT_FORM} onCancel={onClose} submitLabel={t(key('submit'))} />}
    >
      <form id={GRANT_FORM} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div data-field="documents" className="flex flex-col gap-2">
            <Input
              bordered
              name="documents"
              label={t(key('documents'))}
              requiredMark
              inputMode="numeric"
              autoComplete="off"
              value={documents}
              onChange={(event) => {
                setDocuments(event.target.value)
                clear('documents')
              }}
              error={errors.documents}
            />
            <QuickChips
              options={GRANT_CHIPS.map((n) => ({ id: String(n), label: String(n) }))}
              value={documents}
              onPick={(label) => {
                setDocuments(label)
                clear('documents')
              }}
            />
          </div>
          <Field name="expires" label={t(key('expires'))} required error={errors.expires}>
            <DateField
              value={expires}
              onChange={(value) => {
                setExpires(value)
                clear('expires')
              }}
              min={TODAY_KEY}
              ariaLabel={t(key('expires'))}
            />
          </Field>
        </div>
        <TextArea
          name="reason"
          label={t('console.subscriptionActions.common.reason')}
          required
          placeholder={t('console.subscriptionActions.common.reasonPlaceholder')}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            clear('reason')
          }}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}

const STATE_FORM = 'erp-addon-state'

/**
 * Suspend (with the reason that goes on the record) or resume the tenant's add-on. The store's
 * `resumeAddon` takes no reason, so the resume dialog only confirms — and shows why it was
 * suspended, so the operator knows what they are undoing.
 */
export function AddonStateModal({
  mode,
  addon,
  tenantId,
  onClose,
  onDone,
}: ModalProps & { mode: 'suspend' | 'resume'; addon: TenantAddon | undefined }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()
  const tenant = tenantName(tenantId)
  const key = (name: string) => `console.erp.connection.${mode}.${name}`

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (mode === 'suspend') {
      if (!reason.trim()) {
        setError(t('validation.required'))
        focusFirstInvalidField(event.currentTarget, ['reason'], { reason: 'x' })
        return
      }
      consoleErpStore.suspendAddon(tenantId, reason.trim())
    } else {
      consoleErpStore.resumeAddon(tenantId)
    }
    onDone(t(key('done'), { tenant }))
  }

  return (
    <Modal
      open
      width={520}
      onClose={onClose}
      title={t(key('title'))}
      subtitle={t(key('subtitle'), { tenant })}
      footer={
        <ModalFooter
          formId={STATE_FORM}
          onCancel={onClose}
          submitLabel={t(key('submit'))}
          danger={mode === 'suspend'}
        />
      }
    >
      <form id={STATE_FORM} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'suspend' ? (
          <TextArea
            name="reason"
            label={t('console.subscriptionActions.common.reason')}
            required
            placeholder={t('console.subscriptionActions.common.reasonPlaceholder')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setError(undefined)
            }}
            error={error}
          />
        ) : (
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t(key('body'), { reason: addon?.suspendedReason ?? '—' })}
          </p>
        )}
      </form>
    </Modal>
  )
}

/** The add-on card's actions, opened as modals — shared by the connection page and the tenant tab. */
export function AddonActionModals({
  action,
  erp,
  tenantId,
  onClose,
  onDone,
}: {
  action: AddonAction | null
  erp: ConsoleErpState
  tenantId: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  if (!action) return null
  if (action === 'grant')
    return <GrantErpQuotaModal tenantId={tenantId} onClose={onClose} onDone={onDone} />
  return (
    <AddonStateModal
      mode={action}
      addon={erp.addons.find((a) => a.tenantId === tenantId)}
      tenantId={tenantId}
      onClose={onClose}
      onDone={onDone}
    />
  )
}

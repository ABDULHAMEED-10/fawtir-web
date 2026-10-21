import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Input, OmAmount, Select } from '../../../components/ui'
import { selectAllOnFocus } from '../../../components/invoice/numericInput'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { CONSOLE_CARD, ConsoleButton } from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import type { SubscriptionAccess } from '../../../api/settings/subscription'
import {
  BILLING_MANAGE,
  BILLING_READ,
  GRANT_MAX_DOCUMENTS,
  PLANS_MANAGE,
  PLANS_READ,
  TENANTS_MANAGE,
  TRIAL_EXCEPTION_MAX_DAYS,
  companyCountingPath,
  companyExtraDocumentsPath,
  companyPaidExtrasPath,
  companySubscriptionPath,
  countingChoiceOf,
  describeCompanySubscriptionFailure,
  grantExtraDocuments,
  grantTrialException,
  setCompanyCounting,
  type CompanyCountingDto,
  type CompanyExtraDocumentsDto,
  type CompanyPaidExtrasDto,
  type CountingChoice,
  type LifecycleEventDto,
  type PlatformSubscriptionDto,
} from '../../../lib/console/companySubscription'
import { formatAmount, formatCount, formatDate, formatInstant } from '../../../lib/format'
import type { PaidExtraPlaceDto, PlaceKindOverviewDto } from '../../../api/settings/paidExtras'
import { hasPermission } from '../../../lib/identity/entitlements'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'
import { Field } from '../subscriptions/modalFields'
import { GiveBackDialog } from './GiveBackDialog'
import { FawtirCancellationBlock, ProposeCancellationDialog, UpgradeDialog } from './StaffActions'

const K = 'console.companySubscription.'

/**
 * A real company's subscription on the console's tenant page (P2-4 §3.8), read from the platform
 * routes the backend serves today, each card hidden without the permission its read needs:
 *
 * 1. Subscription: state, plan, trial, paid time, grace and renewal; the trial exception, the
 *    upgrade at no charge (PC-5) and cancel at once for abuse or fraud with a second operator's
 *    confirmation (CA-7, CA-9).
 * 2. Allowance: this month's documents and the extra-document credits; the temporary grant, and
 *    giving back documents a platform fault cost the customer (AL-F4, CON-10).
 * 3. Paid extras: users and branches against included plus paid places, the ERP add-on and
 *    whether it granted ERP, and the places (read only; nothing is granted from here).
 * 4. Received-document counting, for Enterprise companies only; the override.
 * 5. History: the lifecycle events the subscription read carries, newest first.
 *
 * TODO(backend): CONSOLE.md 2.1–2.3: bills and payments for one company, a history that names the
 * operator and covers grants and plan changes, and "would be read-only" while restrictions are off. Not drawn
 * until the reads exist; the sample-data tab this replaces never reached the server.
 */
export function CompanySubscriptionCards({
  tenantId,
  tenantCode,
}: {
  tenantId: string
  tenantCode: string
}) {
  const { entitlements } = useEntitlements()
  const may = (permission: string) =>
    entitlements !== null && hasPermission(entitlements, permission)
  return (
    <>
      {may(BILLING_READ) ? (
        <SubscriptionCards
          tenantId={tenantId}
          tenantCode={tenantCode}
          canManage={may(BILLING_MANAGE)}
          canUpgrade={may(TENANTS_MANAGE) && may(PLANS_READ)}
        />
      ) : null}
      {may(BILLING_READ) ? (
        <AllowanceCard
          tenantId={tenantId}
          canManage={may(BILLING_MANAGE)}
          canGiveBack={may(TENANTS_MANAGE)}
        />
      ) : null}
      {may(BILLING_READ) ? <PaidExtrasCard tenantId={tenantId} /> : null}
      {may(PLANS_READ) ? <CountingCard tenantId={tenantId} canManage={may(PLANS_MANAGE)} /> : null}
    </>
  )
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-sm bg-surface-card p-5">
      <h2 id={id} className="text-[17px] font-semibold text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Label and value pairs, two columns from `md`, one on a phone. */
function Facts({ rows }: { rows: Array<[string, ReactNode] | null> }) {
  const shown = rows.filter((row): row is [string, ReactNode] => row !== null)
  if (shown.length === 0) return null
  return (
    <dl className="grid gap-x-5 gap-y-4 md:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {label}
          </dt>
          <dd className="text-sm font-medium leading-[1.6] text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const ACCESS_TONE: Record<SubscriptionAccess, ConsolePillTone> = {
  NOT_TRACKED: 'neutral',
  TRIAL: 'info',
  ACTIVE: 'success',
  GRACE: 'pending',
  PAYMENT_REQUIRED: 'danger',
  CANCELLED: 'neutral',
}

/** Whole days from one business date to another, inclusive of both. */
function daysInclusive(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  )
}

function SubscriptionCards({
  tenantId,
  tenantCode,
  canManage,
  canUpgrade,
}: {
  tenantId: string
  tenantCode: string
  canManage: boolean
  canUpgrade: boolean
}) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const { read, retry } = useConsoleRead<PlatformSubscriptionDto>(companySubscriptionPath(tenantId))
  const [changed, setChanged] = useState<PlatformSubscriptionDto | null>(null)
  const [dialog, setDialog] = useState<'trial' | 'upgrade' | 'cancel' | null>(null)
  const [days, setDays] = useState('')
  const [daysError, setDaysError] = useState<string | undefined>()
  const title = t(`${K}title`)

  if (read.status === 'loading') {
    return (
      <Card id="company-subscription" title={title}>
        <ConsoleNotice busy body={t(`${K}loading`)} />
      </Card>
    )
  }
  if (read.status === 'failed') {
    return (
      <Card id="company-subscription" title={title}>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </Card>
    )
  }

  const { status, events, fawtirCancellation, fawtirCancellationEnabled } = changed ?? read.data
  const day = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : null)
  const access = status.access in ACCESS_TONE ? status.access : 'NOT_TRACKED'
  const trialLength =
    status.trialStartsOn && status.trialEndsOn
      ? daysInclusive(status.trialStartsOn, status.trialEndsOn)
      : null
  const closeDialog = () => {
    setDays('')
    setDaysError(undefined)
    setDialog(null)
  }
  // The writes below answer with something other than this read, so the card reads again.
  const reload = () => {
    setDialog(null)
    setChanged(null)
    retry()
  }
  const open = status.access !== 'CANCELLED'
  const proposalOpen = fawtirCancellation?.status === 'PROPOSED'
  const mayUpgrade = canUpgrade && status.tracked && open && !status.enterprise
  const mayCancel =
    canManage && status.tracked && open && Boolean(fawtirCancellationEnabled) && !proposalOpen

  return (
    <>
      <Card id="company-subscription" title={title}>
        <div className="flex flex-wrap items-center gap-3">
          <ConsoleStatusPill tone={ACCESS_TONE[access]} label={t(`${K}access.${access}`)} />
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {status.billingCycle
              ? t(`${K}planWithCycle`, {
                  plan: status.planName,
                  cycle: t(`${K}cycle.${status.billingCycle}`),
                })
              : status.planName}
          </p>
          {status.periodPrice ? (
            <OmAmount amount={status.periodPrice} amountClassName="text-sm font-semibold" />
          ) : null}
        </div>
        {!status.tracked ? (
          <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}notTrackedBody`)}</p>
        ) : null}
        <Facts
          rows={[
            status.trialDay !== null && trialLength !== null
              ? [t(`${K}trial`), t(`${K}trialDay`, { day: status.trialDay, length: trialLength })]
              : null,
            status.trialEndsOn ? [t(`${K}trialEnds`), day(status.trialEndsOn)] : null,
            status.paidThrough ? [t(`${K}paidThrough`), day(status.paidThrough)] : null,
            status.graceUntil ? [t(`${K}graceUntil`), day(status.graceUntil)] : null,
            status.renewsOn ? [t(`${K}renewsOn`), day(status.renewsOn)] : null,
            status.cancelAtPeriodEnd
              ? [t(`${K}cancelsAtPeriodEnd`), day(status.accessEndsOn) ?? t(`${K}yes`)]
              : status.accessEndsOn
                ? [t(`${K}accessEnds`), day(status.accessEndsOn)]
                : null,
            status.scheduledChange
              ? [
                  t(`${K}scheduledChange`),
                  t(`${K}scheduledChangeValue`, {
                    plan: status.scheduledChange.planName,
                    date: day(status.scheduledChange.effectiveOn),
                  }),
                ]
              : null,
          ]}
        />
        {fawtirCancellation ? (
          <FawtirCancellationBlock
            tenantId={tenantId}
            cancellation={fawtirCancellation}
            me={entitlements?.userId ?? null}
            canManage={canManage}
            enabled={Boolean(fawtirCancellationEnabled)}
            onChanged={reload}
          />
        ) : null}
        {(canManage && status.tracked) || mayUpgrade || mayCancel ? (
          <div className="flex flex-wrap gap-2.5">
            {canManage && status.tracked ? (
              <ConsoleButton variant="secondary" onClick={() => setDialog('trial')}>
                {t(`${K}trialException.open`)}
              </ConsoleButton>
            ) : null}
            {mayUpgrade ? (
              <ConsoleButton variant="secondary" onClick={() => setDialog('upgrade')}>
                {t(`${K}upgrade.open`)}
              </ConsoleButton>
            ) : null}
            {mayCancel ? (
              <ConsoleButton variant="danger" onClick={() => setDialog('cancel')}>
                {t(`${K}cancel.open`)}
              </ConsoleButton>
            ) : null}
          </div>
        ) : null}
      </Card>

      <HistoryCard events={events} />

      {dialog === 'upgrade' ? (
        <UpgradeDialog
          tenantId={tenantId}
          currentPlan={status.planCode}
          onDone={reload}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'cancel' ? (
        <ProposeCancellationDialog
          tenantId={tenantId}
          tenantCode={tenantCode}
          restrictionsEnforced={status.restrictionsEnforced}
          onDone={reload}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'trial' ? (
        <OperatorReasonDialog<PlatformSubscriptionDto>
          formId="company-trial-exception"
          title={t(`${K}trialException.title`)}
          body={t(`${K}trialException.body`)}
          fields={
            <Input
              bordered
              name="days"
              label={t(`${K}trialException.days`)}
              requiredMark
              inputMode="numeric"
              autoComplete="off"
              onFocus={selectAllOnFocus}
              hint={t(`${K}trialException.daysHint`, { max: TRIAL_EXCEPTION_MAX_DAYS })}
              value={days}
              onChange={(event) => {
                setDays(event.target.value)
                setDaysError(undefined)
              }}
              error={daysError}
            />
          }
          validate={() => {
            if (wholeBetween(days, 1, TRIAL_EXCEPTION_MAX_DAYS)) return undefined
            setDaysError(t(`${K}error.wholeBetween`, { min: 1, max: TRIAL_EXCEPTION_MAX_DAYS }))
            return 'days'
          }}
          confirmLabel={t(`${K}trialException.confirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) => grantTrialException(tenantId, Number(days.trim()), reason)}
          describeFailure={describeCompanySubscriptionFailure}
          onDone={(answer) => {
            setChanged(answer)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      ) : null}
    </>
  )
}

function wholeBetween(value: string, min: number, max: number): boolean {
  return /^\d{1,6}$/.test(value.trim()) && Number(value) >= min && Number(value) <= max
}

const EVENT_KINDS = new Set([
  'TRIAL_STARTED',
  'TRIAL_GRANTED',
  'TRIAL_EXTENDED',
  'PAID_PERIOD_EXTENDED',
  'AUTO_RENEW_CHANGED',
  'CANCELLATION_SCHEDULED',
  'CANCELLATION_WITHDRAWN',
  'DOWNGRADE_SCHEDULED',
  'DOWNGRADE_WITHDRAWN',
  'DOWNGRADE_APPLIED',
  'OPERATOR_PLAN_CHANGED',
  'FAWTIR_CANCELLATION_PROPOSED',
  'FAWTIR_CANCELLATION_WITHDRAWN',
  'CANCELLED_BY_FAWTIR',
  'REOPENED_BY_RENEWAL',
])

/** The lifecycle events, newest first, as the server sends them: what, when, by whom and why. */
function HistoryCard({ events }: { events: LifecycleEventDto[] }) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const me = entitlements?.userId ?? null
  return (
    <Card id="company-subscription-history" title={t(`${K}history.title`)}>
      {events.length === 0 ? (
        <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}history.empty`)}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li
              key={event.id}
              className={`${CONSOLE_CARD} flex flex-col gap-1 border border-border-subtle p-4`}
            >
              <span className="text-sm font-semibold text-text-primary">
                {t(`${K}history.kind.${EVENT_KINDS.has(event.kind) ? event.kind : 'OTHER'}`)}
              </span>
              <span className="text-xs font-medium text-text-tertiary">
                {[event.reason, formatInstant(event.occurredAt, i18n.language)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="text-xs font-medium text-text-quaternary">
                {t('console.plans.history.by')}{' '}
                {event.actorId === null ? (
                  t('console.plans.history.system')
                ) : event.actorId === me ? (
                  t('console.plans.history.you')
                ) : (
                  <bdi dir="ltr" className="font-mono text-[11px]">
                    {event.actorId}
                  </bdi>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function AllowanceCard({
  tenantId,
  canManage,
  canGiveBack,
}: {
  tenantId: string
  canManage: boolean
  /** `platform.tenants.manage`: the give-back's own permission, Platform tenant admins only. */
  canGiveBack: boolean
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CompanyExtraDocumentsDto>(
    companyExtraDocumentsPath(tenantId),
  )
  const [changed, setChanged] = useState<CompanyExtraDocumentsDto | null>(null)
  const [dialog, setDialog] = useState(false)
  const [giveBack, setGiveBack] = useState(false)
  const [documents, setDocuments] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [errors, setErrors] = useState<{ documents?: string; expiresOn?: string }>({})
  const title = t(`${K}allowance.title`)

  if (read.status === 'loading') {
    return (
      <Card id="company-allowance" title={title}>
        <ConsoleNotice busy body={t(`${K}allowance.loading`)} />
      </Card>
    )
  }
  if (read.status === 'failed') {
    return (
      <Card id="company-allowance" title={title}>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </Card>
    )
  }

  const { allowance, credits } = changed ?? read.data
  const n = (value: number) => formatCount(value, i18n.language)
  const day = (iso: string) => formatDate(iso, i18n.language)
  const open = () => {
    // The server's default and latest expiry: the end of the current allowance month.
    setExpiresOn(allowance.periodEnd)
    setDialog(true)
  }
  const closeDialog = () => {
    setDocuments('')
    setErrors({})
    setDialog(false)
  }

  return (
    <Card id="company-allowance" title={title}>
      <Facts
        rows={[
          [
            t(`${K}allowance.month`),
            t(`${K}allowance.monthValue`, {
              from: day(allowance.periodStart),
              to: day(allowance.periodEnd),
            }),
          ],
          [
            t(`${K}allowance.used`),
            t(`${K}allowance.usedValue`, {
              used: n(allowance.used),
              total: n(allowance.totalAllowance),
              plan: n(allowance.planDocuments),
              extra: n(allowance.extraDocuments),
            }),
          ],
          [
            t(`${K}allowance.breakdown`),
            t(`${K}allowance.breakdownValue`, {
              issued: n(allowance.issued),
              received: n(allowance.received),
            }),
          ],
          [t(`${K}allowance.left`), n(allowance.left)],
          allowance.receivedHidden > 0
            ? [t(`${K}allowance.held`), n(allowance.receivedHidden)]
            : null,
          [t(`${K}allowance.resetsOn`), day(allowance.resetsOn)],
        ]}
      />
      {!allowance.issuingAllowed ? (
        <p className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700">
          {t(`${K}allowance.issuingStopped`)}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{t(`${K}allowance.credits`)}</h3>
        {credits.length === 0 ? (
          <p className="text-sm leading-[1.6] text-text-secondary">
            {t(`${K}allowance.noCredits`)}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {credits.map((credit) => (
              <li
                key={credit.id}
                className={`${CONSOLE_CARD} flex flex-col gap-1 border border-border-subtle p-4`}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                  {t(`${K}allowance.creditLine`, {
                    source: t(`${K}allowance.source.${sourceKey(credit.source)}`),
                    documents: n(credit.documents),
                  })}
                  <ConsoleStatusPill
                    tone={
                      credit.status === 'ACTIVE'
                        ? 'success'
                        : credit.status === 'PENDING'
                          ? 'pending'
                          : 'neutral'
                    }
                    label={t(`${K}allowance.status.${statusKey(credit.status)}`)}
                  />
                </span>
                <span className="text-xs font-medium text-text-tertiary">
                  {[
                    credit.reason,
                    credit.expiresOn
                      ? t(`${K}allowance.expires`, { date: day(credit.expiresOn) })
                      : null,
                    formatInstant(credit.createdAt, i18n.language),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage || canGiveBack ? (
        <div className="flex flex-wrap gap-2.5">
          {canManage ? (
            <ConsoleButton variant="secondary" onClick={open}>
              {t(`${K}grant.open`)}
            </ConsoleButton>
          ) : null}
          {canGiveBack ? (
            <ConsoleButton variant="secondary" onClick={() => setGiveBack(true)}>
              {t(`${K}giveBack.open`)}
            </ConsoleButton>
          ) : null}
        </div>
      ) : null}

      {dialog ? (
        <OperatorReasonDialog<CompanyExtraDocumentsDto>
          formId="company-extra-documents-grant"
          title={t(`${K}grant.title`)}
          body={t(`${K}grant.body`)}
          fields={
            <>
              <Input
                bordered
                name="documents"
                label={t(`${K}grant.documents`)}
                requiredMark
                inputMode="numeric"
                autoComplete="off"
                onFocus={selectAllOnFocus}
                hint={t(`${K}grant.documentsHint`, { max: n(GRANT_MAX_DOCUMENTS) })}
                value={documents}
                onChange={(event) => {
                  setDocuments(event.target.value)
                  setErrors((current) => ({ ...current, documents: undefined }))
                }}
                error={errors.documents}
              />
              <Field
                name="expiresOn"
                label={t(`${K}grant.expiresOn`)}
                hint={t(`${K}grant.expiresOnHint`, { date: day(allowance.periodEnd) })}
                error={errors.expiresOn}
              >
                <DateField
                  value={expiresOn}
                  ariaLabel={t(`${K}grant.expiresOn`)}
                  max={allowance.periodEnd}
                  onChange={(value) => {
                    setExpiresOn(value)
                    setErrors((current) => ({ ...current, expiresOn: undefined }))
                  }}
                />
              </Field>
            </>
          }
          validate={() => {
            if (!wholeBetween(documents, 1, GRANT_MAX_DOCUMENTS)) {
              setErrors({
                documents: t(`${K}error.wholeBetween`, { min: 1, max: n(GRANT_MAX_DOCUMENTS) }),
              })
              return 'documents'
            }
            if (expiresOn && expiresOn > allowance.periodEnd) {
              setErrors({
                expiresOn: t(`${K}grant.expiresOnLate`, { date: day(allowance.periodEnd) }),
              })
              return 'expiresOn'
            }
            return undefined
          }}
          confirmLabel={t(`${K}grant.confirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) =>
            grantExtraDocuments(tenantId, Number(documents.trim()), expiresOn || null, reason)
          }
          describeFailure={describeCompanySubscriptionFailure}
          onDone={(answer) => {
            setChanged(answer)
            closeDialog()
          }}
          onClose={closeDialog}
        />
      ) : null}
      {giveBack ? (
        <GiveBackDialog
          tenantId={tenantId}
          periodEnd={allowance.periodEnd}
          onDone={(answer) => {
            setChanged(answer)
            setGiveBack(false)
          }}
          onClose={() => setGiveBack(false)}
        />
      ) : null}
    </Card>
  )
}

function sourceKey(source: string): string {
  return source === 'PURCHASE' || source === 'GRANT' || source === 'GIVE_BACK' ? source : 'OTHER'
}

function statusKey(status: string): string {
  return status === 'PENDING' || status === 'ACTIVE' || status === 'CANCELLED' ? status : 'OTHER'
}

/**
 * Count received documents for an Enterprise company; other companies follow their plan (P2-5).
 * Also drawn under the company's Enterprise terms.
 */
export function CountingCard({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CompanyCountingDto>(companyCountingPath(tenantId))
  const [changed, setChanged] = useState<CompanyCountingDto | null>(null)
  const [dialog, setDialog] = useState(false)
  const [choice, setChoice] = useState<CountingChoice>('follow')
  // Set by a version conflict: the dialog keeps its message, and the card reloads once it closes.
  const [stale, setStale] = useState(false)
  const title = t(`${K}counting.title`)

  if (read.status === 'loading') return null
  if (read.status === 'failed') {
    return (
      <Card id="company-counting" title={title}>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </Card>
    )
  }
  const counting = changed ?? read.data
  if (!counting.enterprise) return null

  const day = (iso: string) => formatDate(iso, i18n.language)
  const onOff = (value: boolean) => t(value ? `${K}counting.on` : `${K}counting.off`)
  const current = countingChoiceOf(counting)

  return (
    <Card id="company-counting" title={title}>
      <Facts
        rows={[
          [
            t(`${K}counting.now`, { date: day(counting.monthStartedOn) }),
            onOff(counting.countsReceivedNow),
          ],
          [
            t(`${K}counting.fromNext`, { date: day(counting.nextSubscriptionOn) }),
            onOff(counting.countsReceivedFromNext),
          ],
          [t(`${K}counting.setting`), t(`${K}counting.choice.${current}`)],
        ]}
      />
      <p className="text-sm leading-[1.6] text-text-secondary">{t(`${K}counting.note`)}</p>
      {canManage ? (
        <div>
          <ConsoleButton
            variant="secondary"
            onClick={() => {
              setChoice(current)
              setDialog(true)
            }}
          >
            {t(`${K}counting.open`)}
          </ConsoleButton>
        </div>
      ) : null}
      {dialog ? (
        <OperatorReasonDialog<CompanyCountingDto>
          formId="company-counting-change"
          title={t(`${K}counting.dialogTitle`)}
          body={t(`${K}counting.dialogBody`, { date: day(counting.nextSubscriptionOn) })}
          fields={
            <Field name="countsReceived" label={t(`${K}counting.setting`)}>
              <Select
                value={choice}
                ariaLabel={t(`${K}counting.setting`)}
                onChange={(value) => setChoice(value as CountingChoice)}
                options={(['on', 'off', 'follow'] as const).map((value) => ({
                  value,
                  label: t(`${K}counting.choice.${value}`),
                }))}
              />
            </Field>
          }
          confirmLabel={t(`${K}counting.confirm`)}
          confirmingLabel={t(`${K}sending`)}
          send={(reason) => setCompanyCounting(tenantId, counting.version, choice, reason)}
          describeFailure={(error) => {
            const message = describeCompanySubscriptionFailure(error)
            if (message.key === `${K}refusal.countingConflict`) setStale(true)
            return message
          }}
          onDone={(answer) => {
            setChanged(answer)
            setDialog(false)
          }}
          onClose={() => {
            setDialog(false)
            if (stale) {
              setStale(false)
              setChanged(null)
              retry()
            }
          }}
        />
      ) : null}
    </Card>
  )
}

const PLACE_TONE: Record<PaidExtraPlaceDto['status'], ConsolePillTone> = {
  PENDING: 'pending',
  ACTIVE: 'success',
  CANCELLED: 'neutral',
}

/**
 * P2-1 §3.14: the company's paid extras as the customer sees them (US-1, BR-3, ER-1), plus the
 * add-on's stored state and whether the add-on or an operator granted ERP. Read only.
 */
function PaidExtrasCard({ tenantId }: { tenantId: string }) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<CompanyPaidExtrasDto>(companyPaidExtrasPath(tenantId))
  const P = `${K}paidExtras.`
  const title = t(`${P}title`)

  if (read.status === 'loading') {
    return (
      <Card id="company-paid-extras" title={title}>
        <ConsoleNotice busy body={t(`${P}loading`)} />
      </Card>
    )
  }
  if (read.status === 'failed') {
    return (
      <Card id="company-paid-extras" title={title}>
        <ConsoleReadFailure error={read.error} retry={retry} />
      </Card>
    )
  }

  const { extras, erpAddon } = read.data
  const n = (value: number) => formatCount(value, i18n.language)
  const day = (iso: string) => formatDate(iso, i18n.language)
  const kind = (place: PlaceKindOverviewDto) =>
    place.capacity === null || place.included === null
      ? t(`${P}unlimited`, { inUse: n(place.inUse) })
      : t(`${P}kindValue`, {
          inUse: n(place.inUse),
          capacity: n(place.capacity),
          included: n(place.included),
          paid: n(place.paidPlacesNow),
        })
  const addonValue: ReactNode = !extras.erpAddon.offered ? (
    t(`${P}addonNotOffered`)
  ) : erpAddon === null ? (
    t(`${P}addonNone`)
  ) : (
    <span className="flex flex-wrap items-center gap-2">
      <ConsoleStatusPill
        tone={
          erpAddon.status === 'ACTIVE'
            ? 'success'
            : erpAddon.status === 'ENDED'
              ? 'neutral'
              : 'pending'
        }
        label={t(`${P}addonStatus.${erpAddon.status}`, {
          date: erpAddon.endsOn ? day(erpAddon.endsOn) : '',
        })}
      />
      {erpAddon.endReason ? (
        <span className="text-xs text-text-tertiary">
          {t(`${P}endReason.${erpAddon.endReason}`)}
        </span>
      ) : null}
    </span>
  )

  return (
    <Card id="company-paid-extras" title={title}>
      {!extras.open ? (
        <p className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700">
          {t(`${P}notOpen`)}
        </p>
      ) : null}
      <Facts
        rows={[
          [t(`${P}users`), kind(extras.users)],
          [t(`${P}branches`), kind(extras.branches)],
          [t(`${P}addon`), addonValue],
          erpAddon
            ? [
                t(`${P}entitlement`),
                erpAddon.grantedEntitlement ? t(`${P}grantedByAddon`) : t(`${P}notByAddon`),
              ]
            : null,
          extras.outstanding
            ? [
                t(`${P}outstanding`),
                t(`${P}outstandingValue`, { number: extras.outstanding.bill.number }),
              ]
            : null,
        ]}
      />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{t(`${P}places`)}</h3>
        {extras.places.length === 0 ? (
          <p className="text-sm leading-[1.6] text-text-secondary">{t(`${P}noPlaces`)}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {extras.places.map((place) => (
              <li
                key={place.id}
                className={`${CONSOLE_CARD} flex flex-col gap-1 border border-border-subtle p-4`}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                  {t(`paidExtras.history.kind.${place.kind}`, {
                    count: place.quantity,
                    n: n(place.quantity),
                  })}
                  <ConsoleStatusPill
                    tone={PLACE_TONE[place.status]}
                    label={t(`paidExtras.history.status.${place.status}`)}
                  />
                </span>
                <span className="flex flex-wrap items-center gap-1 text-xs font-medium text-text-tertiary">
                  {[
                    t(`paidExtras.history.source.${place.source}`),
                    t('paidExtras.history.covers', {
                      from: day(place.coversFrom),
                      to: day(place.coversTo),
                    }),
                    formatInstant(place.createdAt, i18n.language),
                  ].join(' · ')}
                  {place.netAmount ? (
                    <>
                      {' · '}
                      <OmAmount
                        amount={formatAmount(place.netAmount, 'OMR', i18n.language)}
                        size="xs"
                      />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

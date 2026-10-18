import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useApiRead, type ApiRead } from '../../hooks'
import { usePlanName } from '../../hooks/usePlanName'
import { useCan } from '../../lib/session/session'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { Button, Modal, OmAmount, SegmentedControl, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ApiError } from '../../api'
import { SectionCard } from '../ErpPage/overview/idiom'
import { OutstandingBill, formatRate } from './SubscriptionBillingSection'
import {
  BILLING_PATH,
  loadBillingOverview,
  type BillingOverviewDto,
} from '../../api/settings/billing'
import {
  PEOPLE_PATH,
  USERS_PERMISSION,
  displayName,
  loadPeople,
  type UserPage,
} from '../../api/settings/people'
import {
  changedPreview,
  newPlanChangeKey,
  previewPlanChange,
  requestPlanChange,
  withdrawPlanChange,
  type BillingCycle,
  type PlanChangeKind,
  type PlanChangePlacesDto,
  type PlanChangePreviewDto,
  type PlanChangeViewDto,
} from '../../api/settings/planChanges'

/** Previewing, confirming and withdrawing are `tenant.plan.manage` on the server. */
const PLAN_MANAGE = 'tenant.plan.manage'

const LIVE_PAYMENT = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']

/** The kinds that issue a PLAN_CHANGE bill and apply once it is paid. */
const CHARGED: PlanChangeKind[] = ['UPGRADE', 'CYCLE_TO_ANNUAL', 'KEEP_PLAN']

/** Every refusal the plan-change routes give that has its own sentence (OpenAPI, P2-2). */
const KNOWN_REFUSALS = [
  'plan-change-unavailable',
  'plan-change-quote-changed',
  'plan-change-already-pending',
  'plan-change-already-paid',
  'plan-change-while-ending',
  'plan-change-via-fawtir',
  'enterprise-terms-scheduled-by-fawtir',
  'plan-upgrade-requires-platform',
  'subscription-change-blocked-by-payment',
  'subscription-state-conflict',
  'billing-not-configured',
  'subscription-not-tracked',
  'disconnected-from-fawtir',
  'idempotency-key-reused',
]

/** Our own sentence for a refusal code; the server's English `detail` is never shown. */
export function planChangeRefusal(t: TFunction, code: string | null | undefined): string {
  if (code && KNOWN_REFUSALS.includes(code)) return t(`planChange.refusal.${code}`)
  return t('billing.refusal.other')
}

function refusalOf(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return t('planChange.refusal.not-found')
    return planChangeRefusal(t, error.problemType)
  }
  return t('billing.refusal.other')
}

/**
 * The company is on its own Enterprise terms (backend #598, #614): the preview lists this first in
 * `blockers` and the request is refused 409. Changes go through Fawtir, so the dialog offers no
 * move, only the sentence and the way to contact the team (P2-5 D4).
 */
export const PLAN_CHANGE_VIA_FAWTIR = 'plan-change-via-fawtir'

function isViaFawtir(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === PLAN_CHANGE_VIA_FAWTIR
}

export type PlanChangeTarget = {
  planCode: string
  cycle: BillingCycle
  /**
   * The subscription is in its free trial (`access` TRIAL on `GET /settings/subscription`). R1: a
   * charged change the server accepts then ends the trial at once, with the paid period from the
   * payment date and no trial days carried over, so the paid-time facts are not promised.
   */
  inTrial?: boolean
}

/**
 * Choose another plan or cycle and see what it does before anything is saved, from the server's
 * `GET /settings/plan/changes/preview` (plan-change table, PC-1, PC-2, PC-4, PY-2). The cycle can be
 * switched inside the dialog; every figure, date and refusal is the server's. Confirming sends the
 * preview's total and version, which the server compares: a moved price comes back with the new
 * figures, shown here before the customer confirms again (SU-4).
 */
export function PlanChangeDialog({
  target,
  onClose,
  onDone,
}: {
  target: PlanChangeTarget | null
  onClose: () => void
  onDone: (change: PlanChangeViewDto, preview: PlanChangePreviewDto) => void
}) {
  const { t } = useTranslation()
  return (
    <Modal open={target !== null} onClose={onClose} title={t('planChange.dialog.title')}>
      {target ? (
        <DialogBody
          key={`${target.planCode}-${target.cycle}`}
          target={target}
          onClose={onClose}
          onDone={onDone}
        />
      ) : null}
    </Modal>
  )
}

function DialogBody({
  target,
  onClose,
  onDone,
}: {
  target: PlanChangeTarget
  onClose: () => void
  onDone: (change: PlanChangeViewDto, preview: PlanChangePreviewDto) => void
}) {
  const { t } = useTranslation()
  const mayManage = useCan(PLAN_MANAGE)
  const [cycle, setCycle] = useState<BillingCycle>(target.cycle)
  const [attempt, setAttempt] = useState(0)
  const [read, setRead] = useState<ApiRead<PlanChangePreviewDto>>({ status: 'loading' })
  const [priceMoved, setPriceMoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // The request was refused because the company's own Enterprise terms are in force.
  const [refusedViaFawtir, setRefusedViaFawtir] = useState(false)
  // One key per confirmation of one set of figures: a retry after a timeout lands on the same change.
  const key = useRef(newPlanChangeKey())
  const inFlight = useRef(false)

  useEffect(() => {
    const request = new AbortController()
    setRead({ status: 'loading' })
    previewPlanChange(target.planCode, cycle, request.signal).then(
      (data) => setRead({ status: 'ready', data }),
      (error: unknown) => {
        if (!request.signal.aborted) setRead({ status: 'failed', error })
      },
    )
    return () => request.abort()
  }, [target.planCode, cycle, attempt])

  const chooseCycle = (next: BillingCycle) => {
    if (next === cycle || busy) return
    key.current = newPlanChangeKey()
    setPriceMoved(false)
    setFailure(null)
    setCycle(next)
  }

  const preview = read.status === 'ready' ? read.data : null
  const viaFawtir =
    refusedViaFawtir ||
    preview?.blockers.includes(PLAN_CHANGE_VIA_FAWTIR) === true ||
    (read.status === 'failed' && isViaFawtir(read.error))
  const canConfirm =
    mayManage &&
    !viaFawtir &&
    preview !== null &&
    preview.kind !== 'NONE' &&
    preview.blockers.length === 0

  const confirm = async () => {
    if (!preview || !canConfirm || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      const change = await requestPlanChange(
        {
          planCode: preview.to.planCode,
          billingCycle: preview.to.cycle,
          expectedTotal: preview.charge?.total ?? null,
          expectedPlanVersionId: preview.to.planVersionId,
        },
        key.current,
      )
      onDone(change, preview)
    } catch (error) {
      const fresh = changedPreview(error)
      if (fresh) {
        // The figures moved since they were shown: show the new ones and ask again (SU-4).
        key.current = newPlanChangeKey()
        setRead({ status: 'ready', data: fresh })
        setPriceMoved(true)
      } else {
        setRefusedViaFawtir(isViaFawtir(error))
        setFailure(refusalOf(t, error))
      }
      setBusy(false)
    } finally {
      inFlight.current = false
    }
  }

  let body: ReactNode
  if (viaFawtir) body = <ViaFawtir />
  else if (read.status === 'loading') body = <LoadingNotice />
  else if (read.status === 'failed')
    body =
      read.error instanceof ApiError && read.error.status !== 401 && read.error.status < 500 ? (
        <Alert>{refusalOf(t, read.error)}</Alert>
      ) : (
        <ApiReadFailure error={read.error} retry={() => setAttempt((value) => value + 1)} />
      )
  else body = <PreviewBody preview={read.data} inTrial={target.inTrial === true} />

  return (
    <div className="flex flex-col gap-5">
      {viaFawtir ? null : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium leading-[1.2] text-text-primary">
            {t('planChange.dialog.cycle')}
          </span>
          <SegmentedControl<BillingCycle>
            ariaLabel={t('planChange.dialog.cycle')}
            value={cycle}
            onChange={chooseCycle}
            className="w-[220px]"
            options={[
              { value: 'MONTHLY', label: t('subscription.cycle.MONTHLY') },
              { value: 'ANNUAL', label: t('subscription.cycle.ANNUAL') },
            ]}
          />
        </div>
      )}
      {priceMoved ? <Callout>{t('planChange.dialog.priceChanged')}</Callout> : null}
      {body}
      {failure && !viaFawtir ? <Alert>{failure}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" size="md" disabled={busy} onClick={onClose}>
          {t('planChange.dialog.back')}
        </Button>
        {preview && canConfirm ? (
          <Button size="md" disabled={busy} aria-busy={busy} onClick={confirm}>
            {t(`planChange.dialog.confirm.${preview.kind}`)}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** What the change does, in the server's figures, kind by kind. */
function PreviewBody({ preview, inTrial }: { preview: PlanChangePreviewDto; inTrial: boolean }) {
  const { t, i18n } = useTranslation()
  const planName = usePlanName()
  const date = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : '')
  const n = (value: number) => formatCount(value, i18n.language)
  const amount = (value: string) => formatAmount(value, 'OMR', i18n.language)
  const money = (value: string, prefix?: string) => (
    <OmAmount amount={amount(value)} size="xs" prefix={prefix} />
  )
  const from = planName(preview.from.planCode, preview.from.planName)
  const to = planName(preview.to.planCode, preview.to.planName)
  const charge = preview.charge
  const charged = CHARGED.includes(preview.kind)
  const atOnce = preview.applies === 'AT_ONCE' || preview.applies === 'AT_ONCE_WHEN_PAID'
  // R1: only once the server offers the charged change; while it is refused, the blocker says why.
  const endsTrial = inTrial && charged && preview.blockers.length === 0

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-semibold leading-[1.4] text-text-primary">
        {t(`planChange.kind.${preview.kind}`, { from, to, date: date(preview.effectiveOn) })}
      </p>

      {charge ? (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3 text-sm">
            {charge.periods.map((period) => (
              <Line
                key={period.startsOn}
                label={t('planChange.charge.period', {
                  start: date(period.startsOn),
                  end: date(period.endsOn),
                  remaining: n(period.remainingDays),
                  total: n(period.totalDays),
                })}
                value={money(period.amount)}
              />
            ))}
            {preview.kind === 'CYCLE_TO_ANNUAL' ? (
              <>
                <Line
                  label={t('planChange.charge.annualPrice', { plan: to })}
                  value={money(preview.to.periodPrice)}
                />
                {Number(charge.credit) > 0 ? (
                  <Line label={t('planChange.charge.credit')} value={money(charge.credit, '−')} />
                ) : null}
              </>
            ) : null}
            {charge.extras.map((extra) => (
              <Line
                key={extra.type}
                label={withRial(
                  t(`planChange.charge.extra.${extra.type}`, {
                    n: n(extra.count),
                    unit: amount(extra.annualUnitPrice),
                    credit: amount(extra.credit),
                  }),
                )}
                value={money(extra.amount)}
              />
            ))}
            {/* Rate 0 is how the server says no VAT is charged: no line, rather than "VAT 0%". */}
            {Number(charge.vatRate) === 0 ? null : (
              <Line
                label={t('billing.bill.vat', { rate: formatRate(charge.vatRate, i18n.language) })}
                value={money(charge.vatAmount)}
              />
            )}
            <Line label={t('billing.bill.total')} value={money(charge.total)} strong />
          </dl>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">
            {withRial(
              preview.kind === 'CYCLE_TO_ANNUAL'
                ? t('planChange.charge.payNowAnnual', {
                    total: amount(charge.total),
                    date: date(charge.newPaidThrough ?? charge.windowEndsOn),
                  })
                : charge.includesToday
                  ? t('planChange.charge.payNow', {
                      count: charge.daysLeft,
                      total: amount(charge.total),
                      n: n(charge.daysLeft),
                      date: date(charge.windowEndsOn),
                    })
                  : t('planChange.charge.payNowFrom', {
                      count: charge.daysLeft,
                      total: amount(charge.total),
                      n: n(charge.daysLeft),
                      start: date(charge.windowStartsOn),
                      end: date(charge.windowEndsOn),
                    }),
            )}
          </p>
        </div>
      ) : preview.kind === 'DOWNGRADE' || preview.kind === 'CYCLE_TO_MONTHLY' ? (
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {withRial(
            t('planChange.charge.nothingNow', {
              date: date(preview.effectiveOn),
              price: amount(preview.to.periodPrice),
              cycle: t(`planChange.per.${preview.to.cycle}`),
            }),
          )}
        </p>
      ) : null}

      <ul className="flex list-disc flex-col gap-2 ps-5 text-sm font-medium leading-[1.6] text-text-secondary">
        {preview.kind !== 'NONE' && preview.allowance.afterChange !== preview.allowance.now ? (
          <li>
            {atOnce
              ? t('planChange.fact.allowanceAtOnce', {
                  after: n(preview.allowance.afterChange),
                  used: n(preview.allowance.used),
                })
              : t('planChange.fact.allowanceOnDate', {
                  after: n(preview.allowance.afterChange),
                  date: date(preview.effectiveOn),
                })}
          </li>
        ) : null}
        {endsTrial ? <li>{t('planChange.fact.endsTrial')}</li> : null}
        {preview.kind !== 'NONE' && preview.subscriptionDate !== null && !inTrial ? (
          <li>{t('planChange.fact.subscriptionDate', { day: n(preview.subscriptionDate) })}</li>
        ) : null}
        {preview.cycleChangeOn ? (
          <li>{t('planChange.fact.cycleChangeOn', { date: date(preview.cycleChangeOn) })}</li>
        ) : null}
        {charged ? <li>{t('planChange.fact.withdrawUntilPaid')}</li> : null}
        {preview.applies === 'ON_DATE' ? (
          <li>{t('planChange.fact.withdrawBefore', { date: date(preview.effectiveOn) })}</li>
        ) : null}
      </ul>

      <Losses preview={preview} />

      {preview.blockers.length > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
        >
          <p className="font-semibold">{t('planChange.blockers')}</p>
          {preview.blockers.map((code) => (
            <p key={code}>{planChangeRefusal(t, code)}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * PC-1: what a smaller plan takes away, before confirming: the features the new plan lacks, the
 * ERP add-on stopping, and the users and branches above it with who would go by default.
 */
function Losses({ preview }: { preview: PlanChangePreviewDto }) {
  const { t, i18n } = useTranslation()
  const date = formatDate(preview.effectiveOn ?? '', i18n.language)
  const atOnce = preview.applies !== 'ON_DATE'
  const plan = usePlanName()(preview.to.planCode, preview.to.planName)
  const known = preview.lostFeatures
    .map((key) => t(`plan.featureName.${key}`, { defaultValue: '' }))
    .filter((label) => label !== '')
  const unknown = preview.lostFeatures.length - known.length
  const usersOver = (preview.users?.overBy ?? 0) > 0
  const branchesOver = (preview.branches?.overBy ?? 0) > 0
  if (preview.lostFeatures.length === 0 && !preview.erpAddonStops && !usersOver && !branchesOver)
    return null

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border-subtle px-4 py-3 text-sm font-medium leading-[1.6] text-text-secondary">
      {preview.lostFeatures.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">
            {atOnce
              ? t('planChange.loss.featuresAtOnce', { plan })
              : t('planChange.loss.features', { plan, date })}
          </p>
          <ul className="list-disc ps-5">
            {known.map((label) => (
              <li key={label}>{label}</li>
            ))}
            {unknown > 0 ? <li>{t('planChange.loss.otherFeatures')}</li> : null}
          </ul>
          <p className="text-xs text-text-tertiary">{t('planChange.loss.recordsStay')}</p>
        </div>
      ) : null}
      {preview.erpAddonStops ? (
        <p>{atOnce ? t('planChange.loss.erpAtOnce') : t('planChange.loss.erp', { date })}</p>
      ) : null}
      {usersOver && preview.users ? (
        <PlacesOver kind="users" places={preview.users} plan={plan} date={date} />
      ) : null}
      {branchesOver && preview.branches ? (
        <PlacesOver kind="branches" places={preview.branches} plan={plan} date={date} />
      ) : null}
      {usersOver || branchesOver ? (
        <p className="text-xs text-text-tertiary">{t('planChange.loss.chooseLater')}</p>
      ) : null}
    </div>
  )
}

function PlacesOver({
  kind,
  places,
  plan,
  date,
}: {
  kind: 'users' | 'branches'
  places: PlanChangePlacesDto
  plan: string
  date: string
}) {
  const { t, i18n } = useTranslation()
  const n = (value: number) => formatCount(value, i18n.language)
  // Names come from the team list, which needs its own permission; without it the count stands.
  const mayReadPeople = useCan(USERS_PERMISSION)
  const people = useApiRead<UserPage>(
    kind === 'users' && mayReadPeople ? PEOPLE_PATH : null,
    loadPeople,
  ).read
  const names =
    kind === 'users' && people.status === 'ready'
      ? places.defaultSwitchOff
          .map((id) => people.data.content.find((user) => user.id === id))
          .filter((user) => user !== undefined)
          .map((user) => displayName(user))
      : []
  return (
    <div className="flex flex-col gap-1">
      <p>
        {t(`planChange.loss.${kind}`, {
          count: places.overBy,
          plan,
          included: n(places.included ?? 0),
          inUse: n(places.inUse),
          n: n(places.overBy),
          date,
        })}
      </p>
      {names.length > 0 ? (
        <p className="text-xs text-text-tertiary">
          {t('planChange.loss.byDefault', { names: names.join(t('planChange.loss.separator')) })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The charged change waiting for payment (`pending` from `GET /settings/plan/changes`): what it is,
 * its PLAN_CHANGE bill and the same payment form as Bills and payment. It can be withdrawn while its
 * bill is open and nothing has been sent for it ("not after it is paid"); the server voids the bill.
 * Without `tenant.plan.manage` the bill is shown with no way to pay or withdraw.
 */
export function PendingPlanChangeCard({
  change,
  onChanged,
  inTrial = false,
}: {
  change: PlanChangeViewDto
  onChanged: (why?: string) => void
  /** R1: paying it ends the free trial, so "your subscription date stays the same" is not said. */
  inTrial?: boolean
}) {
  const { t, i18n } = useTranslation()
  const mayManage = useCan(PLAN_MANAGE)
  const planName = usePlanName()
  const plan = planName(change.toPlanCode, change.bill?.planName ?? change.toPlanCode)
  const billing = useApiRead<BillingOverviewDto>(
    change.bill ? BILLING_PATH : null,
    loadBillingOverview,
  )
  const [reportedCards, setReportedCards] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const date = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : '')

  const withdraw = async () => {
    if (!change.id) return
    setBusy(true)
    setFailure(null)
    try {
      await withdrawPlanChange(change.id)
      onChanged(t('planChange.pending.withdrawn'))
    } catch (error) {
      setFailure(refusalOf(t, error))
      setBusy(false)
    }
  }

  let body: ReactNode = null
  if (!change.bill) body = null
  else if (billing.read.status === 'loading') body = <LoadingNotice />
  else if (billing.read.status === 'failed')
    body = <ApiReadFailure error={billing.read.error} retry={billing.retry} />
  else {
    // Its payments and the card option come from Bills and payment; without the row the bill is
    // shown with no way to pay, rather than a way that could invite paying twice.
    const listed = billing.read.data.bills.find((entry) => entry.bill.id === change.bill?.id)
    const payments = listed?.payments ?? []
    const live = payments.some((payment) => LIVE_PAYMENT.includes(payment.status))
    const withdrawable =
      mayManage &&
      change.id !== null &&
      (listed?.bill ?? change.bill).status === 'OPEN' &&
      !live &&
      listed?.card?.reason !== 'CARD_PAYMENT_UNDER_REVIEW'
    body = (
      <div className="flex flex-col gap-4">
        <OutstandingBill
          key={change.bill.id + (listed?.bill.status ?? change.bill.status)}
          bill={listed?.bill ?? change.bill}
          payments={payments}
          card={listed?.card ?? null}
          overview={billing.read.data}
          canPay={mayManage && listed !== undefined}
          reportedCards={reportedCards}
          onChanged={onChanged}
          onCardFinished={(paymentId, why) => {
            setReportedCards((seen) => new Set(seen).add(paymentId))
            onChanged(why)
          }}
          subtotalLabel={t(`planChange.pending.line.${change.kind}`, { plan })}
        />
        {withdrawable ? (
          <div>
            <Button variant="ghost" size="md" disabled={busy} onClick={withdraw}>
              {t('planChange.pending.withdraw')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <SectionCard
      title={t('planChange.pending.title')}
      note={t(
        inTrial && i18n.exists(`planChange.pending.noteTrial.${change.kind}`)
          ? `planChange.pending.noteTrial.${change.kind}`
          : `planChange.pending.note.${change.kind}`,
        {
          plan,
          date: date(change.newPaidThrough),
        },
      )}
    >
      <div className="flex flex-col gap-4 p-5 pt-0">
        {change.cycleChangeOn ? (
          <p className="text-sm font-medium text-text-secondary">
            {t('planChange.fact.cycleChangeOn', { date: date(change.cycleChangeOn) })}
          </p>
        ) : null}
        {body}
        {failure ? <Alert>{failure}</Alert> : null}
      </div>
    </SectionCard>
  )
}

/** The sentence the Plan page shows once a change went through. */
export function planChangeDone(
  t: TFunction,
  change: PlanChangeViewDto,
  preview: PlanChangePreviewDto,
  plan: string,
  language: string,
): string {
  if (change.status === 'PENDING_PAYMENT') return t('planChange.done.billIssued')
  if (change.applies === 'ON_DATE')
    return t(
      change.kind === 'CYCLE_TO_MONTHLY'
        ? 'planChange.done.monthlyFrom'
        : 'planChange.done.scheduled',
      { plan, date: formatDate(change.effectiveOn ?? preview.effectiveOn ?? '', language) },
    )
  if (change.applies === 'AT_ONCE') return t('planChange.done.atOnce', { plan })
  return t('planChange.done.nothing')
}

function Line({
  label,
  value,
  strong = false,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}
      >
        {label}
      </dt>
      <dd
        className={
          strong
            ? 'shrink-0 font-semibold text-text-primary'
            : 'shrink-0 font-medium text-text-primary'
        }
      >
        {value}
      </dd>
    </div>
  )
}

/** No self-service move on the company's own Enterprise terms: say so and point to the team. */
function ViaFawtir() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-start gap-3">
      <Callout>{t('planChange.refusal.plan-change-via-fawtir')}</Callout>
      <Link
        to="/contact"
        className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
      >
        {t('plans.talkToTeam')}
      </Link>
    </div>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {children}
    </p>
  )
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
    >
      {children}
    </p>
  )
}

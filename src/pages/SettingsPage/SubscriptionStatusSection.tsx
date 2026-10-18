import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { usePlanName } from '../../hooks/usePlanName'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { formatAmount, formatDate } from '../../lib/format'
import { Button, Modal, OmAmount, withRial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ApiError } from '../../api'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  scheduleCancellation,
  withdrawCancellation,
  subscriptionDisplay,
  withdrawScheduledChange,
  waitingWording,
  withdrawalOf,
  type SubscriptionDisplay,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import {
  PLAN_CHANGES_PATH,
  loadPlanChanges,
  type PlanChangesDto,
} from '../../api/settings/planChanges'
import { PlanChangeDialog, planChangeDone, type PlanChangeTarget } from './PlanChangeSection'

const ACCESS_TONE: Record<SubscriptionDisplay, string> = {
  NOT_TRACKED: 'bg-primary-50 text-primary-800',
  TRIAL: 'bg-primary-50 text-primary-800',
  ACTIVE: 'bg-success-100 text-success-700',
  GRACE: 'bg-pending-100 text-pending-700',
  PAYMENT_REQUIRED: 'bg-danger-100 text-danger-700',
  NOT_STARTED: 'bg-pending-100 text-pending-700',
  CANCELLED: 'bg-primary-25 text-primary-800',
}

/** The owner's reminder starts on day 10 of the 14-day trial (reply of 9 Oct 2026). */
const TRIAL_REMINDER_FROM_DAY = 10

type Pending = 'cancel' | 'keep' | 'withdrawChange' | null

/**
 * Where the subscription stands, from `GET /v1/settings/subscription`: the same section on
 * Settings › Plan and Settings › Billing, so both pages show one set of dates.
 *
 * `page` says which of the two it sits on, because "payment is due" must point somewhere true:
 * on Bills and payment the ways to pay are right below it, on Plan they are on the other page.
 * It used to say "contact Fawtir to pay" on both, directly above a working bank-transfer and cash
 * form (BILLING-UX-01). When no way to pay is usable, the billing section itself says so.
 *
 * There is no pay button and no auto-renew switch. The backend has no payment provider yet, and
 * a button that looked like it paid would be the thing the owner asked us never to show. A
 * customer who owes payment is told so in words, and that their invoices, reports and exports
 * stay available.
 */
export function SubscriptionStatusSection({
  page,
  onPlanChanged,
  onAction,
}: {
  page: 'billing' | 'plan'
  /** Before an action taken here: the page drops the sentence an earlier action left above. */
  onAction?: () => void
  /** After a plan change made from here (keeping the plan, P2-2 D3): the page reads everything again. */
  onPlanChanged?: (why?: string) => void
}) {
  const { t, i18n } = useTranslation()
  const day = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : '')
  const read = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription)
  const { entitlements } = useEntitlements()
  const canManage = entitlements !== null && hasPermission(entitlements, 'tenant.plan.manage')
  const [latest, setLatest] = useState<SubscriptionStatusDto | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  // The key of the message to show; a payment being checked blocks a change for a known reason.
  const [failure, setFailure] = useState<string | null>(null)
  const planName = usePlanName()
  // P2-2: with self-service changes open, a downgrade already paid for at the lower price is kept
  // back by paying the difference (KEEP_PLAN), through the change dialog. Off, nothing changes here.
  const changes = useApiRead<PlanChangesDto>(PLAN_CHANGES_PATH, loadPlanChanges).read
  const selfService = changes.status === 'ready' && changes.data.available
  const [keepTarget, setKeepTarget] = useState<PlanChangeTarget | null>(null)

  if (read.read.status === 'loading') return <LoadingNotice />
  if (read.read.status === 'failed') return <ApiReadFailure error={read.read.error} retry={read.retry} />
  const status = latest ?? read.read.data
  const display = subscriptionDisplay(status)
  const scheduled = status.scheduledChange
  const wording = scheduled ? waitingWording(status, scheduled) : null
  const withdrawal = scheduled ? withdrawalOf(status, scheduled, selfService) : 'NONE'

  const act = async (which: Exclude<Pending, null>, call: () => Promise<SubscriptionStatusDto>) => {
    setPending(which)
    setFailure(null)
    onAction?.()
    try {
      setLatest(await call())
      setConfirmCancel(false)
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.problemType === 'subscription-change-blocked-by-payment'
          ? 'subscription.blockedByPayment'
          : error instanceof ApiError && error.problemType === 'subscription-cancelled-by-fawtir'
            ? 'subscription.cancelledByFawtirRefusal'
            : 'subscription.actionFailed',
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <section aria-labelledby="subscription-standing" className="flex flex-col gap-4 rounded-md bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="subscription-standing" className="text-lg font-semibold text-text-primary">
          {t('subscription.title')}
        </h3>
        <span className={['rounded-full px-3 py-1 text-xs font-semibold', ACCESS_TONE[display]].join(' ')}>
          {t(`subscription.access.${display}`)}
        </span>
      </div>

      <StandingNotice status={status} page={page} />

      {status.tracked ? <Facts status={status} /> : null}

      {status.scheduledChange ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-background px-4 py-3">
          <p className="text-sm font-medium text-text-secondary">
            {wording === 'enterprise'
              ? // New Enterprise terms Fawtir set for the next renewal, not a plan the customer chose.
                withRial(
                  t('subscription.enterpriseChange', {
                    date: day(status.scheduledChange.effectiveOn),
                    price: formatAmount(status.scheduledChange.periodPrice, 'OMR', i18n.language),
                    cycle: t(
                      status.scheduledChange.billingCycle === 'ANNUAL'
                        ? 'subscription.enterpriseCycle.ANNUAL'
                        : 'subscription.enterpriseCycle.MONTHLY',
                    ),
                  }),
                )
              : wording === 'toMonthly'
                ? t('planChange.waiting.toMonthly', { date: day(status.scheduledChange.effectiveOn) })
                : t('subscription.scheduledChange', {
                    plan: planName(status.scheduledChange.planCode, status.scheduledChange.planName),
                    date: day(status.scheduledChange.effectiveOn),
                  })}
          </p>
          {canManage ? (
            <div className="flex flex-wrap gap-3">
              {/* Who and which branches go off at renewal when the new plan has fewer (BR-5, US-4). */}
              <Link
                to="/settings/plan/switch-off"
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('subscription.switchOff.open')}
              </Link>
              {/* D4: Enterprise terms change only through Fawtir (withdrawal NONE). */}
              {withdrawal === 'KEEP_PLAN' ? (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={pending !== null}
                  onClick={() =>
                    setKeepTarget({ planCode: status.planCode, cycle: status.billingCycle ?? 'MONTHLY' })
                  }
                >
                  {t('planChange.keep', { plan: planName(status.planCode, status.planName) })}
                </Button>
              ) : withdrawal === 'FREE' ? (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={pending !== null}
                  onClick={() => act('withdrawChange', withdrawScheduledChange)}
                >
                  {t('subscription.withdrawChange')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {canManage && status.tracked ? (
        <div className="flex flex-wrap gap-3">
          {status.cancelAtPeriodEnd &&
          !status.cancelledByFawtir &&
          (status.access === 'TRIAL' || status.access === 'ACTIVE') ? (
            <Button
              variant="secondary"
              size="md"
              disabled={pending !== null}
              onClick={() => act('keep', withdrawCancellation)}
            >
              {t('subscription.keep')}
            </Button>
          ) : null}
          {!status.cancelAtPeriodEnd && (status.access === 'TRIAL' || status.access === 'ACTIVE') ? (
            <Button variant="ghost" size="md" disabled={pending !== null} onClick={() => setConfirmCancel(true)}>
              {t('subscription.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {failure ? (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {t(failure)}
        </p>
      ) : null}

      <PlanChangeDialog
        target={keepTarget}
        onClose={() => setKeepTarget(null)}
        onDone={(change, preview) => {
          setKeepTarget(null)
          const why = planChangeDone(
            t,
            change,
            preview,
            planName(preview.to.planCode, preview.to.planName),
            i18n.language,
          )
          if (onPlanChanged) onPlanChanged(why)
          else {
            setLatest(null)
            read.retry()
          }
        }}
      />

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t('subscription.cancelConfirm.title')}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="md" onClick={() => setConfirmCancel(false)}>
              {t('subscription.cancelConfirm.back')}
            </Button>
            <Button size="md" disabled={pending !== null} onClick={() => act('cancel', scheduleCancellation)}>
              {t('subscription.cancelConfirm.confirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">
          {t('subscription.cancelConfirm.body', {
            date: day(status.paidThrough && status.access === 'ACTIVE' ? status.paidThrough : status.trialEndsOn),
          })}
        </p>
      </Modal>
    </section>
  )
}

function StandingNotice({ status, page }: { status: SubscriptionStatusDto; page: 'billing' | 'plan' }) {
  const { t, i18n } = useTranslation()
  const date = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : '')
  let message: string | null = null
  let tone = 'bg-surface-background text-text-secondary'
  switch (status.access) {
    case 'NOT_TRACKED':
      message = t('subscription.notice.notTracked')
      break
    case 'TRIAL':
      if ((status.trialDay ?? 0) >= TRIAL_REMINDER_FROM_DAY) {
        message = t('subscription.notice.trialEnding', {
          date: date(status.trialEndsOn),
          count: status.trialDaysLeft ?? 0,
        })
        tone = 'bg-pending-100 text-pending-700'
      }
      break
    case 'GRACE':
      message = t('subscription.notice.grace', { ended: date(status.paidThrough), until: date(status.graceUntil) })
      tone = 'bg-pending-100 text-pending-700'
      break
    case 'PAYMENT_REQUIRED':
      // Never started: no bill is owed yet and a payment made at sign-up may be with Fawtir, so
      // "payment is due, pay the bill below" would contradict the billing section (K-BC03).
      if (subscriptionDisplay(status) === 'NOT_STARTED') {
        message = t(page === 'billing' ? 'subscription.notice.notStartedBilling' : 'subscription.notice.notStartedPlan')
        tone = 'bg-pending-100 text-pending-700'
        break
      }
      message = t(page === 'billing' ? 'subscription.notice.paymentRequiredBilling' : 'subscription.notice.paymentRequiredPlan')
      tone = 'bg-danger-100 text-danger-700'
      break
    case 'CANCELLED':
      message = t('subscription.notice.cancelled', { date: date(status.accessEndsOn) })
      break
    default:
      break
  }
  if (status.cancelAtPeriodEnd && (status.access === 'TRIAL' || status.access === 'ACTIVE')) {
    message = t('subscription.notice.cancelScheduled', { date: date(status.accessEndsOn) })
    tone = 'bg-surface-background text-text-secondary'
  }
  // CA-9: Fawtir's own message, in the same line the CANCELLED state uses. The sentence carries its
  // own full stop, so one the operator typed is not doubled.
  if (status.cancelledByFawtir) {
    message = t('subscription.notice.cancelledByFawtir', {
      date: date(status.cancelledByFawtir.on),
      message: status.cancelledByFawtir.message.trim().replace(/[.。]+$/u, ''),
    })
    tone = 'bg-surface-background text-text-secondary'
  }
  return message ? (
    <p role="status" className={['rounded-sm px-4 py-3 text-sm font-medium leading-[1.6]', tone].join(' ')}>
      {message}
    </p>
  ) : null
}

function Facts({ status }: { status: SubscriptionStatusDto }) {
  const { t, i18n } = useTranslation()
  const date = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : t('subscription.none'))
  const cycle = status.billingCycle ? t(`subscription.cycle.${status.billingCycle}`) : t('subscription.none')
  // The status carries the plan's English name only (F37): an Arabic reader gets its Arabic name.
  const planName = usePlanName()

  return (
    <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
      <Fact label={t('subscription.fact.plan')} value={`${planName(status.planCode, status.planName)} · ${cycle}`} />
      <Fact
        label={t(status.billingCycle === 'ANNUAL' ? 'subscription.fact.pricePerYear' : 'subscription.fact.pricePerMonth')}
        value={
          status.periodPrice ? (
            <OmAmount amount={formatAmount(status.periodPrice, 'OMR', i18n.language)} size="xs" />
          ) : (
            t('subscription.none')
          )
        }
        note={t('subscription.fact.priceNote')}
      />
      {/* Only while the server reports a trial: once paid, the old trial dates are not news. */}
      {status.access === 'TRIAL' ? (
        <Fact
          label={t('subscription.fact.trial')}
          value={
            status.trialStartsOn
              ? t('subscription.fact.trialRange', { start: date(status.trialStartsOn), end: date(status.trialEndsOn) })
              : t('subscription.none')
          }
          note={
            status.trialDaysLeft !== null ? t('subscription.fact.trialDaysLeft', { count: status.trialDaysLeft }) : undefined
          }
        />
      ) : null}
      <Fact label={t('subscription.fact.paidThrough')} value={date(status.paidThrough)} />
      <Fact
        label={t('subscription.fact.renewsOn')}
        value={status.cancelAtPeriodEnd ? t('subscription.fact.notRenewing') : date(status.renewsOn)}
      />
      <Fact
        label={t('subscription.fact.grace')}
        value={t('subscription.fact.graceDays', { count: status.graceDays })}
        note={status.graceUntil ? t('subscription.fact.graceUntil', { date: date(status.graceUntil) }) : undefined}
      />
      <Fact
        label={t('subscription.fact.autoRenew')}
        value={status.autoRenew ? t('subscription.fact.on') : t('subscription.fact.off')}
        note={status.autoRenewAvailable ? undefined : t('subscription.fact.autoRenewUnavailable')}
      />
      <Fact
        label={t('subscription.fact.cancellation')}
        value={
          status.cancelAtPeriodEnd
            ? t('subscription.fact.endsOn', { date: date(status.accessEndsOn) })
            : t('subscription.fact.notScheduled')
        }
      />
    </dl>
  )
}

function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-text-quaternary">{label}</dt>
      <dd className="text-base font-semibold text-text-primary">{value}</dd>
      {note ? <dd className="text-xs font-medium text-text-tertiary">{note}</dd> : null}
    </div>
  )
}

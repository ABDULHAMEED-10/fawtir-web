import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { usePlanName } from '../../hooks/usePlanName'
import { useCan } from '../../lib/session/session'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { OmAmount, Rial, RialText, RowsView, withRial } from '../../components/ui'
import {
  PLAN_OVERVIEW_PATH,
  loadPlanOverview,
  type AllowanceUsageDto,
  type PlanOverviewDto,
} from '../../api/settings/plan'
import { EXTRA_DOCUMENTS_ROUTE } from '../../api/settings/extraDocuments'
import {
  PAID_EXTRAS_PATH,
  PAID_EXTRAS_ROUTE,
  loadPaidExtras,
  type PaidExtrasOverviewDto,
  type PlaceKindOverviewDto,
} from '../../api/settings/paidExtras'
import { Pill } from '../ErpPage/ErpShell'
import { SectionCard } from '../ErpPage/overview/idiom'
import {
  PUBLIC_PLANS_PATH,
  baisaOf,
  readPublicPlans,
  type SignupCataloguePlan,
} from '../../lib/identity/signupPlans'
import { SubscriptionStatusSection } from './SubscriptionStatusSection'
import {
  quotaWarningBodyKey,
  quotaWarningOf,
  quotaWarningTitleKey,
  type QuotaWarning,
} from '../../lib/quotaNotice'
import {
  SUBSCRIPTION_PATH,
  loadSubscription,
  subscriptionNotStarted,
  type SubscriptionStatusDto,
} from '../../api/settings/subscription'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import tickIcon from '../../assets/settings/check-ink.svg'
import tickGreenIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'

/** Changing the plan or its overage is `tenant.plan.manage`, as on the subscription section. */
const PLAN_MANAGE = 'tenant.plan.manage'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Settings › Plan and usage (Figma 135:40605), from `GET /v1/settings/plan`, with the subscription
 * section (`GET /v1/settings/subscription`, V270) above it and the plans this company could move
 * to from the published catalogue (`GET /v1/public/plans`, the one /pricing and sign-up read).
 *
 * PR #166 replaced the sample company's figures with the server's and, with them, dropped what the
 * server cannot answer. The design keeps those parts: they are drawn again, the figures the API
 * gives are computed from it (the forecast is arithmetic on `used`, `quota` and the period), and
 * the rest reads "Not available yet" with a `TODO(backend)` naming its SETTINGS.md row.
 */
export function PlanPage() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="billing">
      <SettingsHeader
        title={t('plan.title')}
        subtitle={t('people.plan.subtitle')}
        actions={
          <Link
            to="/settings/bills"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('plan.billsAndPayment')}
          </Link>
        }
      />
      <SubscriptionStatusSection page="plan" />
      <PlanBody />
    </SettingsShell>
  )
}

/** Inside the shell, which is what provides the session the permission is read from. */
function PlanBody() {
  const plan = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview)
  // The section above reads the same path; the shared request makes this one fetch, not two.
  const subscription = useApiRead<SubscriptionStatusDto>(SUBSCRIPTION_PATH, loadSubscription).read
  const notStarted = subscription.status === 'ready' && subscriptionNotStarted(subscription.data)
  const mayManage = useCan(PLAN_MANAGE)
  // US-1, BR-3, ER-1: the paid places and the add-on, shared by the two cards that show them.
  const extras = useApiRead<PaidExtrasOverviewDto>(PAID_EXTRAS_PATH, loadPaidExtras)

  if (plan.read.status === 'loading') return <LoadingNotice />
  if (plan.read.status === 'failed')
    return <ApiReadFailure error={plan.read.error} retry={plan.retry} />
  // TODO(backend): CONSOLE.md 3.3, null for a company moved to Enterprise after sign-up.
  const enterprise = plan.read.data.enterprise ?? null
  // TODO(decision): a company that chose Enterprise but was given a catalogue plan reads
  // `termsSet: false` from the server today, so it is shown "terms being prepared" here, and the
  // console lists it as "Terms not set". How such a company should be shown is Zain's call.
  if (enterprise && !enterprise.termsSet) {
    // The figures the server sends meanwhile are its fallback plan, not this company's (F22).
    return (
      <>
        <EnterpriseNotice terms="preparing" />
        <AddonsSection extras={extras.read.status === 'ready' ? extras.read.data : null} />
      </>
    )
  }
  return (
    <>
      <PlanFigures data={plan.read.data} notStarted={notStarted} mayManage={mayManage} />
      {extras.read.status === 'ready' ? (
        <PaidExtrasSummary data={extras.read.data} mayManage={mayManage} />
      ) : null}
      {/* D4: Enterprise terms change only through Fawtir, so no plan list to move to. */}
      {enterprise ? (
        <EnterpriseNotice terms="agreed" />
      ) : (
        <PlanCards current={plan.read.data} mayManage={mayManage} />
      )}
      {/* ER-1: Starter and Business never show the add-on; a server that cannot say keeps the old card. */}
      {extras.read.status === 'ready' && !extras.read.data.erpAddon.offered ? null : (
        <AddonsSection extras={extras.read.status === 'ready' ? extras.read.data : null} />
      )}
    </>
  )
}

/**
 * Enterprise (PL-1, SU-5): its terms are agreed with Fawtir, never chosen here. Before Fawtir has
 * set them there is nothing to show as the company's plan; once set, changes go through Fawtir.
 */
function EnterpriseNotice({ terms }: { terms: 'preparing' | 'agreed' }) {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby="plan-enterprise"
      className="flex flex-wrap items-start gap-5 rounded-md bg-surface-card p-5"
    >
      <div className="min-w-0 flex-1 md:min-w-[260px]">
        <h3 id="plan-enterprise" className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('plan.planName.enterprise')}
        </h3>
        <p className="mt-1 max-w-[640px] text-sm font-medium leading-[1.6] text-text-tertiary">
          {t(terms === 'preparing' ? 'plan.enterprise.preparing' : 'plan.enterprise.agreed')}
        </p>
      </div>
      {terms === 'agreed' ? (
        <Link
          to="/contact"
          className="inline-flex h-[46px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('plans.talkToTeam')}
        </Link>
      ) : null}
    </section>
  )
}

/** Whole days from one business date to another (`YYYY-MM-DD`), read as UTC calendar days. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The design's forecast, from the server's own count and period: the daily rate is what has been
 * raised over the days gone, the run-out date what is left at that rate, the shortfall what the
 * days still to run would need beyond what is left. The three move together or not at all.
 */
export function forecastOf(usage: PlanOverviewDto['usage']) {
  const { used, quota, period } = usage
  const daysGone = Math.max(1, daysBetween(period.start, period.today) + 1)
  const daysLeft = Math.max(0, daysBetween(period.today, period.end))
  const left = Math.max(0, quota - used)
  const perDay = Math.round(used / daysGone)
  const shortfall = daysLeft * perDay - left
  const runOut = perDay > 0 ? addDays(period.today, Math.floor(left / perDay)) : null
  return {
    perDay,
    daysLeft,
    left,
    shortfall,
    willRunOut: perDay > 0 && shortfall > 0 && runOut !== null && runOut <= period.end,
    runOut,
    resetsOn: addDays(period.end, 1),
  }
}

/**
 * `notStarted`: before the first paid period the server counts usage against the calendar month,
 * which is not the period that applies once the subscription starts (K-BC05). The period, its
 * reset date and the forecast built on its days are left out rather than shown wrong.
 */
function PlanFigures({
  data,
  notStarted,
  mayManage,
}: {
  data: PlanOverviewDto
  notStarted: boolean
  mayManage: boolean
}) {
  const { t, i18n } = useTranslation()
  // lib/format keeps digits Latin in Arabic too (decision D15); toLocaleString would not.
  const number = (value: number) => formatCount(value, i18n.language)
  const date = (iso: string) => formatDate(iso, i18n.language)
  const { usage, plan } = data
  // The overview carries the plan's English name only: an Arabic reader gets the catalogue's
  // Arabic name by the plan's code, as Bills and payment does (F37/G11). The plan cards below read
  // the same catalogue, so this is not a second request.
  const planName = usePlanName()(plan.code, plan.name)
  // AL-9: the server's allowance counts issued and received documents against the plan's
  // documents and the extras together, so the headline figure, the bar and the forecast read it
  // when it is there. A server without it is shown its issued-only `usage`, as before.
  const allowance = data.allowance ?? null
  const counted: PlanOverviewDto['usage'] = allowance
    ? {
        ...usage,
        period: {
          start: allowance.periodStart,
          end: allowance.periodEnd,
          today: usage.period.today,
        },
        used: allowance.used,
        quota: allowance.totalAllowance,
      }
    : usage
  const percent =
    counted.quota > 0 ? Math.min(100, Math.round((counted.used / counted.quota) * 100)) : 0
  const forecast = forecastOf(counted)
  const resetsOn = allowance?.resetsOn ?? forecast.resetsOn
  const warning = quotaWarningOf(allowance)

  return (
    <>
      <section aria-labelledby="plan-usage" className="overflow-hidden rounded-md bg-surface-card">
        {warning ? <QuotaWarningCallout warning={warning} /> : null}
        <div className="flex flex-wrap gap-6 p-5">
          <div className="shrink-0">
            <p className="flex items-baseline gap-1">
              <span className="text-[54px] font-semibold leading-[1] text-pending-700 tabular-nums">
                {number(counted.used)}
              </span>
              <span className="text-lg font-medium text-text-quaternary">
                {t('people.plan.ofAllowance', { allowance: number(counted.quota) })}
              </span>
            </p>
            <h3
              id="plan-usage"
              className="mt-1 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary"
            >
              {t('plan.invoicesThisMonth')}
            </h3>
            <p className="mt-2 text-sm font-semibold text-text-secondary">
              {t('plan.yourPlan')}: {planName}
            </p>
          </div>

          <div className="min-w-0 flex-1 md:min-w-[320px]">
            {notStarted ? null : (
              <>
                <p className="text-xl font-medium leading-[1.2] text-text-primary">
                  {forecast.willRunOut && forecast.runOut
                    ? t('plan.runOutHeadline', { date: date(forecast.runOut) })
                    : t('plan.comfortableHeadlinePeriod')}
                </p>
                <p className="mt-2 max-w-[640px] text-sm font-medium leading-[1.6] text-text-tertiary">
                  <Trans
                    i18nKey={forecast.willRunOut ? 'plan.runOutBodyPeriod' : 'plan.comfortableBodyPeriod'}
                    values={{
                      perDay: number(forecast.perDay),
                      days: number(forecast.daysLeft),
                      short: number(Math.abs(forecast.shortfall)),
                      spare: number(Math.max(0, -forecast.shortfall)),
                    }}
                    components={{ b: <b className="font-semibold text-text-primary" /> }}
                  />
                </p>
              </>
            )}

            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-background"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={counted.quota}
              aria-valuenow={counted.used}
              aria-label={t('plan.invoicesThisMonth')}
            >
              <div className="h-full rounded-full bg-pending-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-4 text-xs font-medium text-text-quaternary">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px] bg-pending-500" />
                  {t('plan.used', { count: number(counted.used) })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[2px] bg-pending-100" />
                  {t('plan.leftCount', { count: number(forecast.left) })}
                </span>
              </span>
              {notStarted ? null : (
                <span className="text-xs font-medium text-text-quaternary">
                  {t('people.plan.period', {
                    start: date(counted.period.start),
                    end: date(counted.period.end),
                  })}{' '}
                  {t('plan.resetsOn', { date: date(resetsOn) })}
                </span>
              )}
            </p>
          </div>

          {/*
           * TODO(backend): SETTINGS.md row 5.1. "Move up" stays hidden, not greyed (plan v4: hide
           * what cannot be done), until the web is wired to a plan-change endpoint. The overage
           * switch (row 5.2) is replaced by buying extra documents ahead: nothing is billed after
           * the fact. Offered to PLAN_MANAGE on a plan with a per-document rate.
           */}
          {mayManage && Number(plan.overagePricePerInvoice ?? 0) > 0 ? (
            <div className="shrink-0 self-start">
              <Link
                to={EXTRA_DOCUMENTS_ROUTE}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('extraDocuments.entry')}
              </Link>
            </div>
          ) : null}
        </div>

        <dl className="grid border-t border-surface-background sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label={t('plan.stat.raisedToday')}
            value={number(usage.raisedToday)}
            // TODO(backend): SETTINGS.md row 5.5. The design splits the figure by branch.
            note={t('plan.byBranchUnavailable')}
          />
          <Stat
            label={t('plan.stat.resubmissions')}
            value={t('plan.stat.resubmissionsOf', {
              count: number(usage.resubmissions),
              // A resend is of an issued document: counted against those, not the received ones.
              total: number(allowance?.issued ?? usage.used),
            })}
            note={t('plan.stat.resubmissionsNote')}
            tone="pending"
          />
          {/* TODO(backend): SETTINGS.md row 5.3. */}
          <Stat label={t('plan.stat.busiest')} unavailable />
          {/* TODO(backend): SETTINGS.md row 5.4. */}
          <Stat label={t('plan.stat.lastMonth')} unavailable />
        </dl>

        {allowance ? <AllowanceSplit allowance={allowance} /> : null}
      </section>

      {allowance && allowance.byBranch.length > 0 ? <BranchUsage allowance={allowance} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Figure
          label={t('people.plan.people')}
          value={t('people.plan.ofIncluded', {
            count: data.activePeople,
            included: number(plan.peopleIncluded),
          })}
          note={t('people.plan.openInvitations', { count: data.openInvitations })}
        />
        <Figure
          label={t('people.plan.branches')}
          value={
            plan.branchesIncluded === null
              ? t('people.plan.unlimited', { count: data.activeBranches })
              : t('people.plan.ofIncluded', {
                  count: data.activeBranches,
                  included: number(plan.branchesIncluded),
                })
          }
        />
      </div>
    </>
  )
}

/**
 * AL-8 in the app: the server's 80%, 90% or 100% warning, inside the usage card it is about. The
 * 100% one says plainly that issuing stops and received documents are held until extras are bought.
 */
function QuotaWarningCallout({ warning }: { warning: QuotaWarning }) {
  const { t, i18n } = useTranslation()
  const number = (value: number) => formatCount(value, i18n.language)
  return (
    <div className="p-5 pb-0">
      <p
        role="status"
        className={[
          'rounded-sm px-4 py-3 text-sm font-medium leading-[1.6]',
          warning.percent === 100
            ? 'bg-danger-100 text-danger-700'
            : 'bg-pending-100 text-pending-700',
        ].join(' ')}
      >
        <b className="font-semibold">
          {t(quotaWarningTitleKey(warning), { percent: warning.percent })}
        </b>{' '}
        <Trans
          i18nKey={quotaWarningBodyKey(warning)}
          values={{ used: number(warning.used), allowance: number(warning.allowance) }}
          components={{ b: <b className="font-semibold" /> }}
        />
      </p>
    </div>
  )
}

/**
 * AL-9, as plan v4 §6 words it: "Plan 200, used 200 (150 issued, 50 received) · Extra this month
 * 0". The plan's documents and the extras apart, issued and received apart, all the server's.
 */
function AllowanceSplit({ allowance }: { allowance: AllowanceUsageDto }) {
  const { t, i18n } = useTranslation()
  const number = (value: number) => formatCount(value, i18n.language)
  return (
    <dl
      aria-label={t('plan.split.title')}
      className="grid border-t border-surface-background sm:grid-cols-2 xl:grid-cols-4"
    >
      <Stat
        label={t('plan.split.plan')}
        value={t('plan.split.usedOf', {
          used: number(allowance.planUsed),
          of: number(allowance.planDocuments),
        })}
      />
      <Stat
        label={t('plan.split.extra')}
        value={
          allowance.extraDocuments > 0
            ? t('plan.split.usedOf', {
                used: number(allowance.extraUsed),
                of: number(allowance.extraDocuments),
              })
            : number(0)
        }
        note={
          allowance.extraDocuments > 0 && allowance.extrasExpireOn
            ? t('plan.split.extraEnds', {
                date: formatDate(allowance.extrasExpireOn, i18n.language),
              })
            : t('plan.split.noExtra')
        }
      />
      <Stat
        label={t('plan.split.issued')}
        value={number(allowance.issued)}
        note={t('plan.split.issuedNote')}
      />
      <Stat
        label={t('plan.split.received')}
        value={number(allowance.received)}
        note={
          allowance.receivedHidden > 0
            ? t('plan.split.receivedWaiting', {
                count: allowance.receivedHidden,
                n: number(allowance.receivedHidden),
              })
            : t('plan.split.receivedNote')
        }
      />
    </dl>
  )
}

/**
 * AL-9: the month per branch, issued and received, from the server's rows. Received documents and
 * documents issued without a branch sit on the row with no branch, so the rows add up exactly to
 * the company's total, which closes the table.
 */
function BranchUsage({ allowance }: { allowance: AllowanceUsageDto }) {
  const { t, i18n } = useTranslation()
  const number = (value: number) => formatCount(value, i18n.language)
  const cell = 'px-2 py-3 text-end text-sm font-medium tabular-nums text-text-secondary'
  const head = 'px-2 py-2.5 text-end font-semibold'
  return (
    <section
      aria-labelledby="plan-by-branch"
      className="overflow-hidden rounded-md bg-surface-card"
    >
      <div className="p-5">
        <h3 id="plan-by-branch" className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('plan.byBranch.title')}
        </h3>
        <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('plan.byBranch.subtitle')}
        </p>
      </div>
      <RowsView>
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="px-5 py-2.5 text-start font-semibold">{t('plan.byBranch.branch')}</th>
              <th className={head}>{t('plan.byBranch.issued')}</th>
              <th className={head}>{t('plan.byBranch.received')}</th>
              <th className={`${head} pe-5`}>{t('plan.byBranch.total')}</th>
            </tr>
          </thead>
          <tbody>
            {allowance.byBranch.map((row) => (
              <tr
                key={row.branchId ?? 'none'}
                className="border-b border-surface-background last:border-0"
              >
                <td className="px-5 py-3 text-sm font-semibold text-text-primary">
                  {row.branchId === null ? (
                    <>
                      {t('plan.byBranch.noBranch')}
                      <span className="block text-xs font-medium text-text-quaternary">
                        {t('plan.byBranch.noBranchNote')}
                      </span>
                    </>
                  ) : (
                    row.branchName || t('plan.byBranch.unnamed')
                  )}
                </td>
                <td className={cell}>{number(row.issued)}</td>
                <td className={cell}>{number(row.received)}</td>
                <td className={`${cell} pe-5`}>{number(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-surface-background">
              <th
                scope="row"
                className="px-5 py-3 text-start text-sm font-semibold text-text-primary"
              >
                {t('plan.byBranch.company')}
              </th>
              <td className={`${cell} font-semibold text-text-primary`}>
                {number(allowance.issued)}
              </td>
              <td className={`${cell} font-semibold text-text-primary`}>
                {number(allowance.received)}
              </td>
              <td className={`${cell} pe-5 font-semibold text-text-primary`}>
                {number(allowance.used)}
              </td>
            </tr>
          </tfoot>
        </table>
      </RowsView>
    </section>
  )
}

function Stat({
  label,
  value,
  note,
  tone,
  unavailable,
}: {
  label: string
  value?: string
  note?: string
  tone?: 'pending'
  unavailable?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="border-b border-e border-surface-background px-5 py-4 last:border-e-0">
      <dt className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[0.5px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1.5">
        {unavailable ? (
          <p className="text-sm font-medium leading-[1.6] text-text-quaternary">
            {t('plan.notAvailableYet')}
          </p>
        ) : (
          <p
            className={[
              'text-lg font-semibold leading-[1.2] tabular-nums',
              tone === 'pending' ? 'text-pending-700' : 'text-text-primary',
            ].join(' ')}
          >
            {value}
          </p>
        )}
        {note ? <p className="mt-1 text-xs font-medium text-text-quaternary">{note}</p> : null}
      </dd>
    </div>
  )
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-card p-5">
      <span className="text-sm font-medium text-text-quaternary">{label}</span>
      <span className="text-xl font-semibold text-text-primary">{value}</span>
      {note ? <span className="text-xs font-medium text-text-tertiary">{note}</span> : null}
    </div>
  )
}

/**
 * The plans, from the published catalogue: the company's own marked "Your plan" by its code, the
 * dearer ones offered as a move up, the cheaper ones as a move down at renewal (owner: upgrades
 * apply immediately, downgrades at renewal). There is no plan-change endpoint yet, so the move
 * buttons are hidden, not greyed (plan v4; SETTINGS.md row 5.1). Enterprise has no price and its
 * one action is to talk to the team.
 * TODO: show the Enterprise card only to companies on Business Plus, the one plan it is the next
 * step from (owner, 7 Oct 2026: agreed, to be done later).
 */
function PlanCards({ current, mayManage }: { current: PlanOverviewDto; mayManage: boolean }) {
  const { t } = useTranslation()
  const catalogue = useApiRead<SignupCataloguePlan[]>(PUBLIC_PLANS_PATH, () => readPublicPlans())

  if (catalogue.read.status === 'loading') return <LoadingNotice />
  if (catalogue.read.status === 'failed')
    return <ApiReadFailure error={catalogue.read.error} retry={catalogue.retry} />

  const plans = catalogue.read.data.filter((plan) => !/enterprise/i.test(plan.code))
  const mine = plans.find((plan) => plan.code === current.plan.code)
  const myPrice = baisaOf(mine?.monthlyPrice ?? current.plan.monthlyPrice ?? null)

  return (
    <section aria-label={t('plan.plansTitle')} className="flex flex-col gap-3">
      {mayManage ? (
        <p className="flex items-start gap-2 text-sm font-medium text-text-tertiary">
          <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
          <span>
            {t('plan.changeRule')} {t('plan.changeNotAvailable')}
          </span>
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            current={plan.code === current.plan.code}
            myPrice={myPrice}
          />
        ))}
        <EnterpriseCard />
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  current,
  myPrice,
}: {
  plan: SignupCataloguePlan
  current: boolean
  myPrice: number | null
}) {
  const { t, i18n } = useTranslation()
  const price = baisaOf(plan.monthlyPrice)
  const difference = price !== null && myPrice !== null ? price - myPrice : null
  const better = !current && difference !== null && difference > 0
  const smaller = !current && difference !== null && difference < 0
  const name = (i18n.language.startsWith('ar') && plan.nameAr) || plan.nameEn
  const amount = (value: string) => formatAmount(value, 'OMR', i18n.language)

  const features: ReactNode[] = [
    t('plan.feature.invoices', { count: formatCount(plan.invoicesPerMonth, i18n.language) }),
    plan.extraPersonPrice
      ? withRial(
          t('plan.feature.peopleThen', {
            count: plan.peopleIncluded,
            amount: amount(plan.extraPersonPrice),
          }),
        )
      : t('plan.feature.people', { count: plan.peopleIncluded }),
    plan.branchesIncluded === null
      ? t('plan.feature.unlimitedBranches')
      : t('plan.feature.branches', { count: plan.branchesIncluded }),
    plan.apiAccess ? t('plan.feature.api') : t('plan.feature.noApi'),
    plan.overagePricePerInvoice
      ? withRial(t('plan.feature.overage', { amount: amount(plan.overagePricePerInvoice) }))
      : t('plan.feature.noOverage'),
    ...(plan.prioritySupport ? [t('plan.feature.prioritySupport')] : []),
  ]

  return (
    <article
      className={[
        'flex flex-col rounded-md bg-surface-card p-5',
        current ? 'ring-1 ring-primary-700' : '',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex h-[24px] w-fit items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
          current
            ? 'bg-primary-700 text-white'
            : better
              ? 'bg-[#3d5648] text-white'
              : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {current ? t('plan.yourPlan') : better ? t('plan.larger') : t('plan.smaller')}
      </span>

      <h3 className="mt-3 text-xl font-medium leading-[1.2] text-text-primary">{name}</h3>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
          <Rial />
        </span>
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary tabular-nums">
          {amount(plan.monthlyPrice)}
        </span>
        <span className="whitespace-nowrap text-sm font-medium text-text-quaternary">
          {t('plan.perMonth')}
        </span>
      </p>

      <ul className="mt-4 flex flex-col gap-2.5">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-5">
        {current ? (
          <p className="flex items-start gap-2 rounded-sm bg-surface-background px-3 py-2.5 text-xs font-medium leading-[1.6] text-text-tertiary">
            <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
            <span>{t('plan.thisIsYours')}</span>
          </p>
        ) : better || smaller ? (
          <>
            <p
              className={[
                'flex items-start gap-2 rounded-sm px-3 py-2.5 text-xs font-medium leading-[1.6]',
                better ? 'bg-success-100 text-[#3d5648]' : 'bg-surface-background text-text-tertiary',
              ].join(' ')}
            >
              <img src={better ? tickGreenIcon : infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                <Trans
                  i18nKey={better ? 'plan.moreAMonth' : 'plan.lessAMonth'}
                  values={{ amount: amount((Math.abs(difference ?? 0) / 1000).toFixed(3)) }}
                  components={{ b: <RialText as="b" className="font-semibold" /> }}
                />
              </span>
            </p>
            {/*
             * TODO(backend): SETTINGS.md row 5.1. The "Move to" button is hidden, not greyed
             * (plan v4), until the API can change the plan (up: straight away; down: from the
             * next renewal). Shown then to PLAN_MANAGE only.
             */}
          </>
        ) : null}
      </div>
    </article>
  )
}

/**
 * Enterprise: Business Plus with documents, people and branches agreed on a call, so it shows
 * "Custom" where the others show a price, and its one action is to talk to the team (the
 * Contact page, as on /pricing).
 */
function EnterpriseCard() {
  const { t } = useTranslation()
  const features = (['f1', 'f2', 'f3'] as const).map((key) => t(`plans.enterprise.features.${key}`))

  return (
    <article className="flex flex-col rounded-md bg-surface-card p-5">
      <span className="inline-flex h-[24px] w-fit items-center rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
        {t('plan.larger')}
      </span>
      <h3 className="mt-3 text-xl font-medium leading-[1.2] text-text-primary">
        {t('plan.planName.enterprise')}
      </h3>
      <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-[1.1] text-text-primary">
          {t('plans.enterprise.price')}
        </span>
        <span className="text-sm font-medium text-text-quaternary">
          {t('plans.enterprise.billingNote')}
        </span>
      </p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0 opacity-70" />
            <span className="text-sm font-medium leading-[1.4] text-text-tertiary">{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <Link
          to="/contact"
          className="inline-flex h-[46px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('plans.talkToTeam')}
        </Link>
      </div>
    </article>
  )
}

/**
 * US-1, BR-3: users and branches against what the plan includes plus the paid places, with the
 * way to the page that buys more (`tenant.plan.manage`) or shows them (`tenant.plan.read`).
 */
function PaidExtrasSummary({ data, mayManage }: { data: PaidExtrasOverviewDto; mayManage: boolean }) {
  const { t } = useTranslation()
  const sold = data.users.offered || data.branches.offered
  return (
    <SectionCard
      title={t('paidExtras.planCard.title')}
      note={t('paidExtras.planCard.note')}
      actions={
        <Link
          to={PAID_EXTRAS_ROUTE}
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {mayManage && data.open && sold ? t('paidExtras.planCard.entry') : t('paidExtras.planCard.view')}
        </Link>
      }
    >
      <div className="grid gap-5 p-5 pt-0 md:grid-cols-2">
        <PlaceSummary label={t('paidExtras.places.kind.USER')} place={data.users} />
        <PlaceSummary label={t('paidExtras.places.kind.BRANCH')} place={data.branches} />
      </div>
    </SectionCard>
  )
}

function PlaceSummary({ label, place }: { label: string; place: PlaceKindOverviewDto }) {
  const { t, i18n } = useTranslation()
  const n = (value: number) => formatCount(value, i18n.language)
  const unlimited = place.capacity === null || place.included === null
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-text-quaternary">{label}</span>
      <span className="text-xl font-semibold text-text-primary">
        {unlimited
          ? t('paidExtras.places.unlimited', { inUse: n(place.inUse) })
          : t('paidExtras.places.inUseOf', { inUse: n(place.inUse), capacity: n(place.capacity ?? 0) })}
      </span>
      {unlimited ? null : (
        <span className="text-xs font-medium text-text-tertiary">
          {t('paidExtras.places.split', { included: n(place.included ?? 0), paid: n(place.paidPlacesNow) })}
        </span>
      )}
    </div>
  )
}

const ADDON_TONE = {
  NONE: 'neutral',
  PENDING_PAYMENT: 'pending',
  ACTIVE: 'success',
  ENDING: 'pending',
  ENDED: 'neutral',
} as const

/**
 * What the account has on top of the plan: the ERP and API add-on. Where the paid-extras read says
 * the plan offers it (ER-1), the card shows its price and state and leads to where it is added or
 * stopped (ER-2). Without that read it keeps the earlier wording: enabled per organisation by
 * Fawtir, with the real state on ERP integration.
 */
function AddonsSection({ extras }: { extras: PaidExtrasOverviewDto | null }) {
  const { t, i18n } = useTranslation()
  const addon = extras?.erpAddon.offered ? extras.erpAddon : null
  const state = addon?.status ?? 'NONE'
  const endsOn = addon?.endsOn ? formatDate(addon.endsOn, i18n.language) : ''
  return (
    <section aria-labelledby="plan-addons" className="overflow-hidden rounded-md bg-surface-card">
      <div className="p-5">
        <h3 id="plan-addons" className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('plan.addons.title')}
        </h3>
        <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('plan.addons.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-5 border-t border-surface-background p-5">
        <div className="min-w-0 flex-1 md:min-w-[260px]">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-text-primary">
              {addon ? t('paidExtras.addon.title') : t('plan.addons.extraction.name')}
            </p>
            {addon ? (
              <Pill tone={ADDON_TONE[state]} label={t(`paidExtras.addon.status.${state}`, { date: endsOn })} />
            ) : (
              <span className="inline-flex h-[24px] items-center gap-1.5 rounded-[3px] bg-surface-background px-2 text-[10px] font-semibold uppercase tracking-[0.4px] text-text-tertiary">
                <span className="size-1.5 rounded-full bg-current" />
                {t('plan.addons.state.managedByFawtir')}
              </span>
            )}
          </div>
          {addon?.monthlyPrice ? (
            <p className="mt-1 inline-flex flex-wrap items-center gap-1 text-sm font-semibold text-text-secondary">
              <OmAmount amount={formatAmount(addon.monthlyPrice, 'OMR', i18n.language)} size="xs" />{' '}
              {t('paidExtras.places.perMonth')}
            </p>
          ) : null}
          <p className="mt-1 max-w-[560px] text-sm font-medium leading-[1.6] text-text-tertiary">
            {addon
              ? t(`paidExtras.addon.body.${state}`, { date: endsOn })
              : t('plan.addons.extraction.body')}
          </p>
          {addon ? null : (
            <p className="mt-3 max-w-[560px] text-sm font-medium leading-[1.6] text-text-secondary">
              {t('plan.addons.extraction.realState')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {addon ? (
            <Link
              to={PAID_EXTRAS_ROUTE}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('paidExtras.planCard.manageAddon')}
            </Link>
          ) : null}
          <Link
            to="/settings/erp"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('plan.addons.openIntegration')}
          </Link>
        </div>
      </div>
    </section>
  )
}

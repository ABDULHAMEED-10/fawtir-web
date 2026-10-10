import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { useApiRead } from '../../hooks'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../../api/settings/plan'
import { SubscriptionStatusSection } from './SubscriptionStatusSection'
import { formatCount, formatDate } from '../../lib/format'

/**
 * Settings › Plan and usage, from `GET /v1/settings/plan` alone. The screen used to forecast a
 * run-out date from a sample company's count on a calendar fixed at 26 September, split "raised
 * today" across its three branches and quote its busiest day and last month; none of that is
 * recorded for this tenant, so only the server's figures are drawn. The subscription section
 * above them is `GET /v1/settings/subscription` (V270).
 */
export function PlanPage() {
  const { t } = useTranslation()
  const plan = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview)

  return (
    <SettingsShell group="billing">
      <SettingsHeader title={t('plan.title')} subtitle={t('people.plan.subtitle')} />
      <SubscriptionStatusSection />
      {plan.read.status === 'loading' ? (
        <LoadingNotice />
      ) : plan.read.status === 'failed' ? (
        <ApiReadFailure error={plan.read.error} retry={plan.retry} />
      ) : (
        <PlanFigures data={plan.read.data} />
      )}
    </SettingsShell>
  )
}

function PlanFigures({ data }: { data: PlanOverviewDto }) {
  const { t, i18n } = useTranslation()
  // lib/format keeps digits Latin in Arabic too (decision D15); toLocaleString would not.
  const number = (value: number) => formatCount(value, i18n.language)
  const date = (iso: string) => formatDate(iso, i18n.language)
  const { usage, plan } = data
  const percent = usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0

  return (
    <>
      <section aria-labelledby="plan-usage" className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="plan-usage" className="text-lg font-semibold text-text-primary">
            {t('plan.invoicesThisMonth')}
          </h3>
          <span className="text-sm font-semibold text-text-secondary">{t('plan.yourPlan')}: {plan.name}</span>
        </div>
        <p className="text-sm font-medium text-text-primary">
          <span className="text-2xl font-semibold">{number(usage.used)}</span>{' '}
          {t('people.plan.ofAllowance', { allowance: number(usage.quota) })}
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-background"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={usage.quota}
          aria-valuenow={usage.used}
          aria-label={t('plan.invoicesThisMonth')}
        >
          <div className="h-full rounded-full bg-primary-700" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm font-medium text-text-tertiary">
          {t('people.plan.period', { start: date(usage.period.start), end: date(usage.period.end) })}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Figure label={t('plan.stat.raisedToday')} value={number(usage.raisedToday)} />
        <Figure
          label={t('plan.stat.resubmissions')}
          value={number(usage.resubmissions)}
          note={t('plan.stat.resubmissionsNote')}
        />
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

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-card p-5">
      <span className="text-sm font-medium text-text-quaternary">{label}</span>
      <span className="text-xl font-semibold text-text-primary">{value}</span>
      {note ? <span className="text-xs font-medium text-text-tertiary">{note}</span> : null}
    </div>
  )
}

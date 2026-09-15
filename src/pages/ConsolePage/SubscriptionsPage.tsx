import { useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import {
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsoleSubscriptionIcon,
  ConsoleTickIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import { ActionMenu, FilterMenu, Rial, RowsView, SortMenu } from '../../components/ui'
import { subscriptionRowActions } from '../../lib/rowActions'
import { count, omr } from '../../lib/superAdmin'
import { formatDay, localeFor } from '../../lib/console/format'
import { PLATFORM_SETTINGS } from '../../lib/platformSettings'
import {
  METHODS,
  PLAN_OPTIONS,
  SUBSCRIPTIONS_NOW,
  SUBSCRIPTION_TABS,
  TERMS,
  daysUntil,
  documentsAllowance,
  graceDay,
  linksOf,
  linkStatusAt,
  openInvoiceOf,
  planLabelKey,
  queueKpis,
  subscriptionsForTab,
  suspendsOn,
  tenantIdentity,
  useSubscriptions,
  type PaymentMethod,
  type Subscription,
  type SubscriptionPlanId,
  type SubscriptionTabId,
  type Term,
} from '../../lib/consoleSubscriptions'
import { QueueKpiCard } from './subscriptions/QueueKpiCard'
import { LinkStatusPill, SubscriptionStatePill } from './subscriptions/SubscriptionStatePill'
import searchIcon from '../../assets/dashboard/search.svg'

type Ledger = ReturnType<typeof useSubscriptions>
type PlanFilter = 'all' | SubscriptionPlanId
type MethodFilter = 'all' | PaymentMethod
type TermFilter = 'all' | Term
type SortId = 'queue' | 'periodEnd' | 'amountDue' | 'name'

const SORT_OPTIONS: { value: SortId; labelKey: string }[] = [
  { value: 'queue', labelKey: 'console.subscriptions.queue.sort.queue' },
  { value: 'periodEnd', labelKey: 'console.subscriptions.queue.sort.periodEnd' },
  { value: 'amountDue', labelKey: 'console.subscriptions.queue.sort.amountDue' },
  { value: 'name', labelKey: 'console.subscriptions.queue.sort.name' },
]

/** The line under the state pill: what the state means for this tenant, today. */
function stateDetail(
  t: TFunction,
  language: string,
  ledger: Ledger,
  subscription: Subscription,
): { text: string; tone: 'calm' | 'watch' | 'bad' } {
  const day = (date: Date) => formatDay(date.toISOString(), language)
  const key = (name: string) => `console.subscriptions.queue.detail.${name}`
  switch (subscription.state) {
    case 'awaitingPayment': {
      const due = openInvoiceOf(ledger, subscription.tenantId)?.due ?? subscription.periodStart
      const left = daysUntil(due)
      if (left > 0) return { text: t(key('due'), { date: day(due) }), tone: 'calm' }
      if (left === 0) return { text: t(key('dueToday')), tone: 'watch' }
      return { text: t(key('overdue'), { count: -left }), tone: 'watch' }
    }
    case 'grace':
      return {
        text: t(key('grace'), {
          day: graceDay(subscription),
          days: PLATFORM_SETTINGS.lifecycle.graceDays,
          date: day(suspendsOn(subscription) ?? subscription.periodEnd),
        }),
        tone: 'bad',
      }
    case 'trial': {
      const left = daysUntil(subscription.trialEndsAt ?? subscription.periodEnd)
      const values = {
        used: subscription.trialUsed ?? 0,
        allowance: documentsAllowance(subscription),
      }
      return left <= 0
        ? { text: t(key('trialEndsToday'), values), tone: 'watch' }
        : { text: t(key('trialEnds'), { count: left, ...values }), tone: 'calm' }
    }
    case 'active': {
      const renews = t(key('renews'), { date: day(subscription.periodEnd) })
      const change = subscription.scheduledChange
      return {
        text: change
          ? `${renews} · ${t(key('moving'), { plan: t(planLabelKey(change.plan)), date: day(change.at) })}`
          : renews,
        tone: 'calm',
      }
    }
    case 'suspended':
      return {
        text: t(key('suspended'), { date: day(subscription.stateSince ?? subscription.periodEnd) }),
        tone: 'calm',
      }
    case 'cancelled':
      return {
        text: t(key('cancelled'), {
          date: day(subscription.stateSince ?? subscription.periodStart),
          until: day(subscription.periodEnd),
        }),
        tone: 'calm',
      }
  }
}

const DETAIL_TONE = {
  bad: 'text-danger-700',
  watch: 'text-pending-700',
  calm: 'text-text-quaternary',
} as const

export function SubscriptionsPage() {
  const { t, i18n } = useTranslation()
  const ledger = useSubscriptions()
  const [tab, setTab] = useState<SubscriptionTabId>('all')
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState<PlanFilter>('all')
  const [method, setMethod] = useState<MethodFilter>('all')
  const [term, setTerm] = useState<TermFilter>('all')
  const [sort, setSort] = useState<SortId>('queue')

  const kpis = queueKpis(ledger)
  const paymentsThisMonth = ledger.payments.filter(
    (payment) =>
      payment.receivedOn.getMonth() === SUBSCRIPTIONS_NOW.getMonth() &&
      payment.receivedOn.getFullYear() === SUBSCRIPTIONS_NOW.getFullYear(),
  ).length
  const month = SUBSCRIPTIONS_NOW.toLocaleDateString(localeFor(i18n.language), { month: 'long' })
  const day = (date: Date) => formatDay(date.toISOString(), i18n.language)

  const listed = subscriptionsForTab(ledger, tab)
  const needle = query.trim().toLowerCase()
  const rows = listed
    .map((subscription) => ({ subscription, tenant: tenantIdentity(subscription.tenantId) }))
    .filter(
      ({ subscription, tenant }) =>
        (plan === 'all' || subscription.plan === plan) &&
        (method === 'all' || subscription.preferredMethod === method) &&
        (term === 'all' || subscription.term === term) &&
        `${tenant.name} ${tenant.vat} ${tenant.town}`.toLowerCase().includes(needle),
    )
  if (sort === 'periodEnd')
    rows.sort((a, b) => a.subscription.periodEnd.getTime() - b.subscription.periodEnd.getTime())
  if (sort === 'amountDue') rows.sort((a, b) => b.subscription.amountDue - a.subscription.amountDue)
  if (sort === 'name') rows.sort((a, b) => a.tenant.name.localeCompare(b.tenant.name))

  const tabEntry = SUBSCRIPTION_TABS.find((entry) => entry.id === tab) ?? SUBSCRIPTION_TABS[0]
  const tabLabel = (id: SubscriptionTabId) =>
    id === 'all' ? t('console.subscriptions.queue.tab.all') : t(`console.subscriptions.state.${id}`)
  // The queue lists everyone who needs a person; the 268 active and 12 cancelled are counted, not
  // listed, so the footer says so rather than pretending the list is complete.
  const complete = listed.length >= tabEntry.count
  const footer = complete
    ? tab === 'all'
      ? t('console.subscriptions.queue.showingAll', {
          shown: rows.length,
          total: count(tabEntry.count),
        })
      : t('console.subscriptions.queue.showing', {
          shown: rows.length,
          total: count(tabEntry.count),
          tab: tabLabel(tab).toLowerCase(),
        })
    : tab === 'all'
      ? t('console.subscriptions.queue.showingSomeAll', {
          shown: rows.length,
          total: count(tabEntry.count),
        })
      : t('console.subscriptions.queue.showingSome', {
          shown: rows.length,
          total: count(tabEntry.count),
          tab: tabLabel(tab).toLowerCase(),
        })

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.subscriptions.queue.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.subscriptions.queue.subtitle', {
                awaiting: kpis.awaitingCount,
                grace: kpis.graceCount,
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to="/console/subscriptions/invoices"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.subscriptions.queue.invoicesLink')}
            </Link>
            <Link
              to="/console/settings"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.subscriptions.queue.settingsLink')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.subscriptions.queue.kpi.awaiting')}
            value={String(kpis.awaitingCount)}
            note={t('console.subscriptions.queue.kpi.awaitingNote', {
              amount: omr(kpis.awaitingTotal),
            })}
            tone="watch"
          />
          <QueueKpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.subscriptions.queue.kpi.grace')}
            value={String(kpis.graceCount)}
            note={t('console.subscriptions.queue.kpi.graceNote', {
              days: PLATFORM_SETTINGS.lifecycle.graceDays,
            })}
            tone={kpis.graceCount > 0 ? 'bad' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleSubscriptionIcon className="size-[18px] text-primary-700" />}
            title={t('console.subscriptions.queue.kpi.trials')}
            value={String(kpis.trialsEnding)}
            suffix={t('console.subscriptions.queue.kpi.trialsOf', { total: kpis.trialsTotal })}
            note={t('console.subscriptions.queue.kpi.trialsNote')}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.subscriptions.queue.kpi.collected')}
            value={`OMR ${omr(kpis.collectedThisMonth)}`}
            note={t('console.subscriptions.queue.kpi.collectedNote', {
              count: paymentsThisMonth,
              month,
            })}
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {SUBSCRIPTION_TABS.map((entry) => {
              const active = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={active}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-tertiary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {tabLabel(entry.id)}
                  <span className="text-xs font-semibold text-text-quaternary">
                    {count(entry.count)}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('console.subscriptions.queue.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              <FilterMenu<PlanFilter>
                label={t('console.subscriptions.queue.filter.plan')}
                value={plan}
                defaultValue="all"
                onChange={setPlan}
                options={[
                  { value: 'all', label: t('console.subscriptions.queue.filter.planAll') },
                  ...PLAN_OPTIONS.map((id) => ({ value: id, label: t(planLabelKey(id)) })),
                ]}
              />
              <FilterMenu<MethodFilter>
                label={t('console.subscriptions.queue.filter.method')}
                value={method}
                defaultValue="all"
                onChange={setMethod}
                options={[
                  { value: 'all', label: t('console.subscriptions.queue.filter.methodAll') },
                  ...METHODS.map((id) => ({
                    value: id,
                    label: t(`console.subscriptions.method.${id}`),
                  })),
                ]}
              />
              <FilterMenu<TermFilter>
                label={t('console.subscriptions.queue.filter.term')}
                value={term}
                defaultValue="all"
                onChange={setTerm}
                width={180}
                options={[
                  { value: 'all', label: t('console.subscriptions.queue.filter.termAll') },
                  ...TERMS.map((id) => ({
                    value: id,
                    label: t(`console.subscriptions.term.${id}`),
                  })),
                ]}
              />
              <SortMenu value={sort} onChange={setSort} options={SORT_OPTIONS} width={220} />
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1000px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('console.subscriptions.queue.col.tenant')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.queue.col.plan')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.queue.col.state')}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.subscriptions.queue.col.amountDue')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.queue.col.method')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.queue.col.lastPayment')}
                  </th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ subscription, tenant }) => {
                  const detail = stateDetail(t, i18n.language, ledger, subscription)
                  const link = linksOf(ledger, subscription.tenantId)[0]
                  return (
                    <tr
                      key={subscription.tenantId}
                      className="border-b border-[#f3f3f3] last:border-b-0"
                    >
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                            {tenant.initials}
                          </span>
                          <span className="min-w-0">
                            <Link
                              to={`/console/tenants/${tenant.id}`}
                              className="text-base font-medium leading-[1.2] text-text-primary transition-colors hover:text-primary-700"
                            >
                              {tenant.name}
                            </Link>
                            <span className="mt-1 block text-xs font-medium text-text-quaternary">
                              {tenant.town} · {t('console.subscriptions.queue.vat')} {tenant.vat} ·{' '}
                              {tenant.contact.name}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block text-sm font-medium text-text-primary">
                          {t(planLabelKey(subscription.plan))}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(`console.subscriptions.term.${subscription.term}`)}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <SubscriptionStatePill state={subscription.state} />
                        <span
                          className={`mt-1.5 block text-xs font-medium ${DETAIL_TONE[detail.tone]}`}
                        >
                          {detail.text}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        {subscription.amountDue > 0 ? (
                          <span className="block whitespace-nowrap text-sm font-semibold text-text-primary">
                            <span className="me-1">
                              <Rial />
                            </span>
                            {omr(subscription.amountDue)}
                          </span>
                        ) : (
                          <span className="block text-sm font-medium text-text-quaternary">—</span>
                        )}
                      </td>
                      <td className="px-2 py-4">
                        <span className="block text-sm font-medium text-text-primary">
                          {t(`console.subscriptions.methodShort.${subscription.preferredMethod}`)}
                        </span>
                        {link ? (
                          <span className="mt-1.5 block">
                            <LinkStatusPill status={linkStatusAt(link)} />
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4">
                        {subscription.lastPayment ? (
                          <>
                            <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                              {day(subscription.lastPayment.at)}
                            </span>
                            <span className="mt-1 block text-xs font-medium text-text-quaternary">
                              {t(
                                `console.subscriptions.methodShort.${subscription.lastPayment.method}`,
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="block text-sm font-medium text-text-quaternary">
                            {t('console.subscriptions.queue.noPayment')}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-4">
                        <ActionMenu
                          items={subscriptionRowActions(subscription.tenantId, subscription.state)}
                          label={t('console.subscriptions.queue.rowMenu')}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('console.subscriptions.queue.noResults')}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">{footer}</p>
            <p className="text-xs font-medium text-text-quaternary">
              {t('console.subscriptions.queue.allCount', {
                count: count(SUBSCRIPTION_TABS[0].count),
              })}
            </p>
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import {
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsolePlansIcon,
  ConsoleTickIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import { ActionMenu, Rial, RowsView, SortMenu, withRial } from '../../components/ui'
import { subscriptionInvoiceRowActions } from '../../lib/rowActions'
import { count, omr } from '../../lib/superAdmin'
import { formatDay, localeFor } from '../../lib/console/format'
import {
  SUBSCRIPTIONS_NOW,
  daysUntil,
  planLabelKey,
  tenantIdentity,
  useSubscriptions,
  type InvoiceStatus,
  type SubscriptionInvoice,
  type SubscriptionPlanId,
} from '../../lib/consoleSubscriptions'
import { QueueKpiCard } from './subscriptions/QueueKpiCard'
import { InvoiceStatusPill } from './subscriptions/SubscriptionStatePill'
import searchIcon from '../../assets/dashboard/search.svg'

type TabId = 'all' | InvoiceStatus
type SortId = 'issued' | 'due' | 'total'

const TABS: TabId[] = ['all', 'unpaid', 'overdue', 'paid', 'waived']

const SORT_OPTIONS: { value: SortId; labelKey: string }[] = [
  { value: 'issued', labelKey: 'console.subscriptions.invoices.sort.issued' },
  { value: 'due', labelKey: 'console.subscriptions.invoices.sort.due' },
  { value: 'total', labelKey: 'console.subscriptions.invoices.sort.total' },
]

const inMonth = (date: Date | undefined, of: Date) =>
  !!date && date.getMonth() === of.getMonth() && date.getFullYear() === of.getFullYear()

export function SubscriptionInvoicesPage() {
  const { t, i18n } = useTranslation()
  const ledger = useSubscriptions()
  const [tab, setTab] = useState<TabId>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortId>('issued')

  const day = (date: Date) => formatDay(date.toISOString(), i18n.language)
  const month = SUBSCRIPTIONS_NOW.toLocaleDateString(localeFor(i18n.language), { month: 'long' })
  const invoices = ledger.invoices

  const byStatus = (status: InvoiceStatus) =>
    invoices.filter((invoice) => invoice.status === status)
  const unpaid = byStatus('unpaid')
  const overdue = byStatus('overdue')
  const paidThisMonth = byStatus('paid').filter((invoice) =>
    inMonth(invoice.paidOn, SUBSCRIPTIONS_NOW),
  )
  const tabCount = (id: TabId) => (id === 'all' ? invoices.length : byStatus(id).length)
  const tabLabel = (id: TabId) =>
    id === 'all'
      ? t('console.subscriptions.invoices.tab.all')
      : t(`console.subscriptions.invoiceStatus.${id}`)

  const needle = query.trim().toLowerCase()
  const rows = (tab === 'all' ? invoices : byStatus(tab))
    .map((invoice) => ({ invoice, tenant: tenantIdentity(invoice.tenantId) }))
    .filter(({ invoice, tenant }) =>
      `${invoice.number} ${tenant.name} ${tenant.town}`.toLowerCase().includes(needle),
    )
  if (sort === 'issued')
    rows.sort((a, b) => b.invoice.issued.getTime() - a.invoice.issued.getTime())
  if (sort === 'due') rows.sort((a, b) => a.invoice.due.getTime() - b.invoice.due.getTime())
  if (sort === 'total') rows.sort((a, b) => b.invoice.total - a.invoice.total)

  /** What the last column says: when it was paid and how, or when it falls due. */
  const settlement = (invoice: SubscriptionInvoice) => {
    if (invoice.status === 'paid' && invoice.paidOn)
      return {
        text: t('console.subscriptions.invoices.paidOn', { date: day(invoice.paidOn) }),
        line: invoice.method ? t(`console.subscriptions.methodShort.${invoice.method}`) : '',
        tone: 'text-text-primary',
      }
    if (invoice.status === 'waived') return { text: '—', line: '', tone: 'text-text-quaternary' }
    const left = daysUntil(invoice.due)
    if (left > 0)
      return {
        text: t('console.subscriptions.invoices.due', { date: day(invoice.due) }),
        line: '',
        tone: 'text-text-primary',
      }
    if (left === 0)
      return {
        text: t('console.subscriptions.invoices.dueToday'),
        line: '',
        tone: 'text-pending-700',
      }
    return {
      text: t('console.subscriptions.invoices.overdue', { count: -left }),
      line: day(invoice.due),
      tone: invoice.status === 'overdue' ? 'text-danger-700' : 'text-pending-700',
    }
  }

  const cover = (invoice: SubscriptionInvoice) =>
    t(invoice.coverKey, {
      ...invoice.coverValues,
      plan: t(planLabelKey((invoice.coverValues?.plan as SubscriptionPlanId) ?? 'starter')),
    })

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.subscriptions', to: '/console/subscriptions' },
            { labelKey: 'console.subscriptions.invoices.title' },
          ]}
        />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.subscriptions.invoices.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.subscriptions.invoices.subtitle', {
                unpaid: unpaid.length,
                overdue: overdue.length,
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.subscriptions.invoices.kpi.unpaid')}
            value={String(unpaid.length)}
            note={t('console.subscriptions.invoices.kpi.unpaidNote', {
              amount: omr(unpaid.reduce((sum, invoice) => sum + invoice.total, 0)),
            })}
            tone="watch"
          />
          <QueueKpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.subscriptions.invoices.kpi.overdue')}
            value={String(overdue.length)}
            note={t('console.subscriptions.invoices.kpi.overdueNote', {
              amount: omr(overdue.reduce((sum, invoice) => sum + invoice.total, 0)),
            })}
            tone={overdue.length > 0 ? 'bad' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.subscriptions.invoices.kpi.paid')}
            value={`OMR ${omr(paidThisMonth.reduce((sum, invoice) => sum + invoice.total, 0))}`}
            note={t('console.subscriptions.invoices.kpi.paidNote', {
              count: paidThisMonth.length,
              month,
            })}
          />
          <QueueKpiCard
            icon={<ConsolePlansIcon className="size-[18px] text-primary-700" />}
            title={t('console.subscriptions.invoices.kpi.waived')}
            value={String(byStatus('waived').length)}
            note={t('console.subscriptions.invoices.kpi.waivedNote')}
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {TABS.map((id) => {
              const active = id === tab
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={active}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-tertiary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {tabLabel(id)}
                  <span className="text-xs font-semibold text-text-quaternary">
                    {count(tabCount(id))}
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
                placeholder={t('console.subscriptions.invoices.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              <SortMenu value={sort} onChange={setSort} options={SORT_OPTIONS} />
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1040px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('console.subscriptions.invoices.col.invoice')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.invoices.col.tenant')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.invoices.col.period')}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.subscriptions.invoices.col.amount')}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.subscriptions.invoices.col.total')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.invoices.col.status')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.subscriptions.invoices.col.paid')}
                  </th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ invoice, tenant }) => {
                  const paid = settlement(invoice)
                  const settled = invoice.status === 'paid' || invoice.status === 'waived'
                  return (
                    <tr key={invoice.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="px-4 py-4">
                        <span className="block text-sm font-semibold text-text-primary">
                          {invoice.number}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {cover(invoice)}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <Link
                          to={`/console/tenants/${tenant.id}?from=invoices`}
                          className="text-sm font-medium text-text-primary transition-colors hover:text-primary-700"
                        >
                          {tenant.name}
                        </Link>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {tenant.town}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          {day(invoice.periodStart)} – {day(invoice.periodEnd)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t('console.subscriptions.invoices.issued', {
                            date: day(invoice.issued),
                          })}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {omr(invoice.amount)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t('console.subscriptions.invoices.exVat')}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        <span className="block whitespace-nowrap text-sm font-semibold text-text-primary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {omr(invoice.total)}
                        </span>
                        <span className="mt-1 block whitespace-nowrap text-xs font-medium text-text-quaternary">
                          {withRial(
                            t('console.subscriptions.invoices.plusVat', { vat: omr(invoice.vat) }),
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <InvoiceStatusPill status={invoice.status} />
                      </td>
                      <td className="px-2 py-4">
                        <span
                          className={`block whitespace-nowrap text-sm font-medium ${paid.tone}`}
                        >
                          {paid.text}
                        </span>
                        {paid.line ? (
                          <span className="mt-1 block text-xs font-medium text-text-quaternary">
                            {paid.line}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4">
                        <ActionMenu
                          items={subscriptionInvoiceRowActions(tenant.id, invoice.id, settled)}
                          label={t('console.subscriptions.invoices.rowMenu')}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('console.subscriptions.invoices.noResults')}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {tab === 'all'
                ? t('console.subscriptions.invoices.showingAll', {
                    shown: rows.length,
                    total: count(tabCount('all')),
                  })
                : t('console.subscriptions.invoices.showing', {
                    shown: rows.length,
                    total: count(tabCount(tab)),
                    tab: tabLabel(tab).toLowerCase(),
                  })}
            </p>
            <p className="text-xs font-medium text-text-quaternary">
              {t('console.subscriptions.invoices.allCount', { count: count(invoices.length) })}
            </p>
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

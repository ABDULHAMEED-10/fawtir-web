import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import {
  ConsoleBuildingIcon,
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsoleQueueIcon,
  ConsoleSubscriptionIcon,
  ConsoleTickIcon,
} from '../../../layouts/ConsoleShell/consoleIcons'
import {
  ActionMenu,
  FilterMenu,
  RowsView,
  SortMenu,
  type ActionMenuItem,
} from '../../../components/ui'
import {
  STALE_DAYS,
  connectionsNeedingAttention,
  isStale,
  platformErpKpis,
  tenantName,
  useConsoleErp,
  versionById,
  type PlatformConnection,
} from '../../../lib/consoleErp'
import { tenantIdentity } from '../../../lib/consoleSubscriptions'
import type { ConnectionState, Product } from '../../../lib/erpConnector'
import { count, omr } from '../../../lib/superAdmin'
import { QueueKpiCard } from '../subscriptions/QueueKpiCard'
import { ConnectionStatePill, MappingStatusPill, attentionReason, whenLabel } from './erpShared'
import searchIcon from '../../../assets/dashboard/search.svg'
import viewIcon from '../../../assets/actions/view.svg'
import statementIcon from '../../../assets/actions/statement.svg'

type StateFilter = 'all' | ConnectionState
type ProductFilter = 'all' | Product
type SortId = 'lastRun' | 'tenant'

const STATES: ConnectionState[] = ['CONNECTED', 'ERROR', 'PAUSED', 'DRAFT', 'DISCONNECTED']
const SORT_OPTIONS: { value: SortId; labelKey: string }[] = [
  { value: 'lastRun', labelKey: 'console.erp.connections.sort.lastRun' },
  { value: 'tenant', labelKey: 'console.erp.connections.sort.tenant' },
]

const rowActions = (c: PlatformConnection): ActionMenuItem[] => [
  {
    id: 'open',
    labelKey: 'console.erp.connections.row.open',
    icon: viewIcon,
    to: `/console/erp/connections/${c.id}`,
  },
  {
    id: 'openTenant',
    labelKey: 'console.erp.connections.row.openTenant',
    icon: statementIcon,
    to: `/console/tenants/${c.tenantId}?tab=erp`,
  },
]

/**
 * Every tenant's ERP connections seen from the platform (docs/erp-and-console-plan.md §9.3):
 * the figures, who needs a person today, and the full table with filters. Rows open the
 * read-only connection page; nothing here touches a tenant's credentials.
 */
export function ConsoleErpPage() {
  const { t, i18n } = useTranslation()
  const erp = useConsoleErp()
  const [query, setQuery] = useState('')
  const [state, setState] = useState<StateFilter>('all')
  const [product, setProduct] = useState<ProductFilter>('all')
  const [sort, setSort] = useState<SortId>('lastRun')

  const kpis = platformErpKpis(erp)
  const attention = connectionsNeedingAttention(erp)
  const tenants = new Set(erp.connections.map((c) => c.tenantId)).size
  const products = [...new Set(erp.connections.map((c) => c.product))]
  const key = (name: string) => `console.erp.connections.${name}`

  const needle = query.trim().toLowerCase()
  const rows = erp.connections
    .map((connection) => ({ connection, tenant: tenantIdentity(connection.tenantId) }))
    .filter(
      ({ connection, tenant }) =>
        (state === 'all' || connection.state === state) &&
        (product === 'all' || connection.product === product) &&
        `${tenant.name} ${connection.label} ${connection.erpVersion}`
          .toLowerCase()
          .includes(needle),
    )
  if (sort === 'lastRun')
    rows.sort(
      (a, b) => (b.connection.lastRunAt?.getTime() ?? 0) - (a.connection.lastRunAt?.getTime() ?? 0),
    )
  if (sort === 'tenant')
    rows.sort(
      (a, b) =>
        a.tenant.name.localeCompare(b.tenant.name) ||
        a.connection.label.localeCompare(b.connection.label),
    )

  const templateLabel = (c: PlatformConnection) => {
    const found = versionById(erp, c.templateVersionId)
    return found
      ? t(key('template.version'), {
          name: found.template.name,
          version: found.version.version,
        })
      : t(key('template.handWritten'))
  }

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs
          items={[
            { labelKey: 'console.nav.group.erp' },
            { labelKey: 'console.nav.erpConnections' },
          ]}
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t(key('title'))}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t(key('subtitle'), {
                connections: kpis.connections,
                tenants,
                attention: attention.length,
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to="/console/erp/templates"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.nav.erpTemplates')}
            </Link>
            <Link
              to="/console/erp/add-on-requests"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.nav.erpRequests')}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
          <QueueKpiCard
            icon={<ConsoleBuildingIcon className="size-[18px] text-primary-700" />}
            title={t(key('kpi.tenants'))}
            value={String(kpis.tenantsOnAddon)}
            note={t(key('kpi.tenantsNote'), {
              paying: kpis.tenantsPaying,
              included: kpis.tenantsOnAddon - kpis.tenantsPaying,
            })}
          />
          <QueueKpiCard
            icon={<ConsoleQueueIcon className="size-[18px] text-primary-700" />}
            title={t(key('kpi.connections'))}
            value={String(kpis.connections)}
            note={t(key('kpi.connectionsNote'), {
              paused: kpis.paused,
              rejections: kpis.rejections,
            })}
          />
          <QueueKpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t(key('kpi.inError'))}
            value={String(kpis.inError)}
            note={t(key('kpi.inErrorNote'))}
            tone={kpis.inError > 0 ? 'bad' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t(key('kpi.stale'))}
            value={String(kpis.stale)}
            note={t(key('kpi.staleNote'), { days: STALE_DAYS })}
            tone={kpis.stale > 0 ? 'watch' : 'calm'}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t(key('kpi.collected'))}
            value={count(kpis.collectedThisMonth)}
            note={t(key('kpi.collectedNote'), {
              amount: omr(kpis.monthlyRevenue),
              paying: kpis.tenantsPaying,
            })}
          />
          <Link
            to="/console/erp/add-on-requests"
            className="flex min-w-[240px] flex-1 rounded-md transition-shadow hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
            aria-label={t(key('kpi.requestsOpen'))}
          >
            <QueueKpiCard
              icon={<ConsoleSubscriptionIcon className="size-[18px] text-primary-700" />}
              title={t(key('kpi.requests'))}
              value={String(kpis.pendingRequests)}
              note={t(key('kpi.requestsNote'))}
              tone={kpis.pendingRequests > 0 ? 'watch' : 'calm'}
            />
          </Link>
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t(key('attention.title'))}
            </h2>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {t(key('attention.subtitle'))}
            </p>
          </div>
          {attention.length === 0 ? (
            <p className="px-5 py-4 text-sm font-medium leading-[1.5] text-text-tertiary">
              {t(key('attention.none'))}
            </p>
          ) : (
            <ul>
              {attention.map((c) => {
                const bad = c.state === 'ERROR'
                return (
                  <li key={c.id} className="border-b border-border-subtle last:border-b-0">
                    <Link
                      to={`/console/erp/connections/${c.id}`}
                      className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-primary-25"
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${bad ? 'bg-danger-700' : 'bg-pending-500'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium leading-[1.2] text-text-primary">
                          {tenantName(c.tenantId)}
                          <span className="text-text-quaternary"> · </span>
                          <span className="text-text-secondary">{c.label}</span>
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(`erp.connector.product.${c.product}`)} {c.erpVersion} ·{' '}
                          {t(key('lastRunShort'), { when: whenLabel(c.lastRunAt, i18n.language) })}
                        </span>
                      </span>
                      <span
                        className={`text-end text-sm font-semibold ${bad ? 'text-danger-700' : 'text-pending-700'}`}
                      >
                        {attentionReason(t, c)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t(key('searchPlaceholder'))}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              <FilterMenu<StateFilter>
                label={t(key('filter.state'))}
                value={state}
                defaultValue="all"
                onChange={setState}
                options={[
                  { value: 'all', label: t(key('filter.stateAll')) },
                  ...STATES.map((id) => ({
                    value: id,
                    label: t(`erp.connector.state.${id}`),
                    count: erp.connections.filter((c) => c.state === id).length,
                  })),
                ]}
              />
              <FilterMenu<ProductFilter>
                label={t(key('filter.product'))}
                value={product}
                defaultValue="all"
                onChange={setProduct}
                options={[
                  { value: 'all', label: t(key('filter.productAll')) },
                  ...products.map((id) => ({
                    value: id,
                    label: t(`erp.connector.product.${id}`),
                    count: erp.connections.filter((c) => c.product === id).length,
                  })),
                ]}
              />
              <SortMenu value={sort} onChange={setSort} options={SORT_OPTIONS} width={220} />
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1080px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-4 py-3 text-start font-semibold">{t(key('col.tenant'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.connection'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.state'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.mapping'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.template'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.lastRun'))}</th>
                  <th className="px-2 py-3 text-start font-semibold">{t(key('col.nextRun'))}</th>
                  <th className="px-2 py-3 text-end font-semibold">{t(key('col.collected'))}</th>
                  <th className="px-2 py-3 text-end font-semibold">{t(key('col.rejections'))}</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ connection: c, tenant }) => {
                  const lastRun = c.recentRuns[0]
                  const stale = isStale(c)
                  return (
                    <tr key={c.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                            {tenant.initials}
                          </span>
                          <span className="min-w-0">
                            <Link
                              to={`/console/tenants/${tenant.id}?tab=erp`}
                              className="text-base font-medium leading-[1.2] text-text-primary transition-colors hover:text-primary-700"
                            >
                              {tenant.name}
                            </Link>
                            <span className="mt-1 block text-xs font-medium text-text-quaternary">
                              {tenant.town}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <Link
                          to={`/console/erp/connections/${c.id}`}
                          className="block text-sm font-medium text-text-primary transition-colors hover:text-primary-700"
                        >
                          {c.label}
                        </Link>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(`erp.connector.product.${c.product}`)} {c.erpVersion}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <ConnectionStatePill state={c.state} />
                        {c.state === 'ERROR' || stale ? (
                          <span
                            className={`mt-1.5 block text-xs font-medium ${c.state === 'ERROR' ? 'text-danger-700' : 'text-pending-700'}`}
                          >
                            {attentionReason(t, c)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4">
                        <MappingStatusPill status={c.mappingStatus} />
                      </td>
                      <td className="px-2 py-4">
                        <span className="block text-sm font-medium text-text-primary">
                          {templateLabel(c)}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          {whenLabel(c.lastRunAt, i18n.language)}
                        </span>
                        {lastRun ? (
                          <span
                            className={`mt-1 block text-xs font-medium ${lastRun.state === 'FAILED' ? 'text-danger-700' : 'text-text-quaternary'}`}
                          >
                            {t(`erp.connector.runState.${lastRun.state}`)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-4">
                        <span className="block whitespace-nowrap text-sm font-medium text-text-primary">
                          {c.nextRunAt ? whenLabel(c.nextRunAt, i18n.language) : '—'}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {c.nextRunAt
                            ? t(`erp.connector.schedule.${c.scheduleMinutes}`)
                            : t(key('notScheduled'))}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        <span className="block text-sm font-semibold text-text-primary">
                          {count(c.collectedThisMonth)}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        <span
                          className={`block text-sm font-semibold ${c.rejections > 0 ? 'text-danger-700' : 'text-text-quaternary'}`}
                        >
                          {c.rejections > 0 ? count(c.rejections) : '—'}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <ActionMenu items={rowActions(c)} label={t(key('rowMenu'))} floating />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t(key('noResults'))}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {t(key('showing'), { shown: rows.length, total: erp.connections.length })}
            </p>
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

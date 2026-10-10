import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ActionMenu, FilterMenu, Pager, RowsView, SortMenu, type ActionMenuItem } from '../../components/ui'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill, type ConsolePillTone } from '../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  ConsoleBuildingIcon,
  ConsoleClockIcon,
  ConsoleIncidentIcon,
  ConsolePlansIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import { useConsoleRead } from '../../layouts/ConsoleShell/useConsoleRead'
import {
  REVIEW_PERMISSION,
  VERIFICATION_ROUTE,
  queuePath,
  type CompanySummary,
  type CompanySummaryPage,
} from '../../lib/console/companyVerification'
import { countryName, formatDay, localeFor } from '../../lib/console/format'
import {
  CONSOLE_CARD,
  CONSOLE_LINK,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_ROWS,
  CONSOLE_SECONDARY,
  CONSOLE_TABLE,
  CONSOLE_TABLE_BODY,
  CONSOLE_TAB_BAR,
  CONSOLE_TAB_COUNT,
  CONSOLE_TAB_LINE,
  CONSOLE_THEAD,
  ConsoleKpi,
  ConsolePageHeader,
} from '../../layouts/ConsoleShell/consoleStyle'
import { CONSOLE_TONE_TEXT, CONSOLE_TONE_TINT, consoleTab, type ConsoleTone } from '../../layouts/ConsoleShell/consoleTones'
import {
  STATUS_FILTERS,
  TENANT_TABS,
  UNREPORTED_TABS,
  awaitingReview,
  initialsOf,
  tabCounts,
  tenureOf,
  visibleRows,
  type StatusFilter,
  type TenantSort,
  type TenantTab,
} from './tenants/tenantList'
import searchIcon from '../../assets/dashboard/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import viewIcon from '../../assets/actions/view.svg'
import statementIcon from '../../assets/actions/statement.svg'

const TENANTS_ROUTE = '/console/tenants'

const SORT_OPTIONS: { value: TenantSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'console.tenants.sort.newest' },
  { value: 'oldest', labelKey: 'console.tenants.sort.oldest' },
  { value: 'name', labelKey: 'console.tenants.sortName' },
]

/** Reads the page from the URL. One-based in the URL, zero-based to the backend. */
function tenantsPage(params: URLSearchParams): number {
  const page = Number(params.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * The platform's register of tenants, drawn to "Super Admin -> Tenants" (Figma 154:112167).
 *
 * Its one request is unchanged: `GET /v1/platform/companies?page&size`, paged and ordered by the
 * backend. Tabs, search, filter and sort work over the rows that request returned, so on a
 * register longer than one page they say "on this page".
 *
 * The frame's plan, quota, filing health, monthly amount, risk pills, three of its KPIs and the
 * export are drawn in place but empty ("—", a neutral bar): the summary carries none of those
 * fields and no endpoint publishes them. Each is a `TODO(backend)` citing its row in
 * docs/backend-guides/CONSOLE.md, so nothing here is an invented figure for a real business.
 */
export function TenantsPage() {
  return (
    <ConsoleShell requires={REVIEW_PERMISSION}>
      <TenantsRegister />
    </ConsoleShell>
  )
}

function TenantsRegister() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const page = tenantsPage(params)
  // 'all' sends no status filter, which is what an operational register wants:
  // every tenant, not only the ones awaiting a decision.
  const { read, retry } = useConsoleRead<CompanySummaryPage>(queuePath('all', page - 1))
  const number = new Intl.NumberFormat(localeFor(i18n.language))
  const [tab, setTab] = useState<TenantTab>('all')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<TenantSort>('newest')

  const goTo = (next: number) => {
    const params = new URLSearchParams()
    if (next > 1) params.set('page', String(next))
    setParams(params)
  }

  const data = read.status === 'ready' ? read.data : null
  const loadedRows = data?.items ?? []
  // One page holds the whole register: then the loaded rows' counts are the platform's own.
  const complete = data !== null && data.totalPages <= 1
  const counts = tabCounts(loadedRows)
  const live = loadedRows.filter((row) => row.tenantStatus === 'ACTIVE').length
  const rows = visibleRows(loadedRows, { tab, query, status, sort, language: i18n.language })
  const narrowed = tab !== 'all' || query.trim() !== '' || status !== 'all'
  const tabLabel = (id: TenantTab) => t(`console.tenants.tab.${id}`)
  const none = t('console.tenants.none')

  let body
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.tenants.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.items.length === 0) {
    body =
      read.data.totalElements === 0 ? (
        <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
          {t('console.tenants.empty')}
        </p>
      ) : (
        <ConsoleNotice
          body={t('console.tenants.pastEnd')}
          action={{ label: t('console.tenants.firstPage'), onClick: () => goTo(1) }}
        />
      )
  } else if (UNREPORTED_TABS.has(tab)) {
    // TODO(backend): CONSOLE.md rows 1.3 and 1.6, filing activity and quota use per tenant.
    body = (
      <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.tenants.notReportedTab')}
      </p>
    )
  } else {
    body = (
      <>
        <TenantsTable rows={rows} />
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
            {t('console.tenants.noResults')}
          </p>
        ) : null}
      </>
    )
  }

  const loaded = data && data.items.length > 0 ? data : null

  let footer = ''
  if (loaded) {
    footer = narrowed
      ? t(complete ? 'console.tenants.showingShown' : 'console.tenants.showingShownPage', {
          shown: number.format(rows.length),
          total: number.format(loaded.items.length),
        })
      : t('console.tenants.showingRange', {
          from: number.format(loaded.page * loaded.size + 1),
          to: number.format(loaded.page * loaded.size + loaded.items.length),
          total: number.format(loaded.totalElements),
        })
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.tenants' }]} />
      <ConsolePageHeader
        title={t('console.tenants.title')}
        subtitle={
          data
            ? complete
              ? t('console.tenants.subtitle', {
                  live: number.format(live),
                  onboarding: number.format(counts.onboarding ?? 0),
                })
              : t('console.tenants.subtitleTotal', {
                  total: number.format(data.totalElements),
                })
            : t('console.tenants.subtitlePlain')
        }
        actionsClassName="max-md:w-full"
        actions={
          <>
            {/* TODO(backend): CONSOLE.md row 1.12, no export endpoint for the register yet. */}
            <button
              type="button"
              disabled
              title={t('console.tenants.exportSoon')}
              className={`${CONSOLE_SECONDARY} max-md:flex-1`}
            >
              {t('console.tenants.export')}
            </button>
            <Link to="/console/tenants/new" className={`${CONSOLE_PRIMARY} max-md:flex-1`}>
              {t('console.tenants.onboard')}
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-4">
        <ConsoleKpi
          icon={<ConsoleBuildingIcon className="size-4 text-primary-700" />}
          title={t('console.tenants.kpi.live')}
          // TODO(backend): CONSOLE.md row 1.1, a platform-wide count by status and the month's
          // joins and departures. Counted here only when one page holds the whole register.
          value={complete ? number.format(live) : none}
          note={
            complete
              ? t('console.tenants.kpi.liveOf', { total: number.format(data.totalElements) })
              : t('console.tenants.kpi.livePaged')
          }
        />
        <ConsoleKpi
          icon={<ConsoleIncidentIcon className="size-4 text-danger-700" />}
          title={t('console.tenants.kpi.atRisk')}
          // TODO(backend): CONSOLE.md row 1.2, certificate expiry and quota with overage off.
          value={none}
          note={t('console.tenants.kpi.atRiskEmpty')}
        />
        <ConsoleKpi
          icon={<ConsoleClockIcon className="size-4 text-pending-500" />}
          title={t('console.tenants.kpi.quiet')}
          // TODO(backend): CONSOLE.md row 1.3, last filing per tenant.
          value={none}
          note={t('console.tenants.kpi.quietEmpty')}
        />
        <ConsoleKpi
          icon={<ConsolePlansIcon className="size-4 text-success-700" />}
          title={t('console.tenants.kpi.revenue')}
          // TODO(backend): CONSOLE.md row 1.4, monthly recurring revenue and its average.
          value={none}
          note={t('console.tenants.kpi.revenueEmpty')}
        />
      </div>

      <section className={`flex flex-col overflow-hidden ${CONSOLE_CARD}`}>
        {/* On a phone the strip scrolls sideways inside itself rather than wrapping. */}
        <div
          role="tablist"
          aria-label={t('console.tenants.tabsLabel')}
          className={`${CONSOLE_TAB_BAR} max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none]`}
        >
          {TENANT_TABS.map((id) => {
            const active = id === tab
            const tally = id === 'all' && data ? data.totalElements : counts[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`${consoleTab(active)} shrink-0 whitespace-nowrap`}
              >
                {tabLabel(id)}
                {data ? (
                  <span
                    className={`${CONSOLE_TAB_COUNT} ${active ? 'text-primary-800' : 'text-[#494d56]'}`}
                  >
                    {tally === null ? none : number.format(tally)}
                  </span>
                ) : null}
                {active ? <span className={`${CONSOLE_TAB_LINE} max-md:bottom-0`} /> : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <span className="sr-only">{t('console.tenants.searchLabel')}</span>
            {/* TODO(backend): CONSOLE.md row 1.10, search by VAT number and Peppol ID. */}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('console.tenants.searchLoaded')}
              className="h-full w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            {/* TODO(backend): CONSOLE.md row 1.11, filter and sort on the server. */}
            <FilterMenu<StatusFilter>
              label={t('console.tenants.filters')}
              icon={filterIcon}
              value={status}
              defaultValue="all"
              onChange={setStatus}
              options={STATUS_FILTERS.map((value) => ({
                value,
                label: t(`console.tenants.filter.${value}`),
              }))}
            />
            <SortMenu value={sort} onChange={setSort} options={SORT_OPTIONS} width={220} />
          </div>
        </div>

        {/* The table runs to the card's edges; a notice keeps the card's padding. */}
        <div className={CONSOLE_TABLE_BODY}>{body}</div>

        {loaded ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-5 py-4">
            <div>
              <p className="text-[13.5px] font-medium text-text-muted">{footer}</p>
              {!complete ? (
                <p className="mt-1 text-xs font-medium text-text-quaternary">
                  {t('console.tenants.pageOnly')}
                </p>
              ) : null}
            </div>
            {loaded.totalPages > 1 ? (
              <Pager
                page={loaded.page + 1}
                pageCount={loaded.totalPages}
                onChange={goTo}
                labels={{
                  nav: t('console.tenants.pager.label'),
                  previous: t('console.tenants.pager.previous'),
                  next: t('console.tenants.pager.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}

/** The tile's tone: red for a refused or suspended tenant, grey while onboarding or closed. */
function toneOf(tenant: CompanySummary): ConsoleTone | 'neutral' {
  if (tenant.verificationStatus === 'REJECTED' || tenant.tenantStatus === 'SUSPENDED') return 'bad'
  if (tenant.tenantStatus === 'ACTIVE') return 'info'
  return 'neutral'
}

function monthYear(iso: string, language: string): string {
  return new Intl.DateTimeFormat(localeFor(language), { month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

/** The pills beside the name, from the fields the summary carries. */
function StatusPills({ tenant }: { tenant: CompanySummary }) {
  const { t } = useTranslation()
  const pills: { tone: ConsolePillTone; label: string }[] = []
  if (tenant.verificationStatus === 'REJECTED') {
    // A refused registration keeps its account pending, so "Pending" alone would read as still
    // waiting. The verification outcome the row already carries says why.
    pills.push({ tone: 'danger', label: t('console.verification.status.REJECTED') })
  } else if (awaitingReview(tenant)) {
    pills.push({ tone: 'pending', label: t('console.verification.status.PENDING_VERIFICATION') })
  } else if (tenant.tenantStatus === 'PENDING') {
    pills.push({ tone: 'neutral', label: t('console.tenants.pill.onboarding') })
  }
  if (tenant.tenantStatus === 'SUSPENDED')
    pills.push({ tone: 'danger', label: t('console.tenants.status.SUSPENDED') })
  if (tenant.tenantStatus === 'CLOSED')
    pills.push({ tone: 'neutral', label: t('console.tenants.status.CLOSED') })
  // TODO(backend): CONSOLE.md rows 1.2, 1.3 and 1.7, the risk pills (certificate expiry, quota
  // share, days quiet, share refused today) need per-tenant fields the summary lacks.
  return (
    <>
      {pills.map((pill) => (
        <ConsoleStatusPill key={pill.label} tone={pill.tone} label={pill.label} />
      ))}
    </>
  )
}

function TenantsTable({ rows }: { rows: CompanySummary[] }) {
  const { t, i18n } = useTranslation()
  const none = t('console.tenants.none')
  if (rows.length === 0) return null

  return (
    <RowsView className={CONSOLE_ROWS}>
      <table className={`${CONSOLE_TABLE} min-w-[1000px]`}>
        <thead>
          <tr className={CONSOLE_THEAD}>
            <th className="px-4 py-3 text-start">{t('console.tenants.col.business')}</th>
            <th className="w-[130px] px-2 py-3 text-start">{t('console.tenants.col.plan')}</th>
            <th className="w-[170px] px-2 py-3 text-start">{t('console.tenants.col.quota')}</th>
            <th className="w-[200px] px-2 py-3 text-start">{t('console.tenants.col.health')}</th>
            <th className="w-[110px] px-2 py-3 text-end">{t('console.tenants.col.monthly')}</th>
            <th className="w-12 px-2 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((tenant) => {
            const tone = toneOf(tenant)
            const decision =
              tenant.verificationStatus === 'PENDING_VERIFICATION' ||
              tenant.verificationStatus === 'REJECTED'
            const tenure = tenant.submittedAt ? tenureOf(tenant.submittedAt) : null
            const onboarding = tenant.tenantStatus === 'PENDING'
            const menu: ActionMenuItem[] = [
              {
                id: 'open',
                labelKey: 'console.tenants.action.open',
                icon: viewIcon,
                to: `${TENANTS_ROUTE}/${tenant.tenantId}`,
              },
            ]
            if (decision) {
              menu.push({
                id: 'decision',
                labelKey:
                  tenant.verificationStatus === 'REJECTED'
                    ? 'console.tenants.seeDecision'
                    : 'console.tenants.review',
                icon: statementIcon,
                to: `${VERIFICATION_ROUTE}/${tenant.tenantId}`,
              })
            }
            return (
              <tr key={tenant.tenantId} className="border-b border-border-subtle last:border-b-0">
                <td className="px-4 py-4">
                  <span className="flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className={`flex size-[42px] shrink-0 items-center justify-center rounded-sm text-[13px] font-bold ${
                        tone === 'neutral'
                          ? 'bg-[#f3f4f5] text-text-muted'
                          : `${CONSOLE_TONE_TINT[tone]} ${CONSOLE_TONE_TEXT[tone]}`
                      }`}
                    >
                      {initialsOf(tenant.tenantName)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
                        <Link
                          to={`${TENANTS_ROUTE}/${tenant.tenantId}`}
                          className="break-words text-[15.5px] font-semibold leading-[1.2] text-text-primary hover:text-primary-800"
                        >
                          {tenant.tenantName}
                        </Link>
                        <StatusPills tenant={tenant} />
                      </span>
                      {/* TODO(backend): CONSOLE.md row 1.9, town and VAT number on the summary. */}
                      <span className="mt-[5px] block text-xs font-medium text-text-muted [overflow-wrap:anywhere]">
                        {tenant.country ? `${countryName(tenant.country, i18n.language)} · ` : ''}
                        <bdi dir="ltr">{tenant.tenantCode}</bdi>
                        {' · '}
                        {tenant.submittedAt
                          ? onboarding
                            ? t('console.tenants.started', {
                                when: formatDay(tenant.submittedAt, i18n.language),
                              })
                            : t('console.tenants.joined', {
                                when: monthYear(tenant.submittedAt, i18n.language),
                              })
                          : t('console.tenants.notSubmitted')}
                      </span>
                    </span>
                  </span>
                </td>
                {/* TODO(backend): CONSOLE.md row 1.5, the tenant's plan and its price. */}
                <td className="px-2 py-4">
                  <span className="block text-[13.5px] font-semibold text-text-quaternary">
                    {none}
                  </span>
                </td>
                {/* TODO(backend): CONSOLE.md row 1.6, documents used of the month's allowance. */}
                <td className="px-2 py-4">
                  <span className="block h-1.5 w-full min-w-[120px] max-w-[150px] rounded-full bg-border-subtle" />
                  <span className="mt-[7px] block text-xs font-semibold text-text-quaternary">
                    {none}
                  </span>
                </td>
                {/* TODO(backend): CONSOLE.md row 1.7, seven days of filing outcomes and a note. */}
                <td className="px-2 py-4">
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, day) => (
                      <span
                        key={day}
                        className="h-1.5 w-[22px] shrink-0 rounded-[2px] bg-border-subtle"
                      />
                    ))}
                  </span>
                  <span className="mt-[7px] block text-xs font-semibold text-text-quaternary">
                    {t('console.tenants.notReported')}
                  </span>
                </td>
                <td className="px-2 py-4 text-end">
                  {/* TODO(backend): CONSOLE.md row 1.8, the month's billed amount. */}
                  <span className="block text-sm font-semibold text-text-quaternary">{none}</span>
                  <span className="mt-[5px] block whitespace-nowrap text-[11.5px] font-medium text-text-muted">
                    {tenure ? t(`console.tenants.tenure.${tenure.unit}`, { count: tenure.count }) : none}
                  </span>
                </td>
                <td className="px-2 py-4">
                  <span className="flex items-center justify-end gap-3">
                    {/*
                      A company awaiting a decision is work, and the decision belongs to the
                      verification queue alone: this directory links to it rather than carrying a
                      second attest/reject implementation.
                    */}
                    {decision ? (
                      <Link
                        to={`${VERIFICATION_ROUTE}/${tenant.tenantId}`}
                        className={`whitespace-nowrap ${CONSOLE_LINK}`}
                      >
                        {t(
                          tenant.verificationStatus === 'REJECTED'
                            ? 'console.tenants.seeDecision'
                            : 'console.tenants.review',
                        )}
                      </Link>
                    ) : null}
                    <ActionMenu items={menu} label={t('console.tenants.rowMenu')} floating />
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}

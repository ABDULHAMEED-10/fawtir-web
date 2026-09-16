import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import {
  ConsoleBuildingIcon,
  ConsoleClockIcon,
  ConsoleIncidentIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import { NavReportsIcon } from '../../layouts/AppShell/navIcons'
import { ActionMenu, FilterMenu, Rial, RowsView, SortMenu, withRial } from '../../components/ui'
import { tenantRowActions } from '../../lib/rowActions'
import {
  ALL_TENANTS,
  NEEDS_ATTENTION,
  PLANS,
  PLATFORM,
  REVENUE,
  REVENUE_PER_TENANT,
  TENANT_TABS,
  count,
  omr,
  tenantsForTab,
  type FilingDay,
  type TenantTabId,
} from '../../lib/superAdmin'
import searchIcon from '../../assets/dashboard/search.svg'

const CHIP_TONE = {
  bad: 'bg-danger-100 text-danger-700',
  watch: 'bg-pending-100 text-pending-700',
  calm: 'bg-primary-50 text-primary-800',
} as const

const HEALTH_TONE = {
  bad: 'text-danger-700',
  watch: 'text-pending-700',
  calm: 'text-text-quaternary',
} as const

/** A day of filing, drawn as one bar of the week strip. */
const DAY_COLOUR: Record<FilingDay, string> = {
  clear: 'bg-success-700',
  some: 'bg-pending-500',
  bad: 'bg-danger-700',
  none: 'bg-neutral-100',
}

function Chip({ label, tone }: { label: string; tone: 'bad' | 'watch' | 'calm' }) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.03em] ${CHIP_TONE[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

function KpiCard({
  icon,
  title,
  value,
  note,
  tone = 'calm',
}: {
  icon: React.ReactNode
  title: string
  value: string
  note: string
  tone?: 'bad' | 'watch' | 'calm'
}) {
  const valueTone =
    tone === 'bad' ? 'text-danger-700' : tone === 'watch' ? 'text-pending-700' : 'text-text-primary'
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2.5 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-background">
          {icon}
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      <p className={`text-[32px] font-semibold leading-[1.2] ${valueTone}`}>{withRial(value)}</p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{withRial(note)}</p>
    </article>
  )
}

export function TenantsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TenantTabId>('all')
  const [query, setQuery] = useState('')

  const rows = tenantsForTab(tab).filter((tenant) =>
    `${tenant.name} ${tenant.vat} ${tenant.town}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const tabCount = TENANT_TABS.find((entry) => entry.id === tab)?.count ?? rows.length

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.tenants' }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.tenants.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.tenants.subtitle', {
                live: count(PLATFORM.live),
                onboarding: PLATFORM.onboarding,
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('console.tenants.export')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('console.tenants.onboard')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <KpiCard
            icon={<ConsoleBuildingIcon className="size-[18px] text-primary-700" />}
            title={t('console.tenants.kpi.live')}
            value={count(PLATFORM.live)}
            note={t('console.tenants.kpi.liveNote', {
              joined: PLATFORM.joinedThisMonth,
              left: PLATFORM.leftThisMonth,
            })}
          />
          <KpiCard
            icon={<ConsoleIncidentIcon className="size-[18px] text-danger-700" />}
            title={t('console.tenants.kpi.atRisk')}
            value={String(NEEDS_ATTENTION)}
            note={t('console.tenants.kpi.atRiskNote', {
              certificates: PLATFORM.certificatesExpiring,
              blocked: PLATFORM.overQuotaBlocked,
            })}
            tone="bad"
          />
          <KpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-pending-700" />}
            title={t('console.tenants.kpi.quiet')}
            value={String(PLATFORM.quiet)}
            note={t('console.tenants.kpi.quietNote', { broken: PLATFORM.quietLooksBroken })}
          />
          <KpiCard
            icon={<NavReportsIcon className="size-[18px] text-success-700" />}
            title={t('console.tenants.kpi.revenue')}
            value={`OMR ${omr(REVENUE)}`}
            note={t('console.tenants.kpi.revenueNote', { average: omr(REVENUE_PER_TENANT) })}
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {TENANT_TABS.map((entry) => {
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
                  {t(entry.labelKey)}
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
                placeholder={t('console.tenants.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              <FilterMenu
                label={t('console.tenants.filters')}
                value="all"
                defaultValue="all"
                onChange={() => {}}
                options={[{ value: 'all', label: t('console.tenants.filterAll') }]}
              />
              <SortMenu
                value="name"
                onChange={() => {}}
                options={[{ value: 'name', labelKey: 'console.tenants.sortName' }]}
              />
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1000px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <th className="px-4 py-3 text-start font-semibold">
                    {t('console.tenants.col.business')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.tenants.col.plan')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.tenants.col.quota')}
                  </th>
                  <th className="px-2 py-3 text-start font-semibold">
                    {t('console.tenants.col.health')}
                  </th>
                  <th className="px-2 py-3 text-end font-semibold">
                    {t('console.tenants.col.monthly')}
                  </th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((tenant) => {
                  const plan = PLANS[tenant.plan]
                  const used = Math.min(tenant.used / plan.quota, 1)
                  return (
                    <tr key={tenant.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-background text-xs font-semibold text-text-tertiary">
                            {tenant.initials}
                          </span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-medium leading-[1.2] text-text-primary">
                                {tenant.name}
                              </span>
                              {tenant.chipKey ? (
                                <Chip
                                  label={t(tenant.chipKey, tenant.chipValues)}
                                  tone={tenant.chipTone ?? 'calm'}
                                />
                              ) : null}
                              {tenant.chip2Key ? (
                                <Chip
                                  label={t(tenant.chip2Key, tenant.chip2Values)}
                                  tone={tenant.chip2Tone ?? 'calm'}
                                />
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs font-medium text-text-quaternary">
                              {tenant.town} · {t('console.tenants.vat')} {tenant.vat} ·{' '}
                              {t(tenant.sinceLabelKey, { when: tenant.since })}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block text-sm font-medium text-text-primary">
                          {t(plan.labelKey)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {tenant.state === 'onboarding'
                            ? t('console.tenants.freeUntil')
                            : withRial(
                                t('console.tenants.perMonth', { amount: omr(plan.monthly) }),
                              )}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="block h-1.5 w-full max-w-[150px] overflow-hidden rounded-full bg-neutral-50">
                          <span
                            className={`block h-full rounded-full ${used >= 0.85 ? 'bg-pending-500' : 'bg-success-700'}`}
                            style={{ width: `${Math.round(used * 100)}%` }}
                          />
                        </span>
                        <span className="mt-1.5 block text-xs font-medium text-text-quaternary">
                          {t('console.tenants.ofQuota', {
                            used: count(tenant.used),
                            quota: count(plan.quota),
                          })}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <span className="flex items-center gap-1">
                          {tenant.week.map((day, index) => (
                            <span
                              key={index}
                              className={`h-1.5 w-4 rounded-full ${DAY_COLOUR[day]}`}
                            />
                          ))}
                        </span>
                        <span
                          className={`mt-1.5 block text-xs font-medium ${HEALTH_TONE[tenant.healthTone]}`}
                        >
                          {t(tenant.healthKey)}
                        </span>
                      </td>
                      <td className="px-2 py-4 text-end">
                        <span className="block text-sm font-semibold text-text-primary">
                          <span className="me-1">
                            <Rial />
                          </span>
                          {omr(tenant.billed)}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-text-quaternary">
                          {t(tenant.ageKey, tenant.ageValues)}
                        </span>
                      </td>
                      <td className="px-2 py-4">
                        <ActionMenu
                          items={tenantRowActions()}
                          label={t('console.tenants.rowMenu')}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('console.tenants.noResults')}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {tab === 'all'
                ? t('console.tenants.showingAll', { shown: rows.length, total: count(tabCount) })
                : t('console.tenants.showing', {
                    shown: rows.length,
                    total: count(tabCount),
                    tab: t(TENANT_TABS.find((entry) => entry.id === tab)!.labelKey).toLowerCase(),
                  })}
            </p>
            <p className="text-xs font-medium text-text-quaternary">
              {t('console.tenants.allCount', { count: count(ALL_TENANTS) })}
            </p>
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

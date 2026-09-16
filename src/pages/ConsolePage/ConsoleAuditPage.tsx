import { useState, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ConsoleShell } from '../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import {
  ConsoleStatusPill,
  type ConsolePillTone,
} from '../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  ConsoleClockIcon,
  ConsoleSubscriptionIcon,
  ConsoleTickIcon,
} from '../../layouts/ConsoleShell/consoleIcons'
import { FilterMenu, Pager, RowsView, Select } from '../../components/ui'
import {
  AUDIT_AREAS,
  useConsoleAudit,
  type AuditArea,
  type AuditEntry,
} from '../../lib/consoleAudit'
import { tenantName } from '../../lib/consoleErp'
import { SUBSCRIPTIONS_NOW, planLabelKey, type Subscription } from '../../lib/consoleSubscriptions'
import { formatDay, formatMoment, localeFor } from '../../lib/console/format'
import { toDateKey } from '../../lib/dates'
import { count, omr } from '../../lib/superAdmin'
import { QueueKpiCard } from './subscriptions/QueueKpiCard'
import searchIcon from '../../assets/dashboard/search.svg'

type AreaFilter = 'all' | AuditArea
type Range = 'today' | 'week' | 'month' | 'all'

const RANGES: Range[] = ['today', 'week', 'month', 'all']
const RANGE_DAYS: Record<Range, number | null> = { today: 0, week: 6, month: 29, all: null }
const PAGE_SIZE = 20
const DAY = 24 * 60 * 60 * 1000

/**
 * One tone per family, the sidebar's groups: what customers pay and are (subscriptions,
 * verification, plans) reads green; keeping the platform running (queue, incidents) reads red;
 * ERP amber; the platform's own settings and people grey.
 */
const AREA_TONE: Record<AuditArea, ConsolePillTone> = {
  subscriptions: 'success',
  verification: 'success',
  plans: 'success',
  queue: 'danger',
  incidents: 'danger',
  erp: 'pending',
  settings: 'neutral',
  operators: 'neutral',
}

const SECONDARY_BUTTON =
  'inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

/**
 * An entry's raw values made readable, as the tenant's Activity card does for the subscriptions
 * ledger: timestamps as days, methods and channels and plans through their labels, money and
 * counts formatted. Every other area's values are already words.
 */
function readableValues(
  entry: AuditEntry,
  t: TFunction,
  day: (date: Date) => string,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, raw] of Object.entries(entry.values ?? {})) {
    if ((key === 'until' || key === 'at' || key === 'expires') && typeof raw === 'number')
      out[key] = day(new Date(raw))
    else if (key === 'method') out[key] = t(`console.subscriptions.method.${raw}`)
    else if (key === 'via') out[key] = t(`console.subscriptions.channel.${raw}`)
    else if (key === 'plan' && entry.area === 'subscriptions')
      out[key] = t(planLabelKey(raw as Subscription['plan']))
    else if (key === 'term') out[key] = t(`console.subscriptions.term.${raw}`).toLowerCase()
    else if (key === 'amount' && typeof raw === 'number') out[key] = omr(raw)
    else if (key === 'documents' && typeof raw === 'number') out[key] = count(raw)
    else out[key] = raw
  }
  return out
}

function describe(entry: AuditEntry, t: TFunction, day: (date: Date) => string) {
  return t(entry.actionKey, readableValues(entry, t, day))
}

/** "Today", "Yesterday", else the day — with its year only when it is not this one. */
function dayHeading(date: Date, t: TFunction, language: string) {
  const today = startOfDay(SUBSCRIPTIONS_NOW)
  const that = startOfDay(date)
  const diff = Math.round((today.getTime() - that.getTime()) / DAY)
  if (diff === 0) return t('console.audit.day.today')
  if (diff === 1) return t('console.audit.day.yesterday')
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: that.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(that)
}

/** A CSV cell: quoted when it has to be, with quotes doubled, as every spreadsheet reads it. */
const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

function downloadCsv(rows: string[][], filename: string) {
  const text = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  // The byte-order mark makes Excel read the Arabic as UTF-8 rather than as the local code page.
  const blob = new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-3 text-start font-semibold first:px-4 ${className}`}>{children}</th>
  )
}

/**
 * Every operator action on the platform in one list (docs/erp-and-console-plan.md §9.3): the
 * subscriptions ledger, the ERP and operations stores, the settings marks and the seeded areas
 * whose screens write to the backend. Filter by area, operator, tenant and period; export what is
 * on screen. Rows are grouped by day so a morning's work reads as one block.
 */
export function ConsoleAuditPage() {
  const { t, i18n } = useTranslation()
  const entries = useConsoleAudit()
  const [area, setArea] = useState<AreaFilter>('all')
  const [operator, setOperator] = useState('all')
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<Range>('all')
  const [page, setPage] = useState(1)

  const language = i18n.language
  const day = (date: Date) => formatDay(date.toISOString(), language)
  const moment = (date: Date) => formatMoment(date.toISOString(), language)
  const today = startOfDay(SUBSCRIPTIONS_NOW)
  const areaLabel = (id: AuditArea) => t(`console.audit.area.${id}`)

  /* -- the figures: today's work, who did it, how much of the console it touched */
  const todays = entries.filter((entry) => entry.at >= today)
  const week = entries.filter((entry) => entry.at >= new Date(today.getTime() - 6 * DAY))
  // The scheduler acts on its own; only people count as operators.
  const operatorsToday = [...new Set(todays.map((entry) => entry.by))].filter(
    (by) => by !== 'Scheduler',
  )
  const byArea = new Map<AuditArea, number>()
  entries.forEach((entry) => byArea.set(entry.area, (byArea.get(entry.area) ?? 0) + 1))
  const busiest = [...byArea.entries()].sort((a, b) => b[1] - a[1])[0]

  /* -- the filters */
  const operators = [...new Set(entries.map((entry) => entry.by))].sort((a, b) =>
    a.localeCompare(b),
  )
  const needle = query.trim().toLowerCase()
  const since =
    RANGE_DAYS[range] === null ? null : new Date(today.getTime() - RANGE_DAYS[range]! * DAY)
  const rows = entries.filter(
    (entry) =>
      (area === 'all' || entry.area === area) &&
      (operator === 'all' || entry.by === operator) &&
      (since === null || entry.at >= since) &&
      (needle === '' ||
        (entry.tenantId !== undefined &&
          `${entry.tenantId} ${tenantName(entry.tenantId)}`.toLowerCase().includes(needle))),
  )
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  // Filters reset the pager: a page that no longer exists would show nothing.
  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  const groups: { key: string; heading: string; rows: AuditEntry[] }[] = []
  pageRows.forEach((entry) => {
    const key = toDateKey(entry.at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(entry)
    else groups.push({ key, heading: dayHeading(entry.at, t, language), rows: [entry] })
  })

  const exportCsv = () =>
    downloadCsv(
      [
        [
          t('console.audit.col.when'),
          t('console.audit.col.operator'),
          t('console.audit.col.area'),
          t('console.audit.col.what'),
          t('console.audit.col.tenant'),
          t('console.audit.col.open'),
        ],
        ...rows.map((entry) => [
          entry.at.toISOString(),
          entry.by,
          areaLabel(entry.area),
          describe(entry, t, day),
          entry.tenantId ? tenantName(entry.tenantId) : '',
          entry.to ?? '',
        ]),
      ],
      `fawtir-audit-${toDateKey(SUBSCRIPTIONS_NOW)}.csv`,
    )

  return (
    <ConsoleShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.audit' }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('console.audit.title')}
            </h1>
            <p className="mt-1.5 max-w-[720px] text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('console.audit.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className={`${SECONDARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {t('console.audit.export')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <QueueKpiCard
            icon={<ConsoleClockIcon className="size-[18px] text-primary-700" />}
            title={t('console.audit.kpi.today')}
            value={String(todays.length)}
            note={t('console.audit.kpi.todayNote', { count: week.length })}
          />
          <QueueKpiCard
            icon={<ConsoleTickIcon className="size-[18px] text-success-700" />}
            title={t('console.audit.kpi.operators')}
            value={String(operatorsToday.length)}
            note={
              operatorsToday.length
                ? t('console.audit.kpi.operatorsNote', { names: operatorsToday.join(' · ') })
                : t('console.audit.kpi.operatorsNone')
            }
          />
          <QueueKpiCard
            icon={<ConsoleSubscriptionIcon className="size-[18px] text-pending-700" />}
            title={t('console.audit.kpi.areas')}
            value={String(byArea.size)}
            suffix={t('console.audit.kpi.areasOf', { total: AUDIT_AREAS.length })}
            note={
              busiest
                ? t('console.audit.kpi.areasNote', {
                    area: areaLabel(busiest[0]),
                    count: busiest[1],
                  })
                : ''
            }
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(event) => filter(setQuery)(event.target.value)}
                placeholder={t('console.audit.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
              <FilterMenu<AreaFilter>
                label={t('console.audit.filter.area')}
                value={area}
                defaultValue="all"
                onChange={filter(setArea)}
                options={[
                  { value: 'all', label: t('console.audit.filter.areaAll') },
                  ...AUDIT_AREAS.map((id) => ({
                    value: id,
                    label: areaLabel(id),
                    count: byArea.get(id) ?? 0,
                  })),
                ]}
              />
              <FilterMenu
                label={t('console.audit.filter.operator')}
                value={operator}
                defaultValue="all"
                onChange={filter(setOperator)}
                options={[
                  { value: 'all', label: t('console.audit.filter.operatorAll') },
                  ...operators.map((name) => ({ value: name, label: name })),
                ]}
              />
              <div className="w-[180px] max-md:w-full">
                <Select
                  compact
                  value={range}
                  onChange={(value) => filter(setRange)(value as Range)}
                  ariaLabel={t('console.audit.filter.range')}
                  options={RANGES.map((id) => ({
                    value: id,
                    label: t(`console.audit.range.${id}`),
                  }))}
                />
              </div>
            </div>
          </div>

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[1000px] border-collapse text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  <Th>{t('console.audit.col.when')}</Th>
                  <Th>{t('console.audit.col.operator')}</Th>
                  <Th>{t('console.audit.col.area')}</Th>
                  <Th>{t('console.audit.col.what')}</Th>
                  <Th>{t('console.audit.col.tenant')}</Th>
                  <Th className="w-20">{t('console.audit.col.open')}</Th>
                </tr>
              </thead>
              {groups.map((group) => (
                <tbody key={group.key}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={6}
                      className="bg-surface-background px-4 py-2 text-start text-xs font-semibold uppercase tracking-[0.04em] text-text-quaternary"
                    >
                      {group.heading}
                    </th>
                  </tr>
                  {group.rows.map((entry) => (
                    <tr key={entry.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-4 align-top text-sm font-medium text-text-primary">
                        {moment(entry.at)}
                      </td>
                      <td className="px-2 py-4 align-top text-sm font-medium text-text-primary">
                        {entry.by}
                      </td>
                      <td className="px-2 py-4 align-top">
                        <ConsoleStatusPill
                          tone={AREA_TONE[entry.area]}
                          label={areaLabel(entry.area)}
                        />
                      </td>
                      <td className="min-w-[280px] px-2 py-4 align-top text-sm font-medium leading-[1.5] text-text-secondary">
                        {describe(entry, t, day)}
                      </td>
                      <td className="px-2 py-4 align-top text-sm font-medium">
                        {entry.tenantId ? (
                          <Link
                            to={`/console/tenants/${entry.tenantId}`}
                            className="text-text-primary transition-colors hover:text-primary-700"
                          >
                            {tenantName(entry.tenantId)}
                          </Link>
                        ) : (
                          <span className="text-text-quaternary">
                            {t('console.audit.noTenant')}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-4 align-top text-sm">
                        {entry.to ? (
                          <Link
                            to={entry.to}
                            className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
                          >
                            {t('console.audit.open')}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
            {rows.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('console.audit.noResults')}
              </p>
            ) : null}
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-subtle px-6 py-4">
            <p className="text-sm font-medium text-text-tertiary">
              {rows.length === 0
                ? t('console.audit.showingNone')
                : t('console.audit.showing', {
                    from: (current - 1) * PAGE_SIZE + 1,
                    to: Math.min(current * PAGE_SIZE, rows.length),
                    total: rows.length,
                  })}
            </p>
            {pageCount > 1 ? (
              <Pager
                page={current}
                pageCount={pageCount}
                onChange={setPage}
                labels={{
                  nav: t('console.audit.pager.label'),
                  previous: t('console.audit.pager.previous'),
                  next: t('console.audit.pager.next'),
                }}
              />
            ) : null}
          </div>
        </section>
      </div>
    </ConsoleShell>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { FilterMenu, SortMenu, UserIcon } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { ReportPager } from '../ErpPage/reporting/reportingParts'
import { useApiRead } from '../../hooks/useApiRead'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { BUSINESS_TIME_ZONE } from '../../lib/format'
import { activityEventWords } from '../../lib/activityLogWords'
import {
  activityLogPath,
  loadActivityLog,
  type ActivityLogItemDto,
  type ActivityLogPageDto,
} from '../../api/settings/activityLog'
import printIcon from '../../assets/settings/print.svg'
import searchIcon from '../../assets/invoices/search.svg'

/**
 * Settings › Activity log (Figma "Settings -> Activity log"), from the organisation's real log
 * (`GET /v1/settings/activity-log`, `admin.settings.manage`).
 *
 * Every element the frame draws is drawn. What the server cannot answer yet says so instead of
 * showing a figure that is not the organisation's (SETTINGS.md section 2):
 * - the three counts (this month, by a person, by the API) need counts the log does not return
 *   (row 2.2); "Kept for" states the ten-year rule (row 2.3);
 * - Export as PDF has no endpoint (row 2.1);
 * - the tabs, the search and the sort have no server parameter, so they work on the page the
 *   server answered and the toolbar says so (rows 2.4, 2.5, 2.6); Filters is the server's own
 *   `outcome` filter;
 * - an entry names a person only once the log carries a display name (row 2.7).
 */

/** The ten years the Oman VAT Law keeps records for (handbook 5.x). TODO(backend): row 2.3. */
const LOG_RETENTION_YEARS = 10

const OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED', 'THROTTLED'] as const
type OutcomeFilter = '' | (typeof OUTCOMES)[number]

const TABS = ['all', 'people', 'fawtir', 'api', 'money'] as const
type Tab = (typeof TABS)[number]

type Sort = 'newest' | 'oldest'

/** Kinds the "Money and access" tab gathers: who may sign in, with what, and what is paid for. */
const ACCESS_RESOURCES = new Set(['USER', 'SESSION', 'DEVICE', 'API_KEY', 'ERP_ENTITLEMENT'])

function inTab(entry: ActivityLogItemDto, tab: Tab): boolean {
  switch (tab) {
    case 'people':
      return entry.actor_type === 'USER'
    case 'fawtir':
      return entry.actor_type === 'SYSTEM' || entry.actor_type === 'SUPPORT_USER'
    case 'api':
      return entry.actor_type === 'API_KEY'
    case 'money':
      return entry.resource_type !== null && ACCESS_RESOURCES.has(entry.resource_type)
    default:
      return true
  }
}

const OUTCOME_TONE: Record<string, string> = {
  SUCCESS: 'bg-surface-background text-text-tertiary',
  FAILURE: 'bg-danger-100 text-danger-700',
  DENIED: 'bg-danger-100 text-danger-700',
  THROTTLED: 'bg-pending-100 text-pending-700',
}

export function ActivityLogPage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const canRead = entitlements !== null && hasPermission(entitlements, 'admin.settings.manage')
  const [exportAsked, setExportAsked] = useState(false)

  return (
    <SettingsShell group="records">
      <SettingsHeader
        title={t('activityLog.title')}
        subtitle={t('activityLog.subtitle')}
        actions={
          canRead ? (
            // TODO(backend): SETTINGS.md row 2.1, no export of the log yet.
            <button
              type="button"
              onClick={() => setExportAsked(true)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={printIcon} alt="" className="size-[18px]" />
              {t('activityLog.exportPdf')}
            </button>
          ) : undefined
        }
      />
      {exportAsked ? (
        <p role="status" className="text-sm font-medium text-text-tertiary">
          {t('activityLog.exportUnavailable')}
        </p>
      ) : null}
      {!ready ? <LoadingNotice /> : !canRead ? <PermissionDeniedNotice /> : <ActivityLog />}
    </SettingsShell>
  )
}

function ActivityLog() {
  const { t, i18n } = useTranslation()
  const [outcome, setOutcome] = useState<OutcomeFilter>('')
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const path = activityLogPath({ outcome }, page)
  const { read, retry } = useApiRead<ActivityLogPageDto>(path, () => loadActivityLog(path))

  const items = useMemo(() => (read.status === 'ready' ? read.data.items : []), [read])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const shown = items.filter(
      (entry) =>
        inTab(entry, tab) && (!needle || searchText(i18n, entry).toLowerCase().includes(needle)),
    )
    return sort === 'oldest' ? [...shown].reverse() : shown
  }, [items, tab, query, sort, i18n])
  const pageOnly =
    read.status === 'ready' &&
    (read.data.has_more || page > 0) &&
    (tab !== 'all' || query !== '' || sort !== 'newest')

  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {/* TODO(backend): SETTINGS.md row 2.2, the log returns no counts. */}
        <Kpi label={t('activityLog.kpi.thisMonth')} note={t('activityLog.kpi.notCounted')} />
        <Kpi label={t('activityLog.kpi.byPerson')} note={t('activityLog.kpi.notCounted')} />
        <Kpi label={t('activityLog.kpi.byApi')} note={t('activityLog.kpi.notCounted')} />
        <Kpi
          label={t('activityLog.kpi.keptFor')}
          value={String(LOG_RETENTION_YEARS)}
          unit={t('activityLog.kpi.years')}
          note={t('activityLog.kpi.keptForNote')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <nav
          aria-label={t('activityLog.title')}
          className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5 pt-4"
        >
          {TABS.map((id) => {
            const active = id === tab
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary-700 text-primary-800'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`activityLog.tab.${id}`)}
                {read.status === 'ready' ? (
                  <span
                    className={[
                      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                      active
                        ? 'bg-primary-700 text-white'
                        : 'bg-surface-background text-text-tertiary',
                    ].join(' ')}
                  >
                    {items.filter((entry) => inTab(entry, id)).length}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-0 flex-1 basis-[260px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('activityLog.search')}
              aria-label={t('activityLog.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu<OutcomeFilter>
              label={t('activityLog.filters')}
              value={outcome}
              defaultValue=""
              options={[
                { value: '', label: t('activityLog.filter.anyOutcome') },
                ...OUTCOMES.map((value) => ({
                  value,
                  label: t(`activityLog.outcome.${value}`),
                })),
              ]}
              onChange={(value) => {
                setOutcome(value)
                setPage(0)
              }}
            />
            <SortMenu<Sort>
              value={sort}
              onChange={setSort}
              options={[
                { value: 'newest', labelKey: 'activityLog.sort.newest' },
                { value: 'oldest', labelKey: 'activityLog.sort.oldest' },
              ]}
            />
          </div>
          {pageOnly ? (
            <p className="w-full text-xs font-medium text-text-quaternary">
              {t('activityLog.pageScope')}
            </p>
          ) : null}
        </div>

        {read.status === 'loading' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={read.error} retry={retry} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-medium text-text-quaternary">
            {t('activityLog.empty')}
          </p>
        ) : (
          groupByDay(rows).map(([day, entries]) => (
            <div key={day}>
              <p className="flex flex-wrap items-center justify-between gap-3 border-y border-surface-background bg-surface-background/50 px-5 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-tertiary">
                  {dayHeading(t, day, i18n.language)}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('activityLog.onThisPage', { count: entries.length })}
                </span>
              </p>
              <ul>
                {entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))
        )}

        {read.status === 'ready' ? (
          <div className="px-5 pb-5 pt-3">
            <ReportPager
              page={page + 1}
              hasMore={read.data.has_more}
              onChange={(next) => setPage(next - 1)}
            />
          </div>
        ) : null}
      </section>
    </>
  )
}

function Kpi({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value?: string
  unit?: string
  note: string
}) {
  const { t } = useTranslation()
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
        {label}
      </h3>
      <p className="mt-2 flex min-h-[34px] items-baseline gap-2">
        {value ? (
          <>
            <span className="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {value}
            </span>
            {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
          </>
        ) : (
          <span className="text-base font-semibold leading-[34px] text-text-quaternary">
            {t('activityLog.notAvailable')}
          </span>
        )}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

type Translate = ReturnType<typeof useTranslation>['t']
type I18n = ReturnType<typeof useTranslation>['i18n']

/** The words an entry is shown with, which is what the search looks through. */
function searchText(i18n: I18n, entry: ActivityLogItemDto): string {
  return [
    activityEventWords(i18n, entry.event_type),
    entry.resource_type ? wordOr(i18n, `activityLog.resource.${entry.resource_type}`) : '',
    entry.resource_id ?? '',
    wordOr(i18n, `activityLog.outcome.${entry.outcome}`),
  ].join(' ')
}

/** The words for a key, or '' when this build has none: a server code is never shown. */
function wordOr(i18n: I18n, key: string): string {
  return i18n.exists(key) ? i18n.t(key) : ''
}

/** `YYYY-MM-DD` in Muscat, the day the business runs on. */
function businessDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(new Date(iso))
}

function groupByDay(items: ActivityLogItemDto[]): [string, ActivityLogItemDto[]][] {
  const days = new Map<string, ActivityLogItemDto[]>()
  for (const item of items) {
    const day = businessDay(item.occurred_at)
    days.set(day, [...(days.get(day) ?? []), item])
  }
  return [...days.entries()]
}

/** "TODAY · 4 September", as the frame heads each day. */
function dayHeading(t: Translate, day: string, language: string): string {
  const now = Date.now()
  const today = businessDay(new Date(now).toISOString())
  const yesterday = businessDay(new Date(now - 24 * 60 * 60 * 1000).toISOString())
  const date = new Intl.DateTimeFormat(language === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: day.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
  if (day === today) return `${t('activityLog.today')} · ${date}`
  if (day === yesterday) return `${t('activityLog.yesterday')} · ${date}`
  return date
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso))
}

function Entry({ entry }: { entry: ActivityLogItemDto }) {
  const { i18n } = useTranslation()
  const person = entry.actor_type === 'USER'
  // The frame's avatar holds a person's initials, or "SYS" / "ERP" for Fawtir and an API key.
  // The log carries no name yet (row 2.7), so a person shows the person glyph.
  const avatar: ReactNode = person ? (
    <UserIcon size={16} />
  ) : entry.actor_type === 'API_KEY' ? (
    'API'
  ) : (
    'SYS'
  )
  const actor = wordOr(i18n, `activityLog.actor.${entry.actor_type}`)
  const resource = entry.resource_type
    ? wordOr(i18n, `activityLog.resource.${entry.resource_type}`)
    : ''
  const outcome = wordOr(i18n, `activityLog.outcome.${entry.outcome}`)

  return (
    <li className="flex items-start gap-4 border-b border-surface-background px-5 py-4 last:border-0">
      <span
        dir="ltr"
        className="w-[52px] shrink-0 pt-0.5 text-sm font-medium text-text-quaternary tabular-nums"
      >
        {timeOf(entry.occurred_at)}
      </span>
      <span
        aria-hidden="true"
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          person ? 'bg-primary-700 text-white' : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {avatar}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {activityEventWords(i18n, entry.event_type)}
        </p>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {actor ? (
            <span className="inline-flex h-[22px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-tertiary">
              {actor}
            </span>
          ) : null}
          {resource ? (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-[3px] bg-primary-50 px-2 text-[11px] font-medium text-primary-800">
              {resource}
              {entry.resource_id ? (
                <bdi dir="ltr" className="font-mono">
                  {entry.resource_id.slice(0, 8)}
                </bdi>
              ) : null}
            </span>
          ) : null}
          {outcome ? (
            <span
              className={[
                'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11px] font-medium',
                Object.hasOwn(OUTCOME_TONE, entry.outcome) ? OUTCOME_TONE[entry.outcome] : OUTCOME_TONE.SUCCESS,
              ].join(' ')}
            >
              {outcome}
            </span>
          ) : null}
        </span>
      </div>
    </li>
  )
}

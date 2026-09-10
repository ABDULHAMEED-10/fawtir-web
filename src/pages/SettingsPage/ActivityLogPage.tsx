import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { FilterMenu, SortMenu, withRial } from '../../components/ui'
import { BOOK, longDate, TODAY } from '../../lib/settings'
import {
  LOG,
  LOG_TABS,
  LOG_SORTS,
  LOG_BOOK,
  LOG_BY_PERSON,
  countLogTab,
  matchesLogTab,
  CERT_DAYS_AT_CHECK,
  type LogEntry,
  type LogTab,
} from '../../lib/settingsRecords'
import printIcon from '../../assets/settings/print.svg'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const TAG_TONE = {
  plain: 'bg-surface-background text-text-tertiary',
  api: 'bg-primary-50 text-primary-800',
  warn: 'bg-pending-100 text-pending-700',
  danger: 'bg-danger-100 text-danger-700',
  money: 'bg-pending-100 text-pending-700',
}

const matchesQuery = (entry: LogEntry, query: string, body: string) => {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    body.toLowerCase().includes(needle) ||
    (entry.link?.label ?? '').toLowerCase().includes(needle) ||
    entry.tags.some((tag) => (tag.label ?? '').toLowerCase().includes(needle))
  )
}

/**
 * Settings › Activity log (Figma 135:41482).
 *
 * Grouped by day rather than paged, because a reader is nearly always asking "what changed
 * today?". The day headings are worked out from the clock, so the log re-labels itself instead
 * of printing a date that has gone stale.
 */
export function ActivityLogPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<LogTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')

  const rows = useMemo(() => {
    const filtered = LOG.filter(
      (entry) =>
        matchesLogTab(entry, tab) &&
        matchesQuery(entry, query, t(entry.bodyKey, { ...entry.values, who: actorName(entry) })),
    )
    return sort === 'oldest' ? [...filtered].reverse() : filtered
  }, [tab, query, sort, t])

  /** Days that still have a row after filtering, in the order the log runs. */
  const days = [...new Set(rows.map((entry) => entry.daysAgo))].sort((a, b) =>
    sort === 'oldest' ? b - a : a - b,
  )

  return (
    <SettingsShell group="records">
      <SettingsHeader
        title={t('activityLog.title')}
        subtitle={t('activityLog.subtitle')}
        actions={
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={printIcon} alt="" className="size-[18px]" />
            {t('activityLog.exportPdf')}
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t('activityLog.kpi.thisMonth')}
          value={LOG_BOOK.thisMonth.toLocaleString('en-US')}
          unit={t('activityLog.kpi.entries')}
          note={t('activityLog.kpi.thisMonthNote')}
        />
        <Kpi
          label={t('activityLog.kpi.byPerson')}
          value={String(LOG_BY_PERSON)}
          note={t('activityLog.kpi.byPersonNote', {
            names: Object.entries(LOG_BOOK.byPerson)
              .map(([name, count]) => `${name} ${count}`)
              .join(' · '),
          })}
        />
        <Kpi
          label={t('activityLog.kpi.byApi')}
          value={String(LOG_BOOK.byApi)}
          note={t('activityLog.kpi.byApiNote')}
        />
        <Kpi
          label={t('activityLog.kpi.keptFor')}
          value={String(BOOK.retentionYears)}
          unit={t('activityLog.kpi.years')}
          note={t('activityLog.kpi.keptForNote')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <nav className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5 pt-4">
          {LOG_TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-pressed={active}
                className={[
                  'inline-flex h-[42px] items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary-700 text-primary-800'
                    : 'border-transparent text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span
                  className={[
                    'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                    active
                      ? 'bg-primary-700 text-white'
                      : 'bg-surface-background text-text-tertiary',
                  ].join(' ')}
                >
                  {countLogTab(entry.id)}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[260px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
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
            <FilterMenu
              label={t('activityLog.filters')}
              value={tab}
              defaultValue="all"
              options={LOG_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countLogTab(entry.id),
              }))}
              onChange={(value) => setTab(value)}
            />
            <SortMenu
              value={sort}
              onChange={setSort}
              options={LOG_SORTS.map((entry) => ({ value: entry.id, labelKey: entry.labelKey }))}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-medium text-text-quaternary">
            {t('activityLog.empty')}
          </p>
        ) : (
          days.map((daysAgo) => {
            const inDay = rows.filter((entry) => entry.daysAgo === daysAgo)
            const date = new Date(TODAY.getTime() - daysAgo * 24 * 60 * 60 * 1000)
            const total = daysAgo === 0 ? LOG_BOOK.today : LOG_BOOK.yesterday
            return (
              <div key={daysAgo}>
                <p className="flex flex-wrap items-center justify-between gap-3 border-y border-surface-background bg-surface-background/50 px-5 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-tertiary">
                    {daysAgo === 0 ? t('activityLog.today') : t('activityLog.yesterday')} ·{' '}
                    {longDate(date)}
                  </span>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('activityLog.entriesShowing', { total, shown: inDay.length })}
                  </span>
                </p>
                <ul>
                  {inDay.map((entry) => (
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </ul>
              </div>
            )
          })
        )}
      </section>
    </SettingsShell>
  )
}

const actorName = (entry: LogEntry) => (entry.actor.kind === 'person' ? entry.actor.name : '')

function Kpi({
  label,
  value,
  unit,
  note,
}: {
  label: string
  value: string
  unit?: string
  note: string
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
        {label}
      </h3>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-sm font-medium text-text-quaternary">{unit}</span> : null}
      </p>
      <p className="mt-2 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

function Entry({ entry }: { entry: LogEntry }) {
  const { t } = useTranslation()

  return (
    <li className="flex items-start gap-4 border-b border-surface-background px-5 py-4 last:border-0">
      <span className="w-[52px] shrink-0 pt-0.5 text-sm font-medium text-text-quaternary tabular-nums">
        {entry.at}
      </span>

      <span
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          entry.actor.kind === 'person'
            ? 'bg-primary-700 text-white'
            : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {entry.actor.kind === 'person'
          ? entry.actor.initials
          : entry.actor.kind === 'api'
            ? 'ERP'
            : 'SYS'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          <Trans
            i18nKey={entry.bodyKey}
            values={{
              ...entry.values,
              who: actorName(entry),
              days: entry.id === 'l9' ? CERT_DAYS_AT_CHECK : undefined,
              link: entry.link?.label,
            }}
            components={{ b: <b className="font-semibold text-text-primary" /> }}
          />
          {entry.link ? (
            <>
              {' '}
              <Link
                to={entry.link.to}
                className="font-semibold text-primary-700 transition-colors hover:underline"
              >
                {entry.link.label}
              </Link>
            </>
          ) : null}
        </p>

        <span className="mt-2 flex flex-wrap items-center gap-2">
          {entry.tags.map((tag) => (
            <span
              key={tag.id}
              className={[
                'inline-flex h-[22px] items-center rounded-[3px] px-2 text-[11px] font-medium',
                TAG_TONE[tag.tone],
              ].join(' ')}
            >
              {withRial(tag.label ?? t(tag.labelKey as string))}
            </span>
          ))}
        </span>

        {entry.change ? (
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-[26px] items-center rounded-[3px] bg-danger-100 px-2 text-xs font-medium text-danger-700 line-through">
              {withRial(entry.change.from)}
            </span>
            <img src={chevronIcon} alt="→" className="size-4 opacity-50 rtl:rotate-180" />
            <span className="inline-flex h-[26px] items-center rounded-[3px] bg-success-100 px-2 text-xs font-semibold text-[#3d5648]">
              {withRial(entry.change.to)}
            </span>
          </span>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={t('activityLog.openEntry')}
        className="shrink-0 self-center"
      >
        <img
          src={chevronIcon}
          alt=""
          className="size-5 opacity-40 transition-opacity hover:opacity-100 rtl:rotate-180"
        />
      </button>
    </li>
  )
}

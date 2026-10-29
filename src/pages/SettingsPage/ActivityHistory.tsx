import { useState } from 'react'
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'
import { Select, UserIcon } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ReportPager } from '../ErpPage/reporting/reportingParts'
import { useApiRead } from '../../hooks/useApiRead'
import { formatInstant, formatInstantDay } from '../../lib/format'
import { activityEventWords } from '../../lib/activityLogWords'
import {
  activityLogPath,
  loadActivityLog,
  type ActivityLogItemDto,
  type ActivityLogPageDto,
} from '../../api/settings/activityLog'

const OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED', 'THROTTLED'] as const

const OUTCOME_TONE: Record<string, string> = {
  SUCCESS: 'bg-surface-background text-text-tertiary',
  FAILURE: 'bg-danger-100 text-danger-700',
  DENIED: 'bg-danger-100 text-danger-700',
  THROTTLED: 'bg-pending-100 text-pending-700',
}

/**
 * The organisation's real activity log (`GET /v1/settings/activity-log`), newest first, a page at
 * a time, grouped by business day.
 *
 * Shared by Settings › Activity log and Integration › Access & history. The filters are the
 * server's own exact-match parameters and nothing else: a filter narrows what a reader the server
 * already admits may see, and grants nothing. Nothing here is sample data; an empty answer is
 * drawn as empty.
 *
 * **What is shown of an entry.** The event, worded where this build has words for it and as its
 * technical code otherwise; the actor kind; the resource kind and a short id; the outcome; the
 * time. Not the metadata, the address or the correlation id: those are for an investigation, and
 * the server keeps them.
 */
export function ActivityHistory({
  resourceTypes,
  allowAll,
  base,
}: {
  /** The resource kinds offered as a filter, as the server names them. */
  resourceTypes: readonly string[]
  /** Whether "any kind" is offered. Off where the screen is about one area only. */
  allowAll: boolean
  /** Which log to read: the organisation's (default) or the server's ERP-scoped one. */
  base?: string
}) {
  const { t, i18n } = useTranslation()
  const [resourceType, setResourceType] = useState(allowAll ? '' : (resourceTypes[0] ?? ''))
  const [outcome, setOutcome] = useState('')
  const [page, setPage] = useState(0)
  const path = activityLogPath({ resourceType, outcome }, page, base)
  const { read, retry } = useApiRead<ActivityLogPageDto>(path, () => loadActivityLog(path))

  const typeOptions = [
    ...(allowAll ? [{ value: '', label: t('activityLog.filter.anyResource') }] : []),
    ...resourceTypes.map((value) => ({ value, label: resourceWord(t, value) })),
  ]
  const outcomeOptions = [
    { value: '', label: t('activityLog.filter.anyOutcome') },
    ...OUTCOMES.map((value) => ({ value, label: t(`activityLog.outcome.${value}`) })),
  ]

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('activityLog.filter.resource')}
          </span>
          <Select
            value={resourceType}
            ariaLabel={t('activityLog.filter.resource')}
            options={typeOptions}
            onChange={(value) => {
              setResourceType(value)
              setPage(0)
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('activityLog.filter.outcome')}
          </span>
          <Select
            value={outcome}
            ariaLabel={t('activityLog.filter.outcome')}
            options={outcomeOptions}
            onChange={(value) => {
              setOutcome(value)
              setPage(0)
            }}
          />
        </div>
      </div>

      {read.status === 'loading' ? (
        <div className="px-5 pb-5">
          <LoadingNotice />
        </div>
      ) : read.status === 'failed' ? (
        <div className="px-5 pb-5">
          <ApiReadFailure error={read.error} retry={retry} />
        </div>
      ) : read.data.items.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm font-medium text-text-quaternary">
          {t('activityLog.empty')}
        </p>
      ) : (
        <>
          {groupByDay(read.data.items, i18n.language).map(([day, entries]) => (
            <div key={day}>
              <p className="border-y border-surface-background bg-surface-background/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-tertiary">
                {day}
              </p>
              <ul>
                {entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          ))}
          <div className="px-5 pb-5 pt-3">
            <ReportPager
              page={page + 1}
              hasMore={read.data.has_more}
              onChange={(next) => setPage(next - 1)}
            />
          </div>
        </>
      )}
    </section>
  )
}

function groupByDay(
  items: ActivityLogItemDto[],
  language: string,
): [string, ActivityLogItemDto[]][] {
  const days = new Map<string, ActivityLogItemDto[]>()
  for (const item of items) {
    const day = formatInstantDay(item.occurred_at, language)
    days.set(day, [...(days.get(day) ?? []), item])
  }
  return [...days.entries()]
}

type Translate = ReturnType<typeof useTranslation>['t']

/** A resource kind in words where this build has them; '' otherwise, never the server's code. */
function resourceWord(t: Translate, code: string): string {
  const key = `activityLog.resource.${code}`
  return i18next.exists(key) ? t(key) : ''
}

function Entry({ entry }: { entry: ActivityLogItemDto }) {
  const { t, i18n } = useTranslation()
  // A person shows the person glyph: the log carries no name yet (SETTINGS.md row 2.7).
  const actor =
    entry.actor_type === 'USER' ? (
      <UserIcon size={16} />
    ) : entry.actor_type === 'API_KEY' ? (
      'API'
    ) : (
      'SYS'
    )
  const actorWord = i18n.exists(`activityLog.actor.${entry.actor_type}`)
    ? t(`activityLog.actor.${entry.actor_type}`)
    : ''
  const resource = entry.resource_type ? resourceWord(t, entry.resource_type) : ''
  const outcome = i18n.exists(`activityLog.outcome.${entry.outcome}`)
    ? t(`activityLog.outcome.${entry.outcome}`)
    : ''

  return (
    <li className="flex items-start gap-4 border-b border-surface-background px-5 py-4 last:border-0">
      <span className="w-[120px] shrink-0 pt-0.5 text-xs font-medium text-text-quaternary tabular-nums max-sm:w-[84px]">
        {formatInstant(entry.occurred_at, i18n.language)}
      </span>
      <span
        aria-hidden="true"
        className={[
          'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          entry.actor_type === 'USER'
            ? 'bg-primary-700 text-white'
            : 'bg-surface-background text-text-tertiary',
        ].join(' ')}
      >
        {actor}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {activityEventWords(i18n, entry.event_type)}
        </p>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {actorWord ? (
            <span className="inline-flex h-[22px] items-center rounded-[3px] bg-surface-background px-2 text-[11px] font-medium text-text-tertiary">
              {actorWord}
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

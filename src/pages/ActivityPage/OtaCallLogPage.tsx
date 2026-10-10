import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Pager, RowsView, SortMenu } from '../../components/ui'
import { useApiRead } from '../../hooks'
import {
  activitySummaryPath,
  loadActivitySummary,
  type ActivitySummaryDto,
} from '../../api/compliance/activity'
import { defaultReportRange } from '../../api/reports/reports'
import { reportStatesOf } from '../../lib/activityLedger'
import {
  CALL_RESULTS,
  CALL_SORTS,
  CALL_SUMMARY,
  OTA_CALLS,
  matchesCallQuery,
  type CallResult,
  type CallSortKey,
  type OtaCall,
} from '../../lib/otaCallLog'
import chevronIcon from '../../assets/invoices/chevron.svg'
import lockIcon from '../../assets/activity/lock.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import retryIcon from '../../assets/catalog/menu-refresh.svg'
import checkIcon from '../../assets/invoices/search.svg'
import fileIcon from '../../assets/bill-capture/file.svg'
import ackIcon from '../../assets/activity/ch-peppol.svg'
import exportIcon from '../../assets/invoice-details/download.svg'
import bellIcon from '../../assets/bills/act-bell.svg'
import archiveIcon from '../../assets/documents/kpi-archive.svg'

/** The page the design draws, as a page of the day's calls. */
const CALLS_PER_PAGE = 7

/** Each result tints its row and its status pill, so trouble is visible without reading. */
const RESULT_STYLE: Record<CallResult, { row: string; pill: string; meaning: string }> = {
  ok: { row: '', pill: 'bg-success-100 text-[#3d5648]', meaning: 'text-text-secondary' },
  pending: {
    row: 'bg-pending-100/40',
    pill: 'bg-surface-background text-text-tertiary',
    meaning: 'text-pending-500',
  },
  rejected: {
    row: 'bg-[#fdf4f2]',
    pill: 'bg-danger-100 text-danger-700',
    meaning: 'text-danger-700',
  },
  noAnswer: {
    row: 'bg-[#fdf4f2]',
    pill: 'bg-pending-100 text-pending-700',
    meaning: 'text-pending-500',
  },
}

/**
 * The OTA call log (Figma 154:110659) and its "⋮" menu (154:111516).
 *
 * TODO(backend): there is no call-log endpoint (asks row 2.20), so the calls, the four figures
 * and the pager are the design's day. The menu's count of submissions still waiting is the
 * ledger's own (the activity summary), and its entries go where the platform can take them.
 */
export function OtaCallLogPage() {
  return (
    <AppShell>
      <CallLog />
    </AppShell>
  )
}

function CallLog() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const range = defaultReportRange()
  const summaryPath = activitySummaryPath(range.from, range.to)
  const book = useApiRead<ActivitySummaryDto>(summaryPath, () => loadActivitySummary(summaryPath))
  // Only reports that reached the OTA can be waiting on it; never-sent and stopped ones are not (N5b).
  const waiting = book.read.status === 'ready' ? reportStatesOf(book.read.data).awaiting : null
  const [query, setQuery] = useState('')
  const [result, setResult] = useState('all')
  const [sort, setSort] = useState<CallSortKey>('newest')

  const rows = useMemo(() => {
    const filtered = OTA_CALLS.filter(
      (call) => (result === 'all' || call.result === result) && matchesCallQuery(call, query),
    )
    if (sort === 'newest') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'slowest') return b.seconds - a.seconds
      // Problems first: anything that is not a clean pass floats up.
      const rank = (call: OtaCall) => (call.result === 'ok' ? 1 : 0)
      return rank(a) - rank(b)
    })
  }, [query, result, sort])

  const summary = CALL_SUMMARY

  const pageCount = Math.max(1, Math.ceil(summary.callsToday / CALLS_PER_PAGE))

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Breadcrumb + actions */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/compliance/activity"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
              >
                {t('activity.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
              <span className="text-2xl font-medium leading-[1.2] text-text-primary">
                {t('callLog.title')}
              </span>
            </div>
            <h1 className="mt-2 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('callLog.title')}
            </h1>
            <p className="mt-1 max-w-[720px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('callLog.subtitle')}
            </p>
          </div>

          {/* The frame lines the actions up with the title, not the breadcrumb. */}
          <div className="flex shrink-0 items-center gap-2.5 md:mt-[37px] max-md:shrink max-md:flex-wrap">
            <ActionMenu
              variant="bordered"
              wide
              label={t('callLog.more')}
              items={[
                {
                  id: 'retryWaiting',
                  sectionKey: 'callLog.menu.putThingsRight',
                  labelKey: 'callLog.menu.retryWaiting',
                  descriptionKey: 'callLog.menu.retryWaitingNote',
                  values: { count: waiting ?? 0 },
                  hint: waiting === null ? undefined : String(waiting),
                  icon: retryIcon,
                  // Opens the rows still waiting rather than resending them: SPOG v1.0.0 §6.2
                  // forbids a resend on silence alone, so the ledger offers one only where the
                  // server put a link.
                  to: '/compliance/activity?tab=waiting',
                },
                {
                  id: 'checkPortal',
                  labelKey: 'callLog.menu.checkPortal',
                  descriptionKey: 'callLog.menu.checkPortalNote',
                  icon: checkIcon,
                  to: '/compliance/activity',
                },
                {
                  id: 'everyTdd',
                  sectionKey: 'callLog.menu.takeACopy',
                  labelKey: 'callLog.menu.everyTdd',
                  descriptionKey: 'callLog.menu.everyTddNote',
                  icon: fileIcon,
                  // TODO(backend): no bulk TDD download yet (asks row 2.21); the report pack
                  // carries the XML when its box is ticked.
                  to: '/compliance/activity/report',
                },
                {
                  id: 'acks',
                  labelKey: 'callLog.menu.acks',
                  descriptionKey: 'callLog.menu.acksNote',
                  icon: ackIcon,
                  to: '/compliance/activity/report',
                },
                {
                  id: 'export',
                  labelKey: 'callLog.menu.exportLog',
                  descriptionKey: 'callLog.menu.exportLogNote',
                  icon: exportIcon,
                  // TODO(backend): no call-log export yet (asks row 2.20).
                },
                {
                  id: 'who',
                  sectionKey: 'callLog.menu.settings',
                  labelKey: 'callLog.menu.whoHears',
                  descriptionKey: 'callLog.menu.whoHearsNote',
                  icon: bellIcon,
                  to: '/settings/team',
                },
                {
                  id: 'retention',
                  labelKey: 'callLog.menu.retention',
                  descriptionKey: 'callLog.menu.retentionNote',
                  icon: archiveIcon,
                  to: '/documents',
                },
              ]}
            />
            <Link
              to="/compliance/activity"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('callLog.backToSubmissions')}
            </Link>
          </div>
        </div>

        {/* Who can see this */}
        <p className="flex items-start gap-2.5 rounded-sm bg-[#e6e7eb] px-6 py-3.5 text-sm font-medium leading-[1.5] text-text-secondary">
          <img src={lockIcon} alt="" className="mt-0.5 size-4 shrink-0" />
          <span>
            <Trans
              i18nKey="callLog.privacy"
              components={{ b: <span className="font-semibold text-text-primary" /> }}
            />
          </span>
        </p>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label={t('callLog.kpi.callsToday')}
            value={summary.callsToday.toLocaleString('en-US')}
            note={t('callLog.kpi.callsTodayNote')}
          />
          <Kpi
            label={t('callLog.kpi.answered')}
            value={`${summary.answeredRate}%`}
            tone="text-[#3d5648]"
            note={t('callLog.kpi.answeredNote', {
              good: summary.answeredNormally,
              total: summary.callsToday,
              failed: summary.failed,
            })}
          />
          <Kpi
            label={t('callLog.kpi.roundTrip')}
            value={`${summary.typicalSeconds}s`}
            tone="text-pending-700"
            note={t('callLog.kpi.roundTripNote', {
              normal: summary.normalSeconds,
              since: summary.slowSince,
            })}
          />
          <Kpi
            label={t('callLog.kpi.slowest')}
            value={`${summary.slowestSeconds.toFixed(1)}s`}
            tone="text-pending-700"
            note={t('callLog.kpi.slowestNote', { at: summary.slowestAt })}
          />
        </div>

        {/* Table */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center max-md:max-w-none max-md:basis-full">
              <img
                src={searchIcon}
                alt=""
                className="pointer-events-none absolute start-3.5 size-5 opacity-60"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('callLog.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <FilterMenu
                label={t('callLog.filters')}
                value={result}
                defaultValue="all"
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('callLog.allResults') },
                  ...CALL_RESULTS.map((id) => ({ value: id, label: t(`callLog.result.${id}`) })),
                ]}
                onChange={setResult}
              />
              <SortMenu
                label={t('callLog.sort')}
                value={sort}
                onChange={setSort}
                options={CALL_SORTS}
              />
            </div>
          </div>

          <RowsView>
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(['when', 'call', 'about', 'cameBack', 'took', 'means'] as const).map((key) => (
                    <th key={key} className="h-[46px] px-4 text-start font-semibold">
                      {t(`callLog.col.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('callLog.empty')}
                    </td>
                  </tr>
                ) : page > 1 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('callLog.notHeld')}
                    </td>
                  </tr>
                ) : (
                  rows.map((call) => <CallRow key={call.id} call={call} />)
                )}
              </tbody>
            </table>
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm font-medium text-text-secondary">
              {t('callLog.showing', {
                shown: page > 1 ? 0 : rows.length,
                total: summary.callsToday.toLocaleString('en-US'),
              })}
            </p>
            <Pager
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              labels={{
                nav: t('callLog.pagerNav'),
                previous: t('common.previous'),
                next: t('common.next'),
              }}
            />
          </div>
        </section>
      </div>
    </>
  )
}

function CallRow({ call }: { call: OtaCall }) {
  const { t } = useTranslation()
  const style = RESULT_STYLE[call.result]

  return (
    <tr className={['border-b border-surface-background last:border-0', style.row].join(' ')}>
      <td className="px-4 py-4 align-top">
        <Link
          to={`/compliance/activity/call-log/${call.id}`}
          className="whitespace-nowrap font-mono text-sm text-text-secondary hover:text-primary-700 hover:underline"
        >
          {call.at}
        </Link>
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {t(call.agoKey, call.agoValues)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-[20px] items-center rounded-[3px] bg-surface-background px-1.5 font-mono text-[10px] font-semibold uppercase text-text-tertiary">
            {t(call.directionKey)}
          </span>
          <span className="font-mono text-sm text-text-primary">{call.path}</span>
        </p>
        <p className="mt-1.5 max-w-[210px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(call.purposeKey, { invoice: call.invoice })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <Link
          to={`/compliance/activity?q=${call.invoice}`}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          {call.invoice}
        </Link>
        <p className="mt-1 font-mono text-[11px] leading-[1.4] text-text-quaternary">
          {call.tddUuid}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[22px] items-center rounded-[3px] px-2 font-mono text-[11px] font-semibold',
            style.pill,
          ].join(' ')}
        >
          {call.status}
        </span>
        <p className="mt-1.5 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {call.errorCode ?? t(call.statusLabelKey)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p
          className={[
            'whitespace-nowrap text-sm font-medium tabular-nums',
            // A slow or timed-out call reads in the frame's amber; the rest stay plain.
            call.speedKey === 'callLog.speed.slow' || call.speedKey === 'callLog.speed.timedOut'
              ? 'text-pending-500'
              : 'text-text-secondary',
          ].join(' ')}
        >
          {call.seconds.toFixed(1)}s
        </p>
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {t(call.speedKey)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className={['max-w-[260px] text-xs font-medium leading-[1.5]', style.meaning].join(' ')}>
          {t(call.meaningKey, call.meaningValues)}
        </p>
      </td>
    </tr>
  )
}

function Kpi({
  label,
  value,
  note,
  tone = 'text-text-primary',
}: {
  label: string
  value: string
  note: string
  tone?: string
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <h3 className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</h3>
      <p className={['mt-2 text-[28px] font-semibold leading-[1.2] tabular-nums', tone].join(' ')}>
        {value}
      </p>
      <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}

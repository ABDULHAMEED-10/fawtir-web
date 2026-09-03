import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover } from '../../components/ui'
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
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import exportIcon from '../../assets/bill-capture/file.svg'
import viewIcon from '../../assets/actions/view.svg'

/** Each result tints its row and its status pill, so trouble is visible without reading. */
const RESULT_STYLE: Record<CallResult, { row: string; pill: string; meaning: string }> = {
  ok: { row: '', pill: 'bg-success-100 text-[#3d5648]', meaning: 'text-text-tertiary' },
  pending: {
    row: 'bg-pending-100/40',
    pill: 'bg-pending-100 text-pending-700',
    meaning: 'text-pending-500',
  },
  rejected: {
    row: 'bg-[#fdf4f2]',
    pill: 'bg-danger-100 text-danger-700',
    meaning: 'text-danger-700',
  },
  noAnswer: {
    row: 'bg-[#fdf4f2]',
    pill: 'bg-danger-100 text-danger-700',
    meaning: 'text-pending-500',
  },
}

export function OtaCallLogPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState('all')
  const [sort, setSort] = useState<CallSortKey>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)

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

  return (
    <AppShell>
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

          <div className="flex shrink-0 items-center gap-2.5">
            <ActionMenu
              variant="bordered"
              label={t('callLog.more')}
              items={[
                {
                  id: 'export',
                  labelKey: 'activityDetail.getZip',
                  icon: exportIcon,
                },
                {
                  id: 'submissions',
                  labelKey: 'callLog.backToSubmissions',
                  icon: viewIcon,
                  to: '/compliance/activity',
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
        <p className="flex items-start gap-2.5 rounded-sm bg-surface-background px-4 py-3.5 text-sm font-medium leading-[1.5] text-text-tertiary">
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
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center">
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
              <button
                ref={sortRef}
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={sortIcon} alt="" className="size-5" />
                {t('callLog.sort')}
              </button>
              <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
                <ul className="w-[200px] py-1.5">
                  {CALL_SORTS.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort(option.value)
                          setSortOpen(false)
                        }}
                        className={[
                          'flex w-full px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                          option.value === sort ? 'text-primary-700' : 'text-text-secondary',
                        ].join(' ')}
                      >
                        {t(option.labelKey)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Popover>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                ) : (
                  rows.map((call) => <CallRow key={call.id} call={call} />)
                )}
              </tbody>
            </table>
          </div>

          <p className="px-5 py-4 text-sm font-medium text-text-quaternary">
            {t('callLog.showing', {
              shown: rows.length,
              total: summary.callsToday.toLocaleString('en-US'),
            })}
          </p>
        </section>
      </div>
    </AppShell>
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
          className="whitespace-nowrap text-sm font-semibold text-text-secondary tabular-nums hover:text-primary-700 hover:underline"
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
            {call.method}
          </span>
          <span className="font-mono text-sm text-text-primary">{call.path}</span>
        </p>
        <p className="mt-1.5 max-w-[210px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(call.purposeKey, { invoice: call.invoice })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <Link
          to={`/compliance/activity/${call.invoice}`}
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
        <p className="whitespace-nowrap text-sm font-medium text-text-secondary tabular-nums">
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

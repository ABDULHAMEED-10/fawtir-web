import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover, RowsView } from '../../components/ui'
import {
  ACTIVITY_SORTS,
  ACTIVITY_SUMMARY,
  ACTIVITY_TABS,
  FLOWS,
  SUBMISSIONS,
  TAB_TOTALS,
  formatDuration,
  matchesQuery,
  matchesTab,
  type Acknowledgement,
  type ActivitySortKey,
  type ActivityTabId,
  type OtaOutcome,
  type Submission,
  type TddFlow,
} from '../../lib/activity'
import { CALL_DETAIL } from '../../lib/otaCallLog'
import { ActivityEmptyState } from './ActivityEmptyState'
import kpiAcceptedIcon from '../../assets/activity/kpi-cleared.svg'
import kpiWaitingIcon from '../../assets/activity/kpi-attention.svg'
import kpiClockIcon from '../../assets/activity/kpi-waiting.svg'
import kpiAckIcon from '../../assets/activity/ch-peppol.svg'
import ackYesIcon from '../../assets/activity/ack-yes.svg'
import ackNoneIcon from '../../assets/activity/ack-none.svg'
import ackLateIcon from '../../assets/activity/ack-late.svg'
import menuOpenIcon from '../../assets/actions/view.svg'
import menuResubmitIcon from '../../assets/activity/kpi-cleared.svg'
import menuCallIcon from '../../assets/activity/ch-ota.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuXmlIcon from '../../assets/bill-capture/file.svg'
import reportIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const OUTCOME_CHIP: Record<OtaOutcome, { chip: string; dot: string; body: string }> = {
  accepted: {
    chip: 'bg-success-100 text-[#3d5648]',
    dot: 'bg-[#3d5648]',
    body: 'text-text-tertiary',
  },
  rejected: {
    chip: 'bg-danger-100 text-danger-700',
    dot: 'bg-danger-700',
    body: 'text-danger-700',
  },
  waiting: {
    chip: 'bg-pending-100 text-pending-700',
    dot: 'bg-pending-700',
    body: 'text-pending-500',
  },
  superseded: {
    chip: 'bg-surface-background text-text-quaternary',
    dot: 'bg-text-quaternary',
    body: 'text-text-quaternary',
  },
}

const FLOW_CHIP: Record<TddFlow, string> = {
  b2bDomestic: 'bg-primary-50 text-primary-800',
  b2c: 'bg-surface-background text-text-tertiary',
  export: 'bg-pending-100 text-pending-700',
}

const ACK_ICON: Record<Acknowledgement, string> = {
  received: ackYesIcon,
  notOnPeppol: ackLateIcon,
  noCustomer: ackNoneIcon,
}

const PAGE_SIZE = 7

export function ActivityPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ActivityTabId>('all')
  const [query, setQuery] = useState('')
  const [flow, setFlow] = useState('all')
  const [sort, setSort] = useState<ActivitySortKey>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [page, setPage] = useState(1)

  const rows = useMemo(() => {
    const filtered = SUBMISSIONS.filter(
      (row) =>
        matchesTab(row, tab) && (flow === 'all' || row.flow === flow) && matchesQuery(row, query),
    )
    if (sort === 'newest') return filtered
    return [...filtered].sort((a, b) =>
      sort === 'invoiceAsc' ? a.invoice.localeCompare(b.invoice) : 0,
    )
  }, [flow, query, sort, tab])

  const reset = () => setPage(1)

  if (SUBMISSIONS.length === 0) return <ActivityEmptyState />

  const summary = ACTIVITY_SUMMARY
  /** The bar under the acceptance figure, at the book's real proportions. */
  const bar = [
    { key: 'accepted', value: summary.accepted, tone: 'bg-[#4c6c5a]' },
    { key: 'rejected', value: summary.rejected, tone: 'bg-danger-700' },
    { key: 'waiting', value: summary.waiting, tone: 'bg-border-default' },
  ]

  /** Pagination reflects the whole book, not just the page the design draws. */
  const pageCount = Math.ceil(summary.submissions / PAGE_SIZE)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[720px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('activity.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('activity.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            <Link
              to="/compliance/activity/call-log"
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('activity.callLog')}
            </Link>
            <Link
              to="/compliance/activity/report"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={reportIcon} alt="" className="size-5 brightness-0 invert" />
              {t('activity.complianceReport')}
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-100">
                <img src={kpiAcceptedIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('activity.kpi.accepted')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-[#3d5648] tabular-nums">
              {summary.acceptanceRate}%
            </p>
            <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full">
              {bar.map((segment) => (
                <span
                  key={segment.key}
                  className={segment.tone}
                  style={{ width: `${(segment.value / summary.submissions) * 100}%` }}
                />
              ))}
            </div>
            <p className="mt-2.5 text-xs font-medium leading-[1.3] text-text-quaternary">
              {t('activity.kpi.acceptedBreakdown', {
                accepted: summary.accepted.toLocaleString('en-US'),
                rejected: summary.rejected,
                waiting: summary.waiting,
              })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pending-100">
                <img src={kpiWaitingIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('activity.kpi.waitingOnYou')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-pending-700 tabular-nums">
              {summary.needsAttention}
            </p>
            <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t('activity.kpi.waitingOnYouNote')}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-background">
                <img src={kpiClockIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('activity.kpi.timeToAcceptance')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {formatDuration(summary.averageSeconds)}
            </p>
            <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t('activity.kpi.timeToAcceptanceNote', {
                previous: formatDuration(summary.previousAverageSeconds),
              })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <img src={kpiAckIcon} alt="" className="size-[18px] text-primary-800" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('activity.kpi.acknowledged')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {summary.acknowledgedRate}%
            </p>
            <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              {t('activity.kpi.acknowledgedNote', {
                good: summary.acknowledged.toLocaleString('en-US'),
                total: summary.invoices.toLocaleString('en-US'),
              })}
            </p>
          </article>
        </div>

        {/* Table */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {ACTIVITY_TABS.map((entry) => {
              const isActive = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setTab(entry.id)
                    reset()
                  }}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(entry.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      isActive ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {TAB_TOTALS[entry.id].toLocaleString('en-US')}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center max-md:max-w-none max-md:basis-full">
              <img
                src={searchIcon}
                alt=""
                className="pointer-events-none absolute start-3.5 size-5 opacity-60"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  reset()
                }}
                placeholder={t('activity.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <FilterMenu
                label={t('activity.filters')}
                value={flow}
                defaultValue="all"
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('activity.allFlows') },
                  ...FLOWS.map((id) => ({ value: id, label: t(`activity.flow.${id}`) })),
                ]}
                onChange={(value) => {
                  setFlow(value)
                  reset()
                }}
              />
              <button
                ref={sortRef}
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={sortIcon} alt="" className="size-5" />
                {t('activity.sort')}
              </button>
              <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
                <ul className="w-[200px] py-1.5">
                  {ACTIVITY_SORTS.map((option) => (
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

          <RowsView className="px-5">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(['invoice', 'reference', 'flow', 'sent', 'otaSaid', 'customer'] as const).map(
                    (key) => (
                      <th
                        key={key}
                        className="h-[46px] px-4 text-start font-semibold first:rounded-s-sm"
                      >
                        {t(`activity.col.${key}`)}
                      </th>
                    ),
                  )}
                  <th className="h-[46px] rounded-e-sm px-4" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('activity.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => <SubmissionRow key={row.id} row={row} />)
                )}
              </tbody>
            </table>
          </RowsView>

          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm font-medium text-text-quaternary">
              {t('activity.showing', {
                shown: rows.length,
                total: summary.submissions.toLocaleString('en-US'),
              })}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
              </button>
              {[1, 2, 3].map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  className={[
                    'inline-flex size-9 items-center justify-center rounded-sm text-sm font-semibold transition-colors',
                    number === page
                      ? 'bg-primary-700 text-white'
                      : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                  ].join(' ')}
                >
                  {number}
                </button>
              ))}
              <span className="px-1 text-sm font-medium text-text-quaternary">…</span>
              <button
                type="button"
                onClick={() => setPage(pageCount)}
                className={[
                  'inline-flex h-9 min-w-9 items-center justify-center rounded-sm px-2 text-sm font-semibold transition-colors',
                  page === pageCount
                    ? 'bg-primary-700 text-white'
                    : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {pageCount}
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={page === pageCount}
                onClick={() => setPage(page + 1)}
                className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
              >
                <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function SubmissionRow({ row }: { row: Submission }) {
  const { t } = useTranslation()
  const outcome = OUTCOME_CHIP[row.outcome]

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        <Link
          to={`/compliance/activity/${row.invoice}`}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          {row.invoice}
        </Link>
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-text-quaternary">
          {row.customer} -<img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
          {row.customerAmount}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="font-mono text-xs leading-[1.4] text-text-secondary">{row.tddUuid}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.4px] text-text-quaternary">
          {row.fawtaraRef
            ? t('activity.fawtara', { ref: row.fawtaraRef })
            : t(row.referenceNoteKey ?? '', { id: '6C25-B840-1F97-5B02' })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[22px] items-center rounded-sm px-2 text-[10px] font-semibold uppercase tracking-[0.5px]',
            FLOW_CHIP[row.flow],
          ].join(' ')}
        >
          {t(`activity.flow.${row.flow}`)}
        </span>
        <p className="mt-1.5 max-w-[150px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(row.routeKey, row.routeValues)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-secondary">
          {row.sentDate === 'today' ? t('activity.today') : row.sentDate}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary tabular-nums">{row.sentTime}</p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
            outcome.chip,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', outcome.dot].join(' ')} />
          {t(`activity.outcome.${row.outcome}`)}
        </span>
        <p
          className={['mt-1.5 max-w-[210px] text-xs font-medium leading-[1.5]', outcome.body].join(
            ' ',
          )}
        >
          {t(row.verdictKey, row.verdictValues)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex flex-col items-center gap-1">
          <img src={ACK_ICON[row.acknowledgement]} alt="" className="size-5" />
          <span className="whitespace-nowrap text-xs font-medium text-text-quaternary">
            {t(`activity.ack.${row.acknowledgement}`)}
          </span>
        </div>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <ActionMenu
          wide
          label={t('activity.rowActions')}
          items={[
            {
              id: 'openInvoice',
              labelKey: 'activity.menu.openInvoice',
              descriptionKey: 'activity.menu.openInvoiceNote',
              icon: menuOpenIcon,
              to: `/invoices/${row.invoice}`,
            },
            ...(row.outcome === 'rejected'
              ? [
                  {
                    id: 'resubmit',
                    labelKey: 'activity.menu.resubmit',
                    descriptionKey: 'activity.menu.resubmitNote',
                    icon: menuResubmitIcon,
                    to: `/compliance/activity/${row.invoice}/resubmit`,
                  },
                ]
              : []),
            {
              id: 'viewCall',
              labelKey: 'activity.menu.viewCall',
              descriptionKey: 'activity.menu.viewCallNote',
              icon: menuCallIcon,
              // Only one call is held in full; the rest open the log rather than a wrong detail.
              to:
                row.invoice === CALL_DETAIL.invoice
                  ? `/compliance/activity/call-log/${CALL_DETAIL.id}`
                  : '/compliance/activity/call-log',
            },
            {
              id: 'copyUuid',
              labelKey: 'activity.menu.copyUuid',
              descriptionKey: 'activity.menu.copyUuidNote',
              icon: menuCopyIcon,
              onSelect: () => navigator.clipboard?.writeText(row.tddUuid),
            },
            {
              id: 'downloadXml',
              labelKey: 'activity.menu.downloadXml',
              descriptionKey: 'activity.menu.downloadXmlNote',
              icon: menuXmlIcon,
            },
          ]}
        />
      </td>
    </tr>
  )
}

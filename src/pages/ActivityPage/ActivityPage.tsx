import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  OmAmount,
  Pager,
  RowsView,
  SortMenu,
  type ActionMenuItem,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  ACTIVITY_PAGE_SIZE,
  activityListPath,
  activitySummaryPath,
  ledgerExportPath,
  loadActivityList,
  loadActivitySummary,
  resubmitTdd,
  type ActivityFilters,
  type ActivityItemDto,
  type ActivityListDto,
  type ActivitySummaryDto,
} from '../../api/compliance/activity'
import {
  ACTIVITY_SORTS,
  ACTIVITY_TABS,
  canResubmit,
  customerAckOf,
  deliveredCount,
  DIRECTION_FILTERS,
  flowOf,
  formatDuration,
  isActivitySort,
  isActivityTab,
  isDirectionFilter,
  outcomeOf,
  secondsBetween,
  shareOf1,
  sortItems,
  tabCount,
  type ActivitySortKey,
  type ActivityTabId,
  type CustomerAck,
  type DirectionFilter,
  type RowFlow,
  type RowOutcome,
} from '../../lib/activityLedger'
import { defaultReportRange, downloadReport } from '../../api/reports/reports'
import { saveDownload } from '../../lib/supplierRecord'
import { describeApiFailure } from '../../lib/apiFailure'
import { BUSINESS_TIME_ZONE, formatAmount, formatCount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { ActivityEmptyState } from './ActivityEmptyState'
import { ComplianceReportModal, type ReportRequest } from './ComplianceReportModal'
import kpiAcceptedIcon from '../../assets/activity/kpi-cleared.svg'
import kpiWaitingIcon from '../../assets/activity/kpi-attention.svg'
import kpiClockIcon from '../../assets/activity/kpi-waiting.svg'
import kpiAckIcon from '../../assets/activity/ch-peppol.svg'
import ackYesIcon from '../../assets/activity/ack-yes.svg'
import ackNoneIcon from '../../assets/activity/ack-none.svg'
import ackLateIcon from '../../assets/activity/ack-late.svg'
import ackRefusedIcon from '../../assets/activity/step-failed.svg'
import menuOpenIcon from '../../assets/actions/view.svg'
import menuResubmitIcon from '../../assets/activity/kpi-cleared.svg'
import menuSendIcon from '../../assets/actions/send.svg'
import menuInvoiceIcon from '../../assets/actions/invoice.svg'
import menuCallIcon from '../../assets/activity/ch-ota.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuXmlIcon from '../../assets/bill-capture/file.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'

const OUTCOME_STYLE: Record<RowOutcome, { chip: string; dot: string; body: string }> = {
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
  // Amber, as the frame draws it, and never red: silence is not a failure.
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
  notOwed: {
    chip: 'bg-surface-background text-text-tertiary',
    dot: 'bg-text-quaternary',
    body: 'text-text-quaternary',
  },
}

const FLOW_CHIP: Record<RowFlow, string> = {
  b2bDomestic: 'bg-primary-50 text-primary-800',
  b2c: 'bg-surface-background text-text-tertiary',
  export: 'bg-pending-100 text-pending-700',
}

const CUSTOMER_ICON: Record<CustomerAck, string> = {
  received: ackYesIcon,
  noCustomer: ackNoneIcon,
  notOnPeppol: ackLateIcon,
  waiting: ackLateIcon,
  refused: ackRefusedIcon,
}

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

/**
 * Compliance › Activity (Figma 154:109992; its empty state 154:110456).
 *
 * The frame is the layout: four cards, six tabs, a search with Filters and Sort, and a row per
 * submission with its invoice, TDD and Fawtara reference, flow, time, what the OTA said and
 * whether the customer acknowledged it. The ledger feeds it (`/v1/compliance/activity` and its
 * summary); what the ledger does not carry yet is drawn from optional fields and listed in the
 * backend asks doc, section 2.
 *
 * Two rules from the integration stand. **Silence is not rejection**: NONE reads "Still waiting",
 * in amber and never red, and never offers a resend (SPOG v1.0.0 §6.2). **The resend is the
 * server's**: "Send the report again" appears only where the row carries its link, and only to
 * someone who may submit.
 */
export function ActivityPage() {
  return (
    <AppShell>
      <ActivityLedger />
    </AppShell>
  )
}

function ActivityLedger() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const session = useSession()
  const mayResubmit = can(session, 'invoice.submit')
  const [params, setParams] = useSearchParams()

  const tab: ActivityTabId = isActivityTab(params.get('tab'))
    ? (params.get('tab') as ActivityTabId)
    : 'all'
  const direction: DirectionFilter = isDirectionFilter(params.get('dir'))
    ? (params.get('dir') as DirectionFilter)
    : 'all'
  const sort: ActivitySortKey = isActivitySort(params.get('sort'))
    ? (params.get('sort') as ActivitySortKey)
    : 'newest'
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const search = params.get('q') ?? ''

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (!value) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  const [typed, setTyped] = useState(search)
  useEffect(() => setTyped(search), [search])
  useEffect(() => {
    if (typed === search) return
    const timer = window.setTimeout(
      () => update({ q: typed.trim() || null, page: null }),
      SEARCH_DELAY_MS,
    )
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const tabFilters = ACTIVITY_TABS.find((entry) => entry.id === tab)?.filters ?? {}
  const filters: ActivityFilters = {
    ...tabFilters,
    direction: direction === 'all' ? '' : direction,
    invoiceNumber: search,
  }
  const listPath = activityListPath(filters, pageNumber - 1)
  const list = useApiRead<ActivityListDto>(listPath, () => loadActivityList(listPath))
  // The summary refuses a call with no window (400, whatever the signature says the parameters
  // are). The ledger below is unwindowed and stays that way; only the counts above it need one.
  const summaryRange = defaultReportRange()
  const summaryPath = activitySummaryPath(summaryRange.from, summaryRange.to)
  const summary = useApiRead<ActivitySummaryDto>(summaryPath, () =>
    loadActivitySummary(summaryPath),
  )

  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const fail = (error: unknown) => {
    setNotice(null)
    const message = describeApiFailure(error)
    setFailure(t(message.key, message.values))
  }

  const resubmit = async (item: ActivityItemDto) => {
    if (!item.links.resubmit) return
    setBusy(item.invoice_uuid)
    setFailure(null)
    try {
      await resubmitTdd(item.links.resubmit)
      setNotice(t('activity.resubmitted'))
      list.retry()
      summary.retry()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  const downloadXml = async (item: ActivityItemDto) => {
    const href = item.links.tdd_xml
    if (!href) return
    try {
      const file = await downloadReport(href.startsWith('/api/') ? href.slice('/api'.length) : href)
      saveDownload(file, `${item.invoice_number ?? item.invoice_uuid}-tdd.xml`)
    } catch (error) {
      fail(error)
    }
  }

  /**
   * The dialog's "Build Report". PDF opens the built report; Excel is the ledger itself, one row
   * per document, carrying the tab and filters on screen and the period chosen, so the file and
   * the page cannot disagree about which documents they cover.
   */
  const buildReport = async (request: ReportRequest) => {
    setReportOpen(false)
    if (request.formats.includes('excel')) {
      try {
        const path = ledgerExportPath({ ...filters, from: request.from, to: request.to }, 'xlsx')
        const file = await downloadReport(path)
        saveDownload(file, 'fawtir-compliance-ledger.xlsx')
        if (file.headers.get('X-Fawtir-Export-Truncated') === 'true') {
          setNotice(t('ledgerExport.truncated'))
        }
      } catch (error) {
        fail(error)
      }
    }
    if (request.formats.includes('pdf')) {
      navigate(`/compliance/activity/report?period=${request.period}`)
    }
  }

  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const page = list.read.status === 'ready' ? list.read.data : null
  const filtered = search !== '' || direction !== 'all'
  const isEmpty =
    totals !== null &&
    totals.documents === 0 &&
    page !== null &&
    page.items.length === 0 &&
    tab === 'all' &&
    !filtered

  const count = (value: number) => formatCount(value, language)

  const header = (
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
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('activity.callLog')}
        </Link>
        {/* Nothing to report on before the first invoice, so the empty frame drops the button. */}
        {isEmpty ? null : (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={downloadIcon} alt="" className="size-5 brightness-0 invert" />
            {t('activity.complianceReport')}
          </button>
        )}
      </div>
    </div>
  )

  const shell = (children: ReactNode) => (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {failure ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}
      {children}
      <ComplianceReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onBuild={(request) => void buildReport(request)}
      />
    </div>
  )

  if (summary.read.status === 'loading') return shell(<LoadingNotice />)
  if (summary.read.status === 'failed') {
    return shell(<ApiReadFailure error={summary.read.error} retry={summary.retry} />)
  }
  if (isEmpty) return shell(<ActivityEmptyState />)

  const book = totals as ActivitySummaryDto
  const accepted = deliveredCount(book.tdd_ack)
  const decided = accepted + book.tdd_ack.re + book.tdd_ack.none
  const bar = [
    { key: 'accepted', value: accepted, tone: 'bg-[#4c6c5a]' },
    { key: 'rejected', value: book.tdd_ack.re, tone: 'bg-danger-700' },
    { key: 'waiting', value: book.tdd_ack.none, tone: 'bg-border-default' },
  ]
  const typicalSeconds =
    book.median_minutes_to_tdd_ack === null ? null : Math.round(book.median_minutes_to_tdd_ack * 60)
  const previousSeconds =
    book.previous_median_minutes_to_tdd_ack == null
      ? null
      : Math.round(book.previous_median_minutes_to_tdd_ack * 60)
  const customerTotal =
    book.invoice_ack.ap + book.invoice_ack.ab + book.invoice_ack.re + book.invoice_ack.none
  const customerGood = deliveredCount(book.invoice_ack)

  const rows = page ? sortItems(page.items, sort) : []
  const tabTotal = tabCount(book, tab)
  const pageCount = Math.max(
    pageNumber + (page?.has_more ? 1 : 0),
    filtered ? 1 : Math.ceil(tabTotal / ACTIVITY_PAGE_SIZE),
  )

  return shell(
    <>
      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={kpiAcceptedIcon} tile="bg-success-100" label={t('activity.kpi.accepted')}>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-[#3d5648] tabular-nums">
            {shareOf1(accepted, decided)}%
          </p>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-border-default">
            {decided > 0
              ? bar.map((segment) => (
                  <span
                    key={segment.key}
                    className={segment.tone}
                    style={{ width: `${(segment.value / decided) * 100}%` }}
                  />
                ))
              : null}
          </div>
          <p className="mt-2.5 text-xs font-medium leading-[1.3] text-text-quaternary">
            <span className="text-[#3d5648]">
              {t('activity.kpi.acceptedCount', { count: accepted, n: count(accepted) })}
            </span>
            {' - '}
            <span className="text-danger-700">
              {t('activity.kpi.rejectedCount', { n: count(book.tdd_ack.re) })}
            </span>
            {' - '}
            {t('activity.kpi.waitingCount', { n: count(book.tdd_ack.none) })}
          </p>
        </Kpi>

        <Kpi icon={kpiWaitingIcon} tile="bg-pending-100" label={t('activity.kpi.waitingOnYou')}>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-pending-700 tabular-nums">
            {count(book.attention)}
          </p>
          <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
            {t('activity.kpi.waitingOnYouNote')}
          </p>
        </Kpi>

        <Kpi icon={kpiClockIcon} tile="bg-primary-50" label={t('activity.kpi.timeToAcceptance')}>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            {typicalSeconds === null ? t('activity.kpi.noTimeYet') : formatDuration(typicalSeconds)}
          </p>
          <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
            {typicalSeconds !== null && previousSeconds !== null
              ? t(
                  previousSeconds >= typicalSeconds
                    ? 'activity.kpi.timeToAcceptanceDown'
                    : 'activity.kpi.timeToAcceptanceUp',
                  { previous: formatDuration(previousSeconds) },
                )
              : t('activity.kpi.timeToAcceptancePlain')}
          </p>
        </Kpi>

        <Kpi icon={kpiAckIcon} tile="bg-surface-background" label={t('activity.kpi.acknowledged')}>
          <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
            {shareOf1(customerGood, customerTotal)}%
          </p>
          <p className="mt-2.5 text-xs font-medium leading-[1.4] text-text-quaternary">
            {t('activity.kpi.acknowledgedNote', {
              good: count(customerGood),
              total: count(customerTotal),
            })}
          </p>
        </Kpi>
      </div>

      {/* Table */}
      <section className="rounded-md bg-surface-card">
        <div
          role="tablist"
          className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5"
        >
          {ACTIVITY_TABS.map((entry) => {
            const isActive = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'inline-flex h-[58px] items-center gap-2 border-b-2 px-3 text-base font-medium transition-colors',
                  isActive
                    ? 'border-primary-700 text-primary-700'
                    : 'border-transparent text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {t(`activity.tabs.${entry.id}`)}
                <span
                  className={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-surface-background text-text-tertiary',
                  ].join(' ')}
                >
                  {count(tabCount(book, entry.id))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="relative flex h-[46px] w-full max-w-[344px] items-center max-md:max-w-none max-md:basis-full">
            <img
              src={searchIcon}
              alt=""
              className="pointer-events-none absolute start-3.5 size-5 opacity-60"
            />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('activity.searchPlaceholder')}
              aria-label={t('activity.searchPlaceholder')}
              className="h-full w-full rounded-sm border border-border-subtle bg-surface-background/60 ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
            />
          </label>

          <div className="flex items-center gap-2.5">
            <FilterMenu
              label={t('activity.filters')}
              value={direction}
              defaultValue="all"
              icon={filterIcon}
              options={DIRECTION_FILTERS.map((value) => ({
                value,
                label: t(`activity.directionFilter.${value}`),
              }))}
              onChange={(value) => update({ dir: value === 'all' ? null : value, page: null })}
            />
            <SortMenu
              label={t('activity.sort')}
              value={sort}
              options={ACTIVITY_SORTS}
              onChange={(value) => update({ sort: value === 'newest' ? null : value })}
            />
          </div>
        </div>

        {list.read.status === 'loading' ? <LoadingNotice /> : null}
        {list.read.status === 'failed' ? (
          <ApiReadFailure error={list.read.error} retry={list.retry} />
        ) : null}

        {page ? (
          <RowsView>
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(['invoice', 'reference', 'flow', 'sent', 'otaSaid', 'customer'] as const).map(
                    (key) => (
                      <th key={key} className="h-[37px] px-4 text-start font-semibold">
                        {t(`activity.col.${key}`)}
                      </th>
                    ),
                  )}
                  <th className="h-[37px] w-12 px-4">
                    <span className="sr-only">{t('activity.rowActions')}</span>
                  </th>
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
                  rows.map((item) => (
                    <SubmissionRow
                      key={item.invoice_uuid}
                      item={item}
                      language={language}
                      typicalSeconds={typicalSeconds}
                      mayResubmit={mayResubmit}
                      busy={busy === item.invoice_uuid}
                      onResubmit={() => void resubmit(item)}
                      onDownloadXml={() => void downloadXml(item)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </RowsView>
        ) : null}

        {page ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-sm font-medium text-text-secondary">
              {filtered
                ? t('activity.showingFiltered', { shown: count(rows.length) })
                : t('activity.showing', { shown: count(rows.length), total: count(tabTotal) })}
            </p>
            {pageCount > 1 ? (
              <Pager
                page={pageNumber}
                pageCount={pageCount}
                onChange={(next) => update({ page: next === 1 ? null : String(next) })}
                labels={{
                  nav: t('activity.pager.nav'),
                  previous: t('common.previous'),
                  next: t('common.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </>,
  )
}

function Kpi({
  icon,
  tile,
  label,
  children,
}: {
  icon: string
  tile: string
  label: string
  children: ReactNode
}) {
  return (
    <article className="rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3">
        <span
          className={['flex size-9 shrink-0 items-center justify-center rounded-full', tile].join(
            ' ',
          )}
        >
          <img src={icon} alt="" className="size-[18px]" />
        </span>
        <h3 className="text-base font-medium leading-[1.2] text-text-primary">{label}</h3>
      </div>
      {children}
    </article>
  )
}

/** `30 Jul` and `09:41` in the business's time zone, or "Today". */
function sentParts(iso: string, language: string, t: (key: string) => string) {
  const date = new Date(iso)
  const locale = language.startsWith('ar') ? 'ar-OM' : 'en-GB'
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(date)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(
    new Date(),
  )
  return {
    day:
      day === today
        ? t('activity.today')
        : // Day then month, as the frame prints `30 Jul`; en-GB alone would say `Sept`.
          `${new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: BUSINESS_TIME_ZONE }).format(date)} ${new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-OM' : 'en-US', { month: 'short', timeZone: BUSINESS_TIME_ZONE }).format(date)}`,
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: BUSINESS_TIME_ZONE,
    }).format(date),
  }
}

function SubmissionRow({
  item,
  language,
  typicalSeconds,
  mayResubmit,
  busy,
  onResubmit,
  onDownloadXml,
}: {
  item: ActivityItemDto
  language: string
  typicalSeconds: number | null
  mayResubmit: boolean
  busy: boolean
  onResubmit: () => void
  onDownloadXml: () => void
}) {
  const { t } = useTranslation()
  const outcome = outcomeOf(item)
  const style = OUTCOME_STYLE[outcome]
  const flow = flowOf(item)
  const customer = customerAckOf(item)
  const leg = item.tdd_leg
  const sent = sentParts(leg?.submitted_at ?? item.occurred_at, language, t)
  const number = item.invoice_number ?? t('activity.unnumbered')
  const offerResubmit = canResubmit(item) && mayResubmit
  const detail = `/compliance/activity/${item.invoice_uuid}`

  const referenceNote = item.fawtara_reference
    ? t('activity.fawtara', { ref: item.fawtara_reference })
    : outcome === 'superseded' && item.superseded_by
      ? t('activity.ref.replacedBy', { id: item.superseded_by.toUpperCase() })
      : outcome === 'rejected'
        ? t('activity.ref.neverAccepted')
        : outcome === 'notOwed'
          ? t('activity.noTdd')
          : t('activity.ref.waiting')

  const cleared = secondsBetween(leg?.submitted_at ?? null, leg?.ack_at ?? null)
  const verdict = (() => {
    switch (outcome) {
      case 'rejected':
        return leg?.reason ?? t('activity.verdict.rejectedNoReason')
      case 'waiting': {
        const elapsed = secondsBetween(
          leg?.submitted_at ?? item.occurred_at,
          new Date().toISOString(),
        )
        return t('activity.verdict.noAnswerYet', {
          elapsed: formatDuration(elapsed ?? 0),
          usual: formatDuration(typicalSeconds ?? 120),
        })
      }
      case 'superseded':
        return t('activity.verdict.disregarded')
      case 'notOwed':
        return t('activity.verdict.notOwed')
      case 'accepted': {
        const time = cleared === null ? null : formatDuration(cleared)
        if (flow === 'b2c')
          return t(
            time ? 'activity.verdict.clearedNotDelivered' : 'activity.verdict.notDelivered',
            { time },
          )
        if (flow === 'export')
          return t(time ? 'activity.verdict.clearedZeroRated' : 'activity.verdict.zeroRated', {
            time,
          })
        return time ? t('activity.verdict.clearedIn', { time }) : t('activity.verdict.accepted')
      }
    }
  })()

  const route = item.scenario
    ? item.scenario.stand_in_id
      ? t('activity.route.standIn', { id: item.scenario.stand_in_id, flow: item.scenario.flow })
      : t('activity.route.bothOnPeppol', { flow: item.scenario.flow })
    : t(`activity.route.${flow}`)

  const menu: ActionMenuItem[] = [
    {
      id: 'record',
      labelKey: 'activity.menu.openRecord',
      descriptionKey: 'activity.menu.openRecordNote',
      icon: menuOpenIcon,
      to: detail,
    },
    ...(offerResubmit
      ? [
          {
            id: 'putRight',
            labelKey: 'activity.menu.resubmit',
            descriptionKey: 'activity.menu.resubmitNote',
            icon: menuResubmitIcon,
            to: `${detail}/resubmit`,
          },
          {
            id: 'sendAgain',
            labelKey: busy ? 'common.saving' : 'activity.menu.sendAgain',
            descriptionKey: 'activity.menu.sendAgainNote',
            icon: menuSendIcon,
            onSelect: onResubmit,
          },
        ]
      : []),
    ...(item.links.document
      ? [
          {
            id: 'openInvoice',
            labelKey: 'activity.menu.openInvoice',
            descriptionKey: 'activity.menu.openInvoiceNote',
            icon: menuInvoiceIcon,
            to: `/invoices/${item.invoice_uuid}`,
          },
        ]
      : []),
    {
      id: 'viewCall',
      labelKey: 'activity.menu.viewCall',
      descriptionKey: 'activity.menu.viewCallNote',
      icon: menuCallIcon,
      to: '/compliance/activity/call-log',
    },
    ...(item.tdd_uuid
      ? [
          {
            id: 'copyUuid',
            labelKey: 'activity.menu.copyUuid',
            descriptionKey: 'activity.menu.copyUuidNote',
            icon: menuCopyIcon,
            onSelect: () => void navigator.clipboard?.writeText(item.tdd_uuid ?? ''),
          },
        ]
      : []),
    ...(item.links.tdd_xml
      ? [
          {
            id: 'downloadXml',
            labelKey: 'activity.menu.downloadXml',
            descriptionKey: 'activity.menu.downloadXmlNote',
            icon: menuXmlIcon,
            onSelect: onDownloadXml,
          },
        ]
      : []),
  ]

  const muted = outcome === 'superseded'

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-5 align-top">
        <Link
          to={detail}
          className={[
            'text-base font-medium hover:underline',
            muted ? 'text-primary-300' : 'text-primary-700',
          ].join(' ')}
        >
          {number}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] font-medium text-text-secondary">
          {item.counterparty ?? t('activity.noCounterparty')}
          {item.amount != null ? (
            <>
              <span aria-hidden="true">-</span>
              <OmAmount
                size="xs"
                amount={formatAmount(item.amount, item.currency_code ?? 'OMR', language)}
                amountClassName="tabular-nums"
              />
            </>
          ) : null}
        </p>
      </td>

      <td className="px-4 py-5 align-top">
        <p className="font-mono text-[13px] leading-[1.4] text-text-secondary">
          {item.tdd_uuid ?? t('activity.ref.noUuid')}
        </p>
        <p className="mt-1.5 text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
          {referenceNote}
        </p>
      </td>

      <td className="px-4 py-5 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center rounded-sm px-2 text-[10px] font-semibold uppercase tracking-[0.5px]',
            FLOW_CHIP[flow],
          ].join(' ')}
        >
          {t(`activity.flow.${flow}`)}
        </span>
        <p className="mt-1.5 max-w-[150px] text-xs font-medium leading-[1.4] text-text-secondary">
          {route}
        </p>
      </td>

      <td className="px-4 py-5 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-secondary">{sent.day}</p>
        <p className="mt-1 text-xs font-medium text-text-tertiary tabular-nums">{sent.time}</p>
      </td>

      <td className="px-4 py-5 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center gap-1.5 rounded-sm px-2 text-xs font-medium',
            style.chip,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', style.dot].join(' ')} />
          {t(`activity.outcome.${outcome}`)}
        </span>
        <p
          className={['mt-1.5 max-w-[210px] text-xs font-medium leading-[1.5]', style.body].join(
            ' ',
          )}
        >
          {verdict}
        </p>
      </td>

      <td className="px-4 py-5 align-top">
        <div className="flex flex-col items-start gap-1.5">
          <img src={CUSTOMER_ICON[customer]} alt="" className="size-7" />
          <span className="whitespace-nowrap text-xs font-medium text-text-tertiary">
            {t(`activity.ack.${customer}`)}
          </span>
        </div>
      </td>

      <td className="px-4 py-5 text-end align-middle">
        <ActionMenu wide floating label={t('activity.rowActionsFor', { number })} items={menu} />
      </td>
    </tr>
  )
}

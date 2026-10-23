import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  Modal,
  Popover,
  RialMark,
  RowsView,
  TableCheckbox,
  type ActionMenuItem,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, apiRequest, pageCountOf, type Page } from '../../api'
import { withQuery } from '../../api/query'
import {
  INVOICE_SUMMARY_PATH,
  exportInvoices,
  invoiceListPath,
  loadInvoicePage,
  loadInvoiceSummary,
  type InvoiceListFilter,
  type InvoiceRowDto,
  type InvoiceSummaryDto,
  type InvoiceListApproval,
  type InvoiceTypeDto,
} from '../../api/invoices/list'
import { discardDraft, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useBranchName } from '../../components/branch/useBranchName'
import {
  SALES_APPROVAL_RULE_PATH,
  loadSalesApprovalRule,
  type SalesApprovalRuleDto,
} from '../../api/invoices/salesApproval'
import { salesApprovalIsOn } from '../../lib/salesApproval'
import { cancelInvoice, type InvoiceSendResultDto } from '../../api/invoices/detail'
import { InvoiceImportModal } from '../../components/invoice/InvoiceImportModal'
import { SendInvoiceModal } from '../../components/invoice/SendInvoiceModal'
import { sendResultNote } from '../../lib/invoiceDispatch'
import {
  INVOICE_SORTS,
  INVOICE_TYPES,
  PERIODS,
  isInvoiceSort,
  isInvoiceTab,
  isInvoiceType,
  isPeriod,
  listFilter,
  periodRange,
  tabCount,
  toInvoiceListItem,
  type AuthoringChip,
  type InvoiceListItem,
  type InvoiceSortKey,
  type InvoiceTabId,
  type PaymentChip,
  type PeppolResponse,
  type PeriodId,
} from '../../lib/invoiceList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import outstandingIcon from '../../assets/invoices/kpi-outstanding.svg'
import paidIcon from '../../assets/invoices/kpi-paid.svg'
import awaitingIcon from '../../assets/invoices/kpi-awaiting.svg'
import overdueIcon from '../../assets/invoices/kpi-overdue.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import bulkUploadIcon from '../../assets/invoices/bulk-upload.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import viewIcon from '../../assets/actions/view.svg'
import sendIcon from '../../assets/actions/send.svg'
import duplicateIcon from '../../assets/actions/duplicate.svg'
import creditNoteIcon from '../../assets/actions/credit-note.svg'
import periodicIcon from '../../assets/actions/periodic.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

type Chip = { bg: string; dot: string; text: string }

const AUTHORING_STYLES: Record<AuthoringChip, Chip> = {
  draft: { bg: 'bg-neutral-25', dot: 'bg-text-quaternary', text: 'text-text-quaternary' },
  issued: { bg: 'bg-primary-25', dot: 'bg-primary-800', text: 'text-primary-800' },
  cancelled: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
  discarded: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
}

const PAYMENT_STYLES: Record<PaymentChip, Chip> = {
  overdue: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  awaiting: { bg: 'bg-warning-100', dot: 'bg-[#6d5a39]', text: 'text-[#6d5a39]' },
  partial: { bg: 'bg-warning-100', dot: 'bg-[#6d5a39]', text: 'text-[#6d5a39]' },
  toSend: { bg: 'bg-primary-25', dot: 'bg-primary-800', text: 'text-primary-800' },
  paid: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
}

/**
 * The PEPPOL/OTA column, as the design prints it: the Peppol response code of the last delivery.
 * A document sent by hand has no code, so it says so in a neutral pill; an undelivered one is blank.
 */
const DELIVERY_STYLES: Record<PeppolResponse | 'sentManually', Chip> = {
  AB: { bg: 'bg-primary-25', dot: 'bg-primary-700', text: 'text-primary-700' },
  AP: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
  RE: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  sentManually: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-tertiary' },
}
const DELIVERY_HINTS: Record<PeppolResponse, string> = {
  AB: 'invoicesPage.transmission.acknowledgedHint',
  AP: 'invoicesPage.transmission.acceptedHint',
  RE: 'invoicesPage.transmission.rejectedHint',
}

/**
 * The design's six tabs (Figma 154:172772). "To send" is issued documents not yet delivered by any
 * means: the list's `delivery=TO_SEND` and the summary's `toSend` read the same definition.
 */
type TabId = InvoiceTabId | 'toSend' | 'toApprove'
const TABS: { id: TabId; labelKey: string; danger?: boolean }[] = [
  { id: 'all', labelKey: 'invoicesPage.tabs.all' },
  { id: 'drafts', labelKey: 'invoicesPage.tabs.drafts' },
  { id: 'toSend', labelKey: 'invoicesPage.tabs.toSend' },
  { id: 'awaiting', labelKey: 'invoicesPage.tabs.awaiting' },
  { id: 'overdue', labelKey: 'invoicesPage.tabs.overdue', danger: true },
  { id: 'paid', labelKey: 'invoicesPage.tabs.paid' },
  // The approvers' queue (RL-6): drafts waiting for a sales approval. Drawn only for holders of
  // invoice.approve while the server offers sales approval and the company rule is on
  // (`offersQueue` below); bill approvers hold the same code, so the code alone would show the
  // tab on a deployment with sales approval switched off.
  { id: 'toApprove', labelKey: 'invoicesPage.tabs.toApprove' },
]
const isTab = (value: string | null): value is TabId =>
  value === 'toSend' || value === 'toApprove' || isInvoiceTab(value)

/** A draft's approval state, in the palette the row's other pills already use. */
const APPROVAL_STYLES: Record<InvoiceListApproval, Chip> = {
  PENDING: { bg: 'bg-warning-100', dot: 'bg-[#6d5a39]', text: 'text-[#6d5a39]' },
  APPROVED: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
  REJECTED: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
}

/** The design's Channel filter: the list reads the customer's sending method. */
type ChannelId = 'all' | 'peppol' | 'email'

/**
 * Income lists sales documents only. A self-billed invoice or credit note is a purchase written on
 * the supplier's behalf (its debt is the tenant's Expenditure payable, decision D2), so it lives
 * under Expenditure › Self-billing (owner decision, 6 Oct 2026): with no Type chosen, every tab and
 * its count ask for the sales types, and the Type filter offers nothing else.
 */
const SALES_TYPES: InvoiceTypeDto[] = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']
const SALES_SUMMARY_PATH = withQuery(INVOICE_SUMMARY_PATH, { type: SALES_TYPES.join(',') })
const CHANNELS: ChannelId[] = ['all', 'peppol', 'email']
const isChannel = (value: string | null): value is ChannelId =>
  CHANNELS.includes(value as ChannelId)

const PAGE_SIZES = [6, 10, 25, 50] as const
const DEFAULT_PAGE_SIZE = 10
/**
 * The frame's period chip reads "This month" (Figma 154:172772), yet its rows include a draft and
 * July documents: the chip is the mock's state, not a rule. A month filter by default would hide
 * every draft (no issue date) and last month's overdue invoices, so the list opens on all time and
 * "This month" is one choice away.
 */
const DEFAULT_PERIOD: PeriodId = 'all'

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

export function InvoicesPage() {
  return (
    <AppShell>
      <InvoicesScreen />
    </AppShell>
  )
}

/**
 * Inside the shell, so its reads start only once the shell has confirmed a session. The tab,
 * filters, search, sort, page size and page live in the URL, so a filtered list survives a reload
 * and the back button.
 */
function InvoicesScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const asked: TabId = isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'all'
  // The approvers' queue is offered only while the server says sales approval is on: the rule read
  // carries `available: true` (the deployment's switch) and `enabled` true (the company rule). A
  // missing `available` (an older server), a rule left on after the switch was turned off, and a
  // failed read (403, 404, 503) all draw no tab. Only an approver asks.
  const mayApprove = can(session, 'invoice.approve')
  const rule = useApiRead<SalesApprovalRuleDto>(
    mayApprove ? SALES_APPROVAL_RULE_PATH : null,
    loadSalesApprovalRule,
  )
  const ruleSettled = !mayApprove || rule.read.status !== 'loading'
  const offersQueue = mayApprove && rule.read.status === 'ready' && salesApprovalIsOn(rule.read.data)
  // An address naming the queue opens on All when it is not offered; while the rule is still being
  // read the list waits rather than loading All and then switching.
  const tab: TabId = asked === 'toApprove' && ruleSettled && !offersQueue ? 'all' : asked
  const type: InvoiceTypeDto | null = isInvoiceType(params.get('type'))
    ? (params.get('type') as InvoiceTypeDto)
    : null
  const period: PeriodId = isPeriod(params.get('period'))
    ? (params.get('period') as PeriodId)
    : DEFAULT_PERIOD
  const channel: ChannelId = isChannel(params.get('channel'))
    ? (params.get('channel') as ChannelId)
    : 'all'
  const sortKey: InvoiceSortKey = isInvoiceSort(params.get('sort'))
    ? (params.get('sort') as InvoiceSortKey)
    : 'updated'
  const query = params.get('q') ?? ''
  const sizeParam = Number(params.get('size'))
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // From the params as they are when it runs, not as they were when a delayed search was armed,
  // so a tab chosen during the pause is not put back.
  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const [typed, setTyped] = useState(query)
  useEffect(() => setTyped(query), [query])
  useEffect(() => {
    if (typed === query) return
    const timer = window.setTimeout(
      () => update({ q: typed.trim() || null, page: null }),
      SEARCH_DELAY_MS,
    )
    return () => window.clearTimeout(timer)
    // Armed by typing only: `update` is a new function each render, and depending on it would
    // restart the pause on every render. It reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const summary = useApiRead<InvoiceSummaryDto>(INVOICE_SUMMARY_PATH, loadInvoiceSummary)
  const salesSummary = useApiRead<InvoiceSummaryDto>(SALES_SUMMARY_PATH, () =>
    apiRequest<InvoiceSummaryDto>(SALES_SUMMARY_PATH),
  )
  // The period counts back from the server's day, so the list waits for the summary to know it.
  const channelFilter = channel === 'all' ? null : channel === 'peppol' ? 'PEPPOL' : 'EMAIL'
  const filter: InvoiceListFilter | null =
    summary.read.status === 'ready' && (asked !== 'toApprove' || ruleSettled)
      ? {
          ...(tab === 'toApprove'
            ? {
                state: 'DRAFT',
                approval: 'PENDING' as const,
                payment: null,
                type: type ?? SALES_TYPES,
                ...periodRange(period, summary.read.data.asOf),
                search: query,
              }
            : tab === 'toSend'
            ? {
                state: 'ISSUED',
                delivery: 'TO_SEND' as const,
                payment: null,
                type: type ?? SALES_TYPES,
                ...periodRange(period, summary.read.data.asOf),
                search: query,
              }
            : {
                ...listFilter(tab, type, period, summary.read.data.asOf, query),
                ...(type === null ? { type: SALES_TYPES } : {}),
              }),
          channel: channelFilter,
        }
      : null
  const listPath = filter
    ? invoiceListPath({
        ...filter,
        sort: INVOICE_SORTS.find((option) => option.value === sortKey)?.sort ?? 'UPDATED',
        page: pageNumber - 1,
        size,
      })
    : null
  const list = useApiRead<Page<InvoiceRowDto>>(listPath, () => loadInvoicePage(listPath!))
  // The design names the issuing branch under the customer; the row carries only its id.
  const branches = useApiRead<BranchDto[]>('/v1/branches', loadBranches)
  const { label: branchLabel } = useBranchName()
  const branchNames = useMemo(() => {
    const names = new Map<string, string>()
    if (branches.read.status === 'ready') {
      for (const branch of branches.read.data) names.set(branch.id, branchLabel(branch))
    }
    return names
  }, [branches.read, branchLabel])

  const [notice, setNotice] = useState<{ body: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  // Bulk upload needs a plan that includes it (PL-8).
  const bulkUploadIncluded = usePlanIncludes('bulkUpload')
  const onExport = async () => {
    if (!filter) return
    setExporting(true)
    setNotice(null)
    try {
      const file = await exportInvoices(filter)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? 'fawtir-invoices.csv'
      link.click()
      URL.revokeObjectURL(url)
      if (file.truncated) setNotice({ body: t('invoicesPage.exportTruncated') })
    } catch (error) {
      setNotice({ body: failureText(t, error) })
    } finally {
      setExporting(false)
    }
  }

  const [discarding, setDiscarding] = useState<InvoiceListItem | null>(null)
  const onDiscard = async () => {
    if (!discarding) return
    const target = discarding
    setDiscarding(null)
    try {
      await discardDraft(target.id, target.version)
      summary.retry()
      salesSummary.retry()
      list.retry()
    } catch (error) {
      setNotice({
        body:
          error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION'
            ? t('invoicesPage.discardStale')
            : failureText(t, error),
      })
      list.retry()
    }
  }

  // The design's row "Delete" on an issued document is the API's cancel, which needs a reason.
  const [cancelling, setCancelling] = useState<InvoiceListItem | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const closeCancel = () => {
    setCancelling(null)
    setReason('')
  }
  const onCancel = async () => {
    if (!cancelling || reason.trim() === '') return
    setBusy(true)
    try {
      await cancelInvoice(cancelling.id, cancelling.version, reason.trim())
      closeCancel()
      summary.retry()
      salesSummary.retry()
      list.retry()
    } catch (error) {
      setNotice({ body: failureText(t, error) })
      closeCancel()
      list.retry()
    } finally {
      setBusy(false)
    }
  }

  const [sendingRow, setSendingRow] = useState<InvoiceListItem | null>(null)
  const onSent = (result: InvoiceSendResultDto) => {
    setSendingRow(null)
    const note = sendResultNote(result)
    setNotice({ body: t(note.key, note.values) })
    list.retry()
  }

  const count = (value: number) => formatCount(value, language)

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('invoicesPage.title')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('invoicesPage.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {can(session, 'invoice.draft') && mayDraft && bulkUploadIncluded ? (
          // The design's button opens the invoice import (drafts only); its routes are TODO(backend).
          // Read-only makes no new drafts (ST-2, CA-3), so neither this nor Create invoice shows.
          <button type="button" onClick={() => setImporting(true)} className={OUTLINE_BUTTON}>
            <img src={bulkUploadIcon} alt="" className="size-6" />
            {t('invoicesPage.bulkUpload')}
          </button>
        ) : null}
        {can(session, 'invoice.export') ? (
          <button
            type="button"
            onClick={onExport}
            disabled={exporting || !filter}
            className={OUTLINE_BUTTON}
          >
            <img src={exportIcon} alt="" className="size-6 rotate-180" />
            {exporting ? t('invoicesPage.exporting') : t('invoicesPage.export')}
          </button>
        ) : null}
        {can(session, 'invoice.draft') && mayDraft ? (
          <Link
            to="/invoices/new"
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('invoicesPage.createInvoice')}
          </Link>
        ) : null}
      </div>
      <InvoiceImportModal
        open={importing}
        onClose={() => setImporting(false)}
        onCreated={() => {
          summary.retry()
          salesSummary.retry()
          list.retry()
        }}
      />
    </div>
  )

  if (summary.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {header}
        {summary.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={summary.read.error} retry={summary.retry} />
        )}
      </div>
    )
  }

  // Counts and cards are the sales figures; the unfiltered summary only stands in until they load.
  const totals = salesSummary.read.status === 'ready' ? salesSummary.read.data : summary.read.data
  const page = list.read.status === 'ready' ? list.read.data : null

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      {header}
      {notice ? (
        <Notice
          body={notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      <InvoiceKpiCards totals={totals} />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-[52px] gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-6">
          {TABS.filter((entry) => entry.id !== 'toApprove' || offersQueue).map((entry) => {
            const active = entry.id === tab
            // The owner asked for 0 rather than an empty badge when the summary is unavailable.
            const tally =
              entry.id === 'toSend'
                ? (totals.toSend ?? 0)
                : entry.id === 'toApprove'
                  ? (totals.awaitingApproval ?? 0)
                  : tabCount(totals, entry.id)
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                {tally !== null ? (
                  <span
                    className={[
                      'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      entry.danger && tally > 0
                        ? 'bg-danger-100 text-danger-700'
                        : active
                          ? 'bg-primary-25 text-primary-800'
                          : 'bg-primary-25 text-text-quaternary',
                    ].join(' ')}
                  >
                    {count(tally)}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 max-md:w-full max-md:flex-none">
            <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t('invoicesPage.searchPlaceholder')}
                aria-label={t('invoicesPage.searchPlaceholder')}
                maxLength={200}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <FilterMenu
              label={t('invoicesPage.filters.period.all')}
              value={period}
              defaultValue={DEFAULT_PERIOD}
              onChange={(value) =>
                update({ period: value === DEFAULT_PERIOD ? null : value, page: null })
              }
              options={PERIODS.map((option) => ({ value: option.id, label: t(option.labelKey) }))}
            />
            <FilterMenu
              label={t('invoicesPage.filters.docTypeLabel')}
              value={type ?? 'all'}
              defaultValue="all"
              onChange={(value) => update({ type: value === 'all' ? null : value, page: null })}
              options={[
                { value: 'all', label: t('invoicesPage.filters.docType.all') },
                ...INVOICE_TYPES.map((value) => ({
                  value,
                  label: t(`invoicesPage.docType.${value}`),
                })),
              ]}
            />
            <FilterMenu
              label={t('invoicesPage.filters.channel')}
              value={channel}
              defaultValue="all"
              onChange={(value) => update({ channel: value === 'all' ? null : value, page: null })}
              options={CHANNELS.map((value) => ({
                value,
                label: t(`invoicesPage.filters.chan.${value}`),
              }))}
            />
          </div>
          <SortMenu
            value={sortKey}
            onChange={(value) => update({ sort: value === 'updated' ? null : value, page: null })}
          />
        </div>

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <InvoiceTable
            page={page}
            branchNames={branchNames}
            nothingYet={totals.all === 0 && query === '' && type === null}
            emptyKey={tab === 'toApprove' ? 'invoicesPage.nothingToApprove' : null}
            onDiscard={setDiscarding}
            onCancel={setCancelling}
            onSend={setSendingRow}
            onUnavailable={(key) => setNotice({ body: t(key) })}
          />
        )}

        {sendingRow ? (
          <SendInvoiceModal
            invoiceId={sendingRow.id}
            invoiceNumber={sendingRow.number}
            onClose={() => setSendingRow(null)}
            onSent={onSent}
          />
        ) : null}

        {page && page.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <span id="invoices-page-size" className="text-sm font-medium text-text-muted">
                {t('invoicesPage.showResult')}
              </span>
              <PageSizeMenu
                value={size}
                onChange={(next) =>
                  update({ size: next === DEFAULT_PAGE_SIZE ? null : String(next), page: null })
                }
              />
            </div>
            {pageCountOf(page) > 1 ? (
              <PageNumbers
                current={pageNumber}
                pageCount={pageCountOf(page)}
                onChange={(next) => update({ page: next === 1 ? null : String(next) })}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <Modal
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        title={t('invoiceDraft.discardTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDiscarding(null)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white"
            >
              {t('invoiceDraft.discardConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('invoiceDraft.discardBody')}
        </p>
      </Modal>

      <Modal
        open={cancelling !== null}
        onClose={closeCancel}
        title={t('invoiceDetails.cancel.title')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeCancel}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy || reason.trim() === ''}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t('invoiceDetails.cancel.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('invoiceDetails.cancel.body')}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('invoiceDetails.cancel.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>
    </div>
  )
}

function failureText(t: Translate, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function InvoiceKpiCards({ totals }: { totals: InvoiceSummaryDto }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const count = (value: number) => formatCount(value, language)
  const money = (value: number) => formatAmount(value, totals.currencyCode, language)
  const oldest = totals.oldestOverdueDueDate
    ? daysBetween(totals.oldestOverdueDueDate, totals.asOf)
    : null
  const cards = [
    {
      id: 'outstanding',
      icon: outstandingIcon,
      titleKey: 'invoicesPage.kpi.outstanding',
      figure: money(totals.outstandingTotal),
      meta: t('invoicesPage.kpi.outstandingLive', {
        count: totals.outstandingInvoices,
        invoices: count(totals.outstandingInvoices),
      }),
    },
    {
      id: 'paid',
      icon: paidIcon,
      titleKey: 'invoicesPage.kpi.paid',
      figure: money(totals.paidTotal),
      meta: t('invoicesPage.kpi.paidLive', {
        count: totals.paidInvoices,
        invoices: count(totals.paidInvoices),
      }),
    },
    {
      id: 'awaiting',
      icon: awaitingIcon,
      titleKey: 'invoicesPage.kpi.awaiting',
      figure: money(totals.awaitingTotal),
      meta: t('invoicesPage.kpi.awaitingLive', {
        count: totals.dueSoonInvoices,
        invoices: count(totals.dueSoonInvoices),
        days: count(totals.dueSoonDays),
      }),
    },
    {
      id: 'overdue',
      icon: overdueIcon,
      titleKey: 'invoicesPage.kpi.overdue',
      figure: money(totals.overdueTotal),
      meta:
        oldest === null
          ? t('invoicesPage.kpi.overdueNone')
          : t('invoicesPage.kpi.overdueLive', {
              count: totals.overdueInvoices,
              invoices: count(totals.overdueInvoices),
              days: count(oldest),
            }),
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={kpi.icon} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
            <span className="sr-only">{totals.currencyCode}</span>
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
              {kpi.figure}
            </p>
          </div>
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{kpi.meta}</p>
        </article>
      ))}
    </div>
  )
}

function SortMenu({
  value,
  onChange,
}: {
  value: InvoiceSortKey
  onChange: (value: InvoiceSortKey) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const active = value !== 'updated'
  return (
    <div>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border px-3 text-sm font-semibold transition-colors',
          active
            ? 'border-primary-700 bg-primary-25 text-primary-800'
            : 'border-border-subtle bg-surface-tab-bar text-text-tertiary',
        ].join(' ')}
      >
        <img src={sortIcon} alt="" className="size-6" />
        {active
          ? t(
              INVOICE_SORTS.find((option) => option.value === value)?.labelKey ??
                'invoicesPage.filters.sort',
            )
          : t('invoicesPage.filters.sort')}
      </button>
      <Popover
        open={open}
        anchorRef={anchor}
        onClose={() => setOpen(false)}
        width={220}
        align="end"
      >
        <ul role="listbox" className="py-1">
          {INVOICE_SORTS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={[
                  'w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                  option.value === value
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-secondary',
                ].join(' ')}
              >
                {t(option.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  )
}

/** The design's 55px "Show result" number box, a listbox rather than a native select. */
function PageSizeMenu({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('invoicesPage.showResult')}
        className="inline-flex h-9 w-[55px] items-center justify-between rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
      >
        {formatCount(value, i18n.language)}
        <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={96}>
        <ul role="listbox" className="py-1">
          {PAGE_SIZES.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                aria-selected={option === value}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={[
                  'w-full px-3 py-2 text-start text-sm transition-colors hover:bg-primary-25',
                  option === value
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-secondary',
                ].join(' ')}
              >
                {formatCount(option, i18n.language)}
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  )
}

function InvoiceTable({
  page,
  branchNames,
  nothingYet,
  emptyKey,
  onDiscard,
  onCancel,
  onSend,
  onUnavailable,
}: {
  page: Page<InvoiceRowDto> | null
  branchNames: Map<string, string>
  nothingYet: boolean
  /** The tab's own empty sentence, where it has one. */
  emptyKey: string | null
  onDiscard: (item: InvoiceListItem) => void
  onCancel: (item: InvoiceListItem) => void
  onSend: (item: InvoiceListItem) => void
  /** An action the design offers and the API cannot yet do; the key names the sentence. */
  onUnavailable: (key: string) => void
}) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const rows = useMemo(() => (page ? page.items.map(toInvoiceListItem) : []), [page])
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))
  // While read-only (ST-2, CA-3) nothing is sent and no new draft or note is started from a row;
  // a draft made before still opens and can be discarded.
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  const maySend = useSubscriptionAllows('SEND_DOCUMENTS')
  const canDraft = can(session, 'invoice.draft')
  const canSend = can(session, 'invoice.issue') && maySend
  // Making a periodic series from an invoice needs a plan with periodic invoices (PL-8).
  const periodicIncluded = usePlanIncludes('recurringInvoices')

  /**
   * The design's row menu (Figma "Actions" 154:173140): view, send, duplicate, credit note,
   * periodic, delete. Send is offered on an issued document to a reader who may issue; the row
   * does not carry where its dispatch stands, so the server answers an already-sent one. Duplicate
   * opens the composer filled from an invoice, saved only when the reader saves; the notes and
   * self-billed documents have their own composers, so for them it still says it is unavailable.
   * Delete is a draft's discard, or an issued document's cancel with a reason.
   */
  const menuFor = (row: InvoiceListItem): ActionMenuItem[] => {
    const issuedInvoice = row.authoring === 'issued' && row.type === 'INVOICE'
    const items: ActionMenuItem[] = [
      {
        id: 'view',
        labelKey: 'rowActions.invoice.view',
        icon: viewIcon,
        to: `/invoices/${row.id}`,
      },
      ...(canSend && row.authoring === 'issued'
        ? [
            {
              id: 'send',
              labelKey: 'rowActions.invoice.send',
              icon: sendIcon,
              onSelect: () => onSend(row),
            },
          ]
        : []),
      // Duplicate starts a new draft: not offered while read-only.
      ...(!mayDraft
        ? []
        : row.type === 'INVOICE' && canDraft
          ? [
              {
                id: 'duplicate',
                labelKey: 'rowActions.invoice.duplicate',
                icon: duplicateIcon,
                to: `/invoices/new?duplicate=${row.id}`,
              },
            ]
          : [
              {
                id: 'duplicate',
                labelKey: 'rowActions.invoice.duplicate',
                icon: duplicateIcon,
                onSelect: () => onUnavailable('invoicesPage.duplicateUnavailable'),
              },
            ]),
    ]
    if (issuedInvoice && mayDraft && can(session, 'creditnote.create')) {
      items.push({
        id: 'creditNote',
        labelKey: 'rowActions.invoice.creditNote',
        icon: creditNoteIcon,
        to: `/income/credit-notes/new?invoice=${row.id}`,
      })
    }
    if (issuedInvoice && mayDraft && can(session, 'invoice.draft') && periodicIncluded) {
      // The periodic composer reads the template from `?template=` (PeriodicInvoicePage).
      items.push({
        id: 'periodic',
        labelKey: 'rowActions.invoice.periodic',
        icon: periodicIcon,
        to: `/income/periodic/new?template=${row.id}`,
      })
    }
    if (row.isDraft && canDraft) {
      items.push({
        id: 'delete',
        labelKey: 'rowActions.delete',
        icon: deleteIcon,
        danger: true,
        onSelect: () => onDiscard(row),
      })
    } else if (row.authoring === 'issued' && can(session, 'invoice.cancel')) {
      items.push({
        id: 'delete',
        labelKey: 'rowActions.delete',
        icon: deleteIcon,
        danger: true,
        onSelect: () => onCancel(row),
      })
    }
    return items
  }

  const message = (key: string) => (
    <tr>
      <td colSpan={9} className="py-12 text-center text-sm font-medium text-text-quaternary">
        {t(key)}
      </td>
    </tr>
  )

  return (
    <RowsView>
      <table className="w-full min-w-[1040px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="w-10 px-5 py-2.5">
              <TableCheckbox
                checked={allOnPageSelected}
                indeterminate={someOnPageSelected}
                disabled={rows.length === 0}
                onChange={() =>
                  setSelected((current) =>
                    allOnPageSelected
                      ? current.filter((id) => !rows.some((row) => row.id === id))
                      : [...new Set([...current, ...rows.map((row) => row.id)])],
                  )
                }
                ariaLabel={t('invoicesPage.selectAll')}
              />
            </th>
            {(
              ['invoice', 'customer', 'issued', 'due', 'amount', 'status', 'peppolOta'] as const
            ).map((key) => (
              <th key={key} className="px-2 py-2.5 text-start font-semibold">
                {t(`invoicesPage.col.${key}`)}
              </th>
            ))}
            <th className="w-12 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {page === null ? (
            <tr>
              <td
                colSpan={9}
                role="status"
                className="py-12 text-center text-sm font-medium text-text-quaternary"
              >
                {t('appAccess.loading')}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            message(emptyKey ?? (nothingYet ? 'invoicesPage.nothingYet' : 'invoicesPage.noResults'))
          ) : (
            rows.map((row) => {
              const editable = row.isDraft && canDraft
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                  onClick={() =>
                    navigate(editable ? `/invoices/${row.id}/edit` : `/invoices/${row.id}`)
                  }
                >
                  <td className="px-5 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <TableCheckbox
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                      ariaLabel={t('invoicesPage.selectRow', {
                        id: row.number ?? t('invoicesPage.draftNumber'),
                      })}
                    />
                  </td>
                  <InvoiceRowCells
                    row={row}
                    branch={row.branchId ? branchNames.get(row.branchId) : undefined}
                  />
                  <td className="px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <ActionMenu items={menuFor(row)} label={t('invoicesPage.rowMenu')} floating />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </RowsView>
  )
}

function StatusChip({ chip, label, title }: { chip: Chip; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium leading-[1.5]',
        chip.bg,
        chip.text,
      ].join(' ')}
    >
      <span className={['size-1.5 shrink-0 rounded-full', chip.dot].join(' ')} />
      {label}
    </span>
  )
}

function InvoiceRowCells({ row, branch }: { row: InvoiceListItem; branch: string | undefined }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  // Under the customer the design names the issuing branch, else the subject or PO, else that a
  // draft has not been issued.
  const subline = branch ?? row.subtitle ?? (row.isDraft ? t('invoicesPage.notIssuedYet') : null)
  // One pill, as the design draws it: what is owed once issued, the authoring state otherwise.
  // An overdue pill says "Overdue"; how late it is sits in the tooltip.
  const status =
    row.payment && row.authoring === 'issued'
      ? {
          chip: PAYMENT_STYLES[row.payment],
          label: t(`invoicesPage.payment.${row.payment}`),
          title:
            row.payment === 'overdue'
              ? t('invoicesPage.payment.overdueDays', { count: row.paymentValues?.count ?? 0 })
              : undefined,
        }
      : row.approval
        ? {
            chip: APPROVAL_STYLES[row.approval],
            label: t(`salesApproval.status.${row.approval}`),
            title: undefined,
          }
        : {
            chip: AUTHORING_STYLES[row.authoring],
            label: t(`invoicesPage.authoring.${row.authoring}`),
            title: undefined,
          }
  // TODO(backend): no Peppol response is answered yet (list.ts `peppolResponse`); a manual send
  // is the one delivery fact recorded, and an undelivered document leaves the column blank.
  const delivery = row.peppolResponse
    ? {
        chip: DELIVERY_STYLES[row.peppolResponse],
        label: row.peppolResponse,
        title: t(DELIVERY_HINTS[row.peppolResponse]),
      }
    : row.sentManually
      ? {
          chip: DELIVERY_STYLES.sentManually,
          label: t('invoicesPage.delivery.sentManually'),
          title: undefined,
        }
      : null
  return (
    <>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold text-text-quaternary">
          {row.number ?? t('invoicesPage.draftNumber')}
        </p>
        {row.type !== 'INVOICE' ? (
          <span className="mt-0.5 inline-flex items-center rounded-sm bg-neutral-25 px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {t(`invoicesPage.docType.${row.type}`)}
          </span>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {row.customer ?? '—'}
        </p>
        {subline ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">{subline}</p>
        ) : null}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium whitespace-nowrap text-text-tertiary">
        {row.issueDate ? formatDate(row.issueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium whitespace-nowrap text-text-tertiary">
        {row.dueDate ? formatDate(row.dueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5">
        {row.amount !== null ? (
          <span
            className="inline-flex items-center gap-1"
            title={row.estimated ? t('invoicesPage.amountNote.estimate') : undefined}
          >
            <RialMark className="w-6 shrink-0 text-text-secondary" />
            <span className="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums">
              {formatAmount(row.amount, row.currency, language)}
            </span>
          </span>
        ) : (
          <span className="text-base font-medium text-text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <StatusChip chip={status.chip} label={status.label} title={status.title} />
      </td>
      <td className="px-2 py-2.5">
        {delivery ? (
          <StatusChip chip={delivery.chip} label={delivery.label} title={delivery.title} />
        ) : (
          <span className="text-sm font-medium text-text-muted">—</span>
        )}
      </td>
    </>
  )
}

/** The design's pager: first, last, and the neighbours of the current page, with gaps elided. */
function PageNumbers({
  current,
  pageCount,
  onChange,
}: {
  current: number
  pageCount: number
  onChange: (page: number) => void
}) {
  const { t, i18n } = useTranslation()
  const numbers = useMemo<(number | string)[]>(() => {
    if (pageCount <= 6) return Array.from({ length: pageCount }, (_, i) => i + 1)
    const near = [current - 1, current, current + 1].filter((n) => n > 1 && n < pageCount)
    return [
      1,
      ...(near[0] > 2 ? ['…'] : []),
      ...near,
      ...(near.at(-1)! < pageCount - 1 ? ['…'] : []),
      pageCount,
    ]
  }, [pageCount, current])

  return (
    <nav aria-label={t('invoicesPage.pages')} className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={t('invoicesPage.prevPage')}
      >
        <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
      </button>
      {numbers.map((n, index) =>
        typeof n === 'string' ? (
          <span
            key={`gap-${index}`}
            className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === current ? 'page' : undefined}
            className={[
              'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
              n === current
                ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
            ].join(' ')}
          >
            {formatCount(n, i18n.language)}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, current + 1))}
        disabled={current >= pageCount}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={t('invoicesPage.nextPage')}
      >
        <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
      </button>
    </nav>
  )
}

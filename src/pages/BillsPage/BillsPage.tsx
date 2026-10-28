import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  Modal,
  Popover,
  RialMark,
  RowsView,
  SortMenu,
  TableCheckbox,
  withRial,
  type ActionMenuItem,
} from '../../components/ui'
import { BillStatusChip } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, pageCountOf, type Page } from '../../api'
import {
  BILL_SUMMARY_PATH,
  approveBill,
  billListPath,
  billTabCountsPath,
  exportBills,
  holdBill,
  loadBillPage,
  loadBillSummary,
  loadBillTabCounts,
  nudgeBillApprover,
  rejectBill,
  releaseBill,
  type BillRowDto,
  type BillSummaryDto,
} from '../../api/expenditure/bills'
import {
  discardIntake,
  loadIntakes,
  unconfirmedIntakesPath,
  type IntakePageDto,
} from '../../api/expenditure/billIntake'
import {
  BILL_PAGE_SIZES,
  BILL_SORTS,
  BILL_SOURCES,
  BILL_TABS,
  DEFAULT_BILL_PAGE_SIZE,
  DEFAULT_BILL_TAB,
  billPageSizeOf,
  billTabCount,
  draftRowOf,
  draftRowPath,
  dueNoteOf,
  isBillSort,
  isBillSource,
  isBillTab,
  rowActionOf,
  toBillListItem,
  visibleBillTabs,
  type BillListItem,
  type BillRowAction,
  type BillSortKey,
  type BillSourceBadge,
  type BillTabId,
  type Note,
} from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  WAITING_COUNT_PATH,
  loadWaitingCount,
  type WaitingCountDto,
} from '../../api/expenditure/waitingDocuments'
import { formatAmount, formatCount, formatDate, formatInstantDay } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import kpiAttentionIcon from '../../assets/bills/kpi-attention.svg'
import kpiDueIcon from '../../assets/bills/kpi-due.svg'
import kpiPayableIcon from '../../assets/bills/kpi-payable.svg'
import kpiReadyIcon from '../../assets/bills/kpi-ready.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import scanIcon from '../../assets/bills/scan.svg'
import matchOkIcon from '../../assets/bills/match-ok.svg'
import matchWarnIcon from '../../assets/bills/match-warn.svg'
import actApproveIcon from '../../assets/bills/act-approve.svg'
import actEyeIcon from '../../assets/bills/act-eye.svg'
import actBellIcon from '../../assets/bills/act-bell.svg'
import actEditIcon from '../../assets/bills/act-edit.svg'
import actChevronIcon from '../../assets/bills/act-chevron.svg'
import filterIcon from '../../assets/bills/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import searchIcon from '../../assets/invoices/search.svg'
import exportIcon from '../../assets/invoices/export.svg'
import viewIcon from '../../assets/actions/view.svg'
import pauseIcon from '../../assets/actions/pause.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import releaseIcon from '../../assets/bill-detail/tick.svg'

/** Source badge: 4px radius, not a pill. The status chips are the pills. */
const SOURCE_STYLES: Record<BillSourceBadge, { bg: string; fg: string; labelKey: string }> = {
  peppol: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'billsPage.source.peppol' },
  uploaded: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', labelKey: 'billsPage.source.uploaded' },
  scanned: { bg: 'bg-pending-100', fg: 'text-pending-700', labelKey: 'billsPage.source.scanned' },
  // Not drawn in the design: the two sources without a supplier's document take the neutral badge.
  recurring: {
    bg: 'bg-surface-background',
    fg: 'text-text-tertiary',
    labelKey: 'billsPage.source.recurring',
  },
  selfBilled: {
    bg: 'bg-primary-50',
    fg: 'text-primary-800',
    labelKey: 'billsPage.source.selfBilled',
  },
}

/**
 * A supplier debit note's badges, after the source badge and in its style (owner, 8 Oct 2026):
 * what the document is, then the decision on it once one is taken.
 */
const DEBIT_NOTE_BADGES = {
  type: {
    bg: 'bg-surface-background',
    fg: 'text-text-tertiary',
    labelKey: 'billsPage.debitNote.type',
  },
  ACCEPTED: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    labelKey: 'billsPage.debitNote.accepted',
  },
  REFUSED: { bg: 'bg-danger-100', fg: 'text-danger-700', labelKey: 'billsPage.debitNote.refused' },
} as const

/**
 * The button under a row's status chip (Figma 163:21928). Only Approve is filled: it is the one
 * action that moves the bill on by itself. The rest open something, so they read as secondary.
 */
const ACTION_STYLES: Record<
  BillRowAction,
  { icon: string; labelKey: string; primary?: boolean; trailingIcon?: boolean }
> = {
  approve: { icon: actApproveIcon, labelKey: 'billsPage.actions.approve', primary: true },
  reviewDifference: { icon: actEyeIcon, labelKey: 'billsPage.actions.reviewDifference' },
  nudge: { icon: actBellIcon, labelKey: 'billsPage.actions.nudge' },
  checkAndSave: { icon: actEditIcon, labelKey: 'billsPage.actions.checkAndSave' },
  viewHold: { icon: actChevronIcon, labelKey: 'billsPage.actions.viewHold', trailingIcon: true },
  reviewDuplicate: { icon: actEyeIcon, labelKey: 'billsPage.actions.reviewDuplicate' },
}

/** Figma column widths, so the seven columns and the menu line up with the design at 1144. */
const COLUMNS = [
  { key: 'check', width: 45 },
  { key: 'supplier', width: 159 },
  { key: 'theirBill', width: 161 },
  { key: 'due', width: 160 },
  { key: 'match', width: 193 },
  { key: 'status', width: 202 },
  { key: 'amount', width: 154 },
  { key: 'menu', width: 44 },
] as const

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

/** The resolution window the filtered tabs read (`BillWorkflowService.RESOLUTION_WINDOW`). */
const RESOLUTION_WINDOW = 2000

/** Server refusals worth their own sentence; anything else reads through `describeApiFailure`. */
const REFUSALS: Record<string, string> = {
  APPROVAL_ALREADY_GIVEN: 'billDetail.refused.alreadyApproved',
  APPROVAL_TRANSITION_INVALID: 'billDetail.refused.changed',
  APPROVAL_REJECTION_REASON_REQUIRED: 'billDetail.refused.reasonRequired',
  // Rejecting a bill that has a payment, is in a run, or with a reason that is too long.
  APPROVAL_REJECT_PAYMENT_RECORDED: 'billDetail.refused.paymentRecorded',
  APPROVAL_REJECT_IN_PAYMENT_RUN: 'billDetail.refused.inRun',
  APPROVAL_REASON_TOO_LONG: 'billDetail.refused.reasonTooLong',
  BILL_HOLD_ALREADY_OPEN: 'billDetail.refused.changed',
  BILL_HOLD_NOT_OPEN: 'billDetail.refused.changed',
  BILL_HOLD_ON_PAID_REFUSED: 'billDetail.refused.paidCannotHold',
  BILL_HOLD_NOT_PAYABLE: 'billDetail.refused.notPayable',
  // A hold with no reason, or one that is too long.
  BILL_HOLD_REASON_REQUIRED: 'billDetail.refused.holdReasonRequired',
  BILL_HOLD_REASON_TOO_LONG: 'billDetail.refused.holdReasonTooLong',
}

/**
 * Why a nudge was refused, as its own sentence.
 */
const NUDGE_REFUSALS: Record<string, string> = {
  BILL_NUDGE_ALREADY_SENT: 'billsPage.nudge.alreadySent',
  BILL_APPROVAL_NOT_PENDING: 'billsPage.nudge.notPending',
  BILL_NUDGE_NO_APPROVER: 'billsPage.nudge.noApprover',
  BILL_NUDGE_DELIVERY_UNAVAILABLE: 'billsPage.nudge.unavailable',
}

/** The Invoices list's Export button, as it is drawn there. */
const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
const QUIET_BUTTON =
  'inline-flex h-[46px] items-center justify-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** A decision taken from a row: the bill it is about and the reason it needs. */
type Asking = { kind: 'reject' | 'hold'; billId: string; number: string }

export function BillsPage() {
  return (
    <AppShell>
      <BillsScreen />
    </AppShell>
  )
}

/**
 * Inside the shell, so its reads start only once the shell has confirmed a session. Tab, search,
 * source, sort, page size and page live in the URL, so a filtered list survives a reload.
 */
function BillsScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const tab: BillTabId = isBillTab(params.get('tab'))
    ? (params.get('tab') as BillTabId)
    : DEFAULT_BILL_TAB
  const sortKey: BillSortKey = isBillSort(params.get('sort'))
    ? (params.get('sort') as BillSortKey)
    : 'newest'
  const sourceKey: BillSourceBadge | 'all' = isBillSource(params.get('source'))
    ? (params.get('source') as BillSourceBadge)
    : 'all'
  const query = params.get('q') ?? ''
  const size = billPageSizeOf(params.get('size'))
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  // From the params as they are when it runs, so a tab chosen during a search pause is kept.
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
    // Armed by typing only; `update` reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const summary = useApiRead<BillSummaryDto>(BILL_SUMMARY_PATH, loadBillSummary)
  // What the list is showing, less its page: the export sends the same four.
  const showing = {
    filter: BILL_TABS.find((entry) => entry.id === tab)?.filter ?? 'NEEDS_ATTENTION',
    q: query,
    source: BILL_SOURCES.find((option) => option.id === sourceKey)?.source ?? null,
    sort: BILL_SORTS.find((option) => option.value === sortKey)?.sort ?? 'NEWEST',
  }
  const listPath = billListPath({ ...showing, page: pageNumber - 1, pageSize: size })
  // With a search or a source filter on, the tab badges are counted over the same bills as the
  // rows (owner decision 2026-10-01). A read of its own, so the cards above, which describe the
  // whole ledger, stay on screen while the counts follow the typing.
  const countsPath = billTabCountsPath(showing)
  const counts = useApiRead<BillSummaryDto>(countsPath, () => loadBillTabCounts(countsPath!))
  // The badges keep their last figures while the next ones load, rather than flashing the
  // whole ledger's between two searches.
  const lastTabs = useRef<BillSummaryDto['tabs'] | null>(null)
  const list = useApiRead<Page<BillRowDto>>(listPath, () => loadBillPage(listPath))

  // The uploads and receipts nobody has confirmed, drawn as the design's draft rows at the top
  // of the first page of Needs attention and All. The API lists them apart from the bills.
  const known = summary.read.status === 'ready' ? summary.read.data : null
  // A draft is an upload or a receipt, and the source filter shows or hides it as it does a
  // bill: "Uploaded" keeps the uploads, "Scanned" the receipts, any other source neither. The
  // server narrows the read, so the twenty it answers are twenty of the kind asked for.
  const draftSource =
    showing.source === 'UPLOADED' || showing.source === 'SCANNED' ? showing.source : null
  const showDrafts =
    (tab === 'needsAttention' || tab === 'all') &&
    pageNumber === 1 &&
    query === '' &&
    (showing.source === null || draftSource !== null) &&
    (known?.needsAttention.draft ?? 0) > 0
  const intakesPath = showDrafts ? unconfirmedIntakesPath(0, 20, draftSource) : null
  const intakes = useApiRead<IntakePageDto>(intakesPath, () => loadIntakes(intakesPath!))

  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [reason, setReason] = useState('')

  const refresh = () => {
    summary.retry()
    if (countsPath) counts.retry()
    list.retry()
    if (intakesPath) intakes.retry()
  }

  const act = async (billId: string, run: () => Promise<unknown>) => {
    setNotice(null)
    setBusy(billId)
    try {
      await run()
      refresh()
      return true
    } catch (error) {
      setNotice(refusalText(t, error))
      return false
    } finally {
      setBusy(null)
    }
  }

  // A nudge changes nothing the list shows, so there is nothing to read again after it.
  const nudge = async (billId: string) => {
    setNotice(null)
    setBusy(billId)
    try {
      await nudgeBillApprover(billId)
      setNotice(t('billsPage.nudge.sent'))
    } catch (error) {
      const refusal = error instanceof ApiError && error.code ? NUDGE_REFUSALS[error.code] : null
      setNotice(refusal ? t(refusal) : refusalText(t, error))
    } finally {
      setBusy(null)
    }
  }

  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    setExporting(true)
    setNotice(null)
    try {
      const file = await exportBills(showing)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? 'fawtir-bills.csv'
      link.click()
      URL.revokeObjectURL(url)
      if (file.truncated) setNotice(t('billsPage.exportTruncated'))
    } catch (error) {
      setNotice(refusalText(t, error))
    } finally {
      setExporting(false)
    }
  }

  const confirmReason = async () => {
    const text = reason.trim()
    if (!asking || text === '') return
    const ok = await act(asking.billId, () =>
      asking.kind === 'reject' ? rejectBill(asking.billId, text) : holdBill(asking.billId, text),
    )
    if (ok) {
      setAsking(null)
      setReason('')
    }
  }

  const count = (value: number) => formatCount(value, language)
  const canCapture = can(session, 'invoice.payment.manage')
  const canApprove = can(session, 'invoice.approve')

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('billsPage.title')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('billsPage.subtitle')}
        </p>
      </div>
      {canCapture ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/expenditure/bills/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            {t('billsPage.uploadBill')}
          </Link>
          <Link
            to="/expenditure/bills/scan"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={scanIcon} alt="" className="size-6" />
            {t('billsPage.scanReceipt')}
          </Link>
        </div>
      ) : null}
    </div>
  )

  if (summary.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {header}
        <WaitingDocumentsBanner />
        {summary.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={summary.read.error} retry={summary.retry} />
        )}
      </div>
    )
  }

  const totals = summary.read.data
  const page = list.read.status === 'ready' ? list.read.data : null
  const unconfirmed = showDrafts && intakes.read.status === 'ready' ? intakes.read.data.items : []
  // Checked again here by each row's own source: a server that does not know the `source`
  // parameter answers uploads and receipts alike.
  const drafts =
    draftSource === null
      ? unconfirmed
      : unconfirmed.filter((intake) => intake.source === draftSource)
  // The whole ledger's counts with no filter on, and when the filtered read fails.
  const tabs =
    countsPath === null || counts.read.status === 'failed'
      ? totals.tabs
      : counts.read.status === 'ready'
        ? counts.read.data.tabs
        : (lastTabs.current ?? totals.tabs)
  lastTabs.current = countsPath === null ? null : tabs
  const truncated = (page?.truncated ?? false) || (tab !== 'all' && tabs.truncated)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      <WaitingDocumentsBanner />
      <BillKpiCards
        totals={totals}
        canStartRun={canCapture}
        onReview={() => update({ tab: null, page: null })}
      />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {visibleBillTabs(tabs).map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  update({ tab: entry.id === DEFAULT_BILL_TAB ? null : entry.id, page: null })
                }
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span
                  className={[
                    'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    active
                      ? 'bg-primary-25 text-primary-800'
                      : 'bg-primary-25 text-text-quaternary',
                  ].join(' ')}
                >
                  {count(billTabCount(tabs, entry.id))}
                </span>
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('billsPage.searchPlaceholder')}
              aria-label={t('billsPage.searchPlaceholder')}
              maxLength={200}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          {/* Wraps, so a third button does not push a phone-width toolbar sideways. */}
          <div className="flex flex-wrap items-center gap-3">
            <FilterMenu
              label={t('billsPage.filters')}
              value={sourceKey}
              defaultValue="all"
              onChange={(value) => update({ source: value === 'all' ? null : value, page: null })}
              options={BILL_SOURCES.map((option) => ({
                value: option.id,
                label: t(option.labelKey),
              }))}
              icon={filterIcon}
            />
            <SortMenu
              value={sortKey}
              options={BILL_SORTS}
              label={t('billsPage.sort')}
              width={240}
              onChange={(value) => update({ sort: value === 'newest' ? null : value, page: null })}
            />
            {/* The frame (163:21928) draws no Export, so it sits with the list's filters, as the
                owner placed it: the Invoices list's button, for whoever may export. */}
            {can(session, 'invoice.export') ? (
              <button
                type="button"
                onClick={() => void onExport()}
                disabled={exporting}
                className={OUTLINE_BUTTON}
              >
                <img src={exportIcon} alt="" className="size-6 rotate-180" />
                {exporting ? t('billsPage.exporting') : t('billsPage.export')}
              </button>
            ) : null}
          </div>
        </div>

        {truncated ? (
          <div className="px-6 pb-3.5">
            <Notice body={t('billsPage.notice.truncated', { window: count(RESOLUTION_WINDOW) })} />
          </div>
        ) : null}
        {notice ? (
          <div className="px-6 pb-3.5">
            <Notice
              body={notice}
              action={{ label: t('common.close'), onClick: () => setNotice(null) }}
            />
          </div>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <BillTable
            page={page}
            drafts={drafts}
            canApprove={canApprove}
            canManage={canCapture}
            busy={busy}
            ledgerEmpty={totals.tabs.all === 0 && totals.needsAttention.draft === 0}
            onApprove={(id) => void act(id, () => approveBill(id))}
            onRelease={(id) => void act(id, () => releaseBill(id))}
            onAsk={(next) => {
              setReason('')
              setAsking(next)
            }}
            onDiscard={(intakeId) => void act(intakeId, () => discardIntake(intakeId))}
            onNudge={(id) => void nudge(id)}
          />
        )}

        {page && (page.items.length > 0 || drafts.length > 0) ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-text-muted">
                {t('billsPage.showResult')}
              </span>
              <PageSizeMenu
                value={size}
                onChange={(next) =>
                  update({
                    size: next === DEFAULT_BILL_PAGE_SIZE ? null : String(next),
                    page: null,
                  })
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
        open={asking !== null}
        onClose={() => {
          setAsking(null)
          setReason('')
        }}
        title={t(asking?.kind === 'hold' ? 'billDetail.hold.title' : 'billDetail.reject.title')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setAsking(null)
                setReason('')
              }}
              className={QUIET_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void confirmReason()}
              disabled={busy !== null || reason.trim() === ''}
              className={[
                PRIMARY_BUTTON,
                asking?.kind === 'reject' ? 'bg-danger-700 hover:bg-danger-700/90' : '',
              ].join(' ')}
            >
              {t(asking?.kind === 'hold' ? 'billDetail.hold.confirm' : 'billDetail.reject.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-semibold text-text-primary">{asking?.number}</p>
        <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
          {t(asking?.kind === 'hold' ? 'billDetail.hold.body' : 'billDetail.reject.body')}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('billDetail.reject.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={asking?.kind === 'hold' ? 500 : 1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>
    </div>
  )
}

function refusalText(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code && REFUSALS[error.code])
    // The run is the one value a sentence here names; the server sends it beside the code.
    return t(REFUSALS[error.code], { run: String(error.problem.paymentRunReference ?? '') })
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/**
 * The four cards of the frame, each with its figure, its line of context and, on two, a link.
 * `canStartRun` is read by the screen inside the shell and handed down: the link into a new
 * payment run is hidden from someone who cannot manage one, as it is on the Payments list.
 */
function BillKpiCards({
  totals,
  canStartRun,
  onReview,
}: {
  totals: BillSummaryDto
  canStartRun: boolean
  onReview: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const count = (value: number) => formatCount(value, language)
  const money = (value: number) => formatAmount(value, totals.currencyCode, language)
  const attention = totals.needsAttention
  const cards = [
    {
      id: 'attention',
      icon: kpiAttentionIcon,
      tint: 'bg-danger-100',
      titleKey: 'billsPage.kpi.attention',
      figure: count(attention.total),
      money: false,
      meta: [
        t('billsPage.kpi.attentionBreakdown', {
          fresh: count(attention.new),
          mismatch: count(attention.mismatch),
          awaiting: count(attention.awaitingApproval),
        }),
        attention.draft > 0 ? t('billsPage.kpi.attentionDrafts', { count: attention.draft }) : null,
      ]
        .filter(Boolean)
        .join(' · '),
      link:
        attention.total > 0
          ? { label: t('billsPage.kpi.attentionLink'), onClick: onReview, to: null }
          : null,
    },
    {
      id: 'due',
      icon: kpiDueIcon,
      tint: 'bg-primary-50',
      titleKey: 'billsPage.kpi.due',
      figure: money(totals.dueThisWeekTotal),
      money: true,
      // TODO(backend): the design adds "earliest 2 Aug"; the summary carries no earliest due date.
      meta: t('billsPage.kpi.dueBills', { count: totals.dueThisWeekCount }),
      link: null,
    },
    {
      id: 'payable',
      icon: kpiPayableIcon,
      tint: 'bg-pending-100',
      titleKey: 'billsPage.kpi.payable',
      figure: money(totals.openTotal),
      money: true,
      // Rejecting a bill does not cancel it: under VAT the liability stands until the supplier
      // issues a credit note. It leaves the payable figure above and is named here instead of
      // disappearing from the page altogether (decision 3, 2026-09-24).
      meta: [
        t('billsPage.kpi.payableBills', {
          open: count(totals.openCount),
          overdue: count(totals.overdueCount),
        }),
        totals.disputedCount > 0
          ? t('billsPage.kpi.payableDisputed', {
              // The code before the figure: the rial sign is drawn in its place.
              amount: `${totals.currencyCode} ${money(totals.disputedTotal)}`,
              count: totals.disputedCount,
            })
          : null,
        // Undecided debit notes are not owed until accepted, so they are outside the figure
        // above and named here (owner, 10 Oct 2026). The code goes before the amount for the
        // rial sign to stand in its place.
        (totals.debitNotesAwaitingDecisionCount ?? 0) > 0
          ? t('billsPage.kpi.payableAwaitingDecision', {
              amount: `${totals.currencyCode} ${money(totals.debitNotesAwaitingDecisionTotal ?? 0)}`,
              count: totals.debitNotesAwaitingDecisionCount,
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      link: null,
    },
    {
      id: 'ready',
      icon: kpiReadyIcon,
      tint: 'bg-success-100',
      titleKey: 'billsPage.kpi.ready',
      figure: money(totals.readyToPayTotal),
      money: true,
      meta: t('billsPage.kpi.readyBills', { count: totals.readyToPayCount }),
      link:
        canStartRun && totals.readyToPayCount > 0
          ? { label: t('billsPage.kpi.readyLink'), onClick: null, to: '/expenditure/payments/new' }
          : null,
    },
  ]

  const linkClass =
    'inline-flex w-fit items-center gap-0.5 text-base font-semibold leading-[1.2] text-primary-800 transition-colors hover:text-primary-900'

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((kpi) => (
          <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-2">
              <span
                className={[
                  'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                  kpi.tint,
                ].join(' ')}
              >
                <img src={kpi.icon} alt="" className="size-6" />
              </span>
              <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-text-secondary">
                {t(kpi.titleKey)}
              </h3>
            </div>
            <div className="flex items-center gap-1 text-text-secondary">
              {kpi.money ? <RialMark className="w-8 shrink-0" /> : null}
              <p className="text-[32px] font-semibold leading-[1.2] tabular-nums">{kpi.figure}</p>
            </div>
            <p className="text-sm font-medium leading-[1.4] text-text-tertiary">
              {withRial(kpi.meta)}
            </p>
            {kpi.link ? (
              kpi.link.to ? (
                <Link to={kpi.link.to} className={linkClass}>
                  {kpi.link.label}
                  <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
                </Link>
              ) : (
                <button type="button" onClick={kpi.link.onClick ?? undefined} className={linkClass}>
                  {kpi.link.label}
                  <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
                </button>
              )
            ) : null}
          </article>
        ))}
      </div>
      {totals.excludedFromTotals > 0 ? (
        <p className="text-xs font-medium text-text-tertiary">
          {t('billsPage.kpi.otherCurrencies', {
            count: totals.excludedFromTotals,
            currency: totals.currencyCode,
          })}
        </p>
      ) : null}
    </div>
  )
}

/** The design's "Show result" number box: a listbox rather than a native select. */
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
        aria-label={t('billsPage.showResult')}
        className="inline-flex h-9 min-w-[55px] items-center justify-between gap-2 rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
      >
        {formatCount(value, i18n.language)}
        <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={96}>
        <ul role="listbox" className="py-1">
          {BILL_PAGE_SIZES.map((option) => (
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

function NoteText({ note, currency }: { note: Note; currency: string }) {
  const { t, i18n } = useTranslation()
  const values = { ...note.values }
  if (typeof values.amount === 'number')
    values.amount = formatAmount(values.amount, currency, i18n.language)
  if (typeof values.date === 'string') values.date = formatInstantDay(values.date, i18n.language)
  return <>{t(note.key, values)}</>
}

/**
 * Supplier documents that arrived while the company may not open them (Business Rules AL-7): the
 * count, and the way to the list that names them. Nothing is drawn while nothing waits, while the
 * count is on its way, or when it cannot be read: the bills below do not depend on it.
 */
function WaitingDocumentsBanner() {
  const { t, i18n } = useTranslation()
  const waiting = useApiRead<WaitingCountDto>(WAITING_COUNT_PATH, loadWaitingCount)
  if (waiting.read.status !== 'ready' || waiting.read.data.total <= 0) return null
  const total = waiting.read.data.total
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-pending-100 px-4 py-3 text-pending-700"
    >
      <p className="min-w-0 flex-1 text-sm font-medium leading-[1.6] md:min-w-[320px]">
        <b className="font-semibold">
          {t('waitingDocuments.banner.title', {
            count: total,
            n: formatCount(total, i18n.language),
          })}
        </b>{' '}
        {t('waitingDocuments.banner.body')}
      </p>
      <Link
        to="/expenditure/bills/waiting"
        className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
      >
        {t('waitingDocuments.banner.open')}
      </Link>
    </div>
  )
}

function BillTable({
  page,
  drafts,
  canApprove,
  canManage,
  busy,
  ledgerEmpty,
  onApprove,
  onRelease,
  onAsk,
  onDiscard,
  onNudge,
}: {
  page: Page<BillRowDto> | null
  drafts: IntakePageDto['items']
  canApprove: boolean
  canManage: boolean
  busy: string | null
  ledgerEmpty: boolean
  onApprove: (billId: string) => void
  onRelease: (billId: string) => void
  onAsk: (asking: Asking) => void
  onDiscard: (intakeId: string) => void
  onNudge: (billId: string) => void
}) {
  const { t } = useTranslation()
  const rows = useMemo(
    () => [...drafts.map(draftRowOf), ...(page ? page.items.map(toBillListItem) : [])],
    [page, drafts],
  )
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))

  return (
    <RowsView>
      <table className="w-full min-w-[1080px] border-collapse text-start">
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.key} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="px-5 py-2.5">
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
                ariaLabel={t('billsPage.selectAll')}
              />
            </th>
            <th className="py-2.5 pe-2 text-start font-semibold">{t('billsPage.col.supplier')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.theirBill')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.due')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.matched')}</th>
            {/* Figma labels this column "Amount" as well, a copy slip: it holds the status and
                the action, and the amount is the column after it. */}
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.status')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.amount')}</th>
            <th className="px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {page === null ? (
            <tr>
              <td
                colSpan={8}
                role="status"
                className="py-12 text-center text-sm font-medium text-text-quaternary"
              >
                {t('appAccess.loading')}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-sm font-medium text-text-tertiary">
                {t(ledgerEmpty ? 'billsPage.emptyLedger' : 'billsPage.empty')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <BillTableRow
                key={row.id}
                row={row}
                selected={selected.includes(row.id)}
                onSelect={() =>
                  setSelected((current) =>
                    current.includes(row.id)
                      ? current.filter((id) => id !== row.id)
                      : [...current, row.id],
                  )
                }
                action={rowActionOf(row, { canApprove, canCapture: canManage })}
                canApprove={canApprove}
                canManage={canManage}
                busy={busy === row.id || (row.draft !== null && busy === row.draft.intakeId)}
                onApprove={() => onApprove(row.id)}
                onRelease={() => onRelease(row.id)}
                onAsk={(kind) => onAsk({ kind, billId: row.id, number: row.number ?? row.id })}
                onDiscard={() => row.draft && onDiscard(row.draft.intakeId)}
                onNudge={() => onNudge(row.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </RowsView>
  )
}

function BillTableRow({
  row,
  selected,
  onSelect,
  action,
  canApprove,
  canManage,
  busy,
  onApprove,
  onRelease,
  onAsk,
  onDiscard,
  onNudge,
}: {
  row: BillListItem
  selected: boolean
  onSelect: () => void
  action: BillRowAction | null
  canApprove: boolean
  canManage: boolean
  busy: boolean
  onApprove: () => void
  onRelease: () => void
  onAsk: (kind: 'reject' | 'hold') => void
  onDiscard: () => void
  onNudge: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const source = SOURCE_STYLES[row.source]
  const dueNote = dueNoteOf(row)
  const to = draftRowPath(row) ?? `/expenditure/bills/${row.id}`
  const scanned = row.source === 'scanned'
  const name = row.number
    ? scanned
      ? t('billsPage.rows.receipt', { number: row.number })
      : row.number
    : (row.draft?.filename ?? t('billsPage.rows.noNumber'))

  /**
   * The row menu. No frame draws it for bills (163:24153 is a payment run's), so it offers what
   * the row's state allows: the bill itself, and the decisions the detail page takes.
   */
  // A draft is finished and discarded with the capture permission; without it the row offers
  // neither, and its name is not a link to a page that would only say "no access".
  const menu: ActionMenuItem[] = row.draft
    ? [
        ...(canManage
          ? [
              { id: 'check', labelKey: 'billsPage.actions.checkAndSave', icon: actEditIcon, to },
              {
                id: 'discard',
                labelKey: 'billsPage.unconfirmed.discard',
                icon: deleteIcon,
                danger: true,
                onSelect: onDiscard,
              },
            ]
          : []),
      ]
    : [
        { id: 'view', labelKey: 'billsPage.rowMenu.view', icon: viewIcon, to },
        ...(canApprove && row.canApprove
          ? [
              {
                id: 'approve',
                labelKey: 'billsPage.actions.approve',
                icon: actApproveIcon,
                onSelect: onApprove,
              },
            ]
          : []),
        ...(canManage && row.status === 'onHold'
          ? [
              {
                id: 'release',
                labelKey: 'billDetail.decision.release',
                icon: releaseIcon,
                onSelect: onRelease,
              },
            ]
          : []),
        ...(canManage && row.owes && row.status !== 'onHold' && !row.duplicate && !row.paid
          ? [
              {
                id: 'hold',
                labelKey: 'billDetail.decision.putOnHold',
                icon: pauseIcon,
                onSelect: () => onAsk('hold'),
              },
            ]
          : []),
        ...(canApprove && row.owes && row.status !== 'rejected' && !row.paid
          ? [
              {
                id: 'reject',
                labelKey: 'billDetail.actions.reject',
                icon: deleteIcon,
                danger: true,
                onSelect: () => onAsk('reject'),
              },
            ]
          : []),
      ]

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60">
      <td className="px-5 py-2.5 align-middle">
        <TableCheckbox
          checked={selected}
          onChange={onSelect}
          ariaLabel={t('billsPage.selectRow', { id: row.number ?? row.id })}
        />
      </td>

      <td className="py-2.5 pe-2 align-middle">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {row.supplier ?? t('billDetail.supplierUnknown')}
        </p>
        {/* TODO(backend): the design adds "arrived 29 Jul" and "PDF · by Yusuf" beside the badge;
            the list row carries neither an arrival time nor an uploader. */}
        <span
          className={[
            'mt-1 inline-flex items-center rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase leading-[1.2]',
            source.bg,
            source.fg,
          ].join(' ')}
        >
          {t(source.labelKey)}
        </span>
        {row.debitNote
          ? [
              DEBIT_NOTE_BADGES.type,
              ...(row.debitNote.decision ? [DEBIT_NOTE_BADGES[row.debitNote.decision]] : []),
            ].map((badge) => (
              <span
                key={badge.labelKey}
                className={[
                  'ms-1 mt-1 inline-flex items-center rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase leading-[1.2]',
                  badge.bg,
                  badge.fg,
                ].join(' ')}
              >
                {t(badge.labelKey)}
              </span>
            ))
          : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        {row.draft && !canManage ? (
          <span className="text-sm font-semibold leading-[1.2] text-primary-900">{name}</span>
        ) : (
          <Link
            to={to}
            className="text-sm font-semibold leading-[1.2] text-primary-900 hover:underline"
          >
            {name}
          </Link>
        )}
        {row.draft ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            {t('billsPage.rows.read', { date: formatInstantDay(row.draft.uploadedAt, language) })}
          </p>
        ) : row.issueDate ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            {t('billsPage.rows.issued', { date: formatDate(row.issueDate, language) })}
          </p>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {row.paidOnTheSpot
            ? t('billsPage.rows.paidOnTheDay')
            : row.dueDate
              ? formatDate(row.dueDate, language)
              : t('billsPage.rows.noDueDate')}
        </p>
        {dueNote ? (
          <p
            className={[
              'mt-1 text-xs font-medium leading-[1.2]',
              dueNote.key === 'billsPage.rows.daysOverdue' ||
              dueNote.key === 'billsPage.rows.overdue'
                ? 'text-danger-700'
                : 'text-text-tertiary',
            ].join(' ')}
          >
            <NoteText note={dueNote} currency={row.currency} />
          </p>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        <div className="flex items-center gap-1.5">
          {row.match.verdict === 'none' ? (
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#e3e4ea]"
            >
              <span className="block h-[1.5px] w-2.5 rounded-full bg-text-quaternary" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={[
                'flex size-6 shrink-0 items-center justify-center rounded-full',
                row.match.verdict === 'ok' ? 'bg-success-100' : 'bg-pending-100',
              ].join(' ')}
            >
              <img
                src={row.match.verdict === 'ok' ? matchOkIcon : matchWarnIcon}
                alt=""
                className="size-[13px]"
              />
            </span>
          )}
          <span
            className={[
              'text-sm font-semibold leading-[1.2]',
              row.match.verdict === 'ok'
                ? 'text-[#3d5648]'
                : row.match.verdict === 'none'
                  ? 'text-[#494d56]'
                  : 'text-pending-700',
            ].join(' ')}
          >
            {row.match.verdict === 'none'
              ? t('billsPage.rows.noOrder')
              : (row.match.order ?? t('billsPage.rows.noOrder'))}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
          {row.match.verdict === 'none' ? (
            row.match.theirOrder ? (
              t('billsPage.rows.theyQuoted', { ref: row.match.theirOrder })
            ) : row.paidOnTheSpot || scanned ? (
              t('billsPage.rows.overTheCounter')
            ) : (
              t('billsPage.rows.noOrderNote')
            )
          ) : (
            <NoteText note={row.match.note} currency={row.currency} />
          )}
        </p>
      </td>

      <td className="px-2 py-2.5 align-middle">
        <BillStatusChip item={row} />
        {action ? (
          <div className="mt-2">
            <RowActionButton
              action={action}
              label={
                action === 'viewHold' ? (row.holdReason ?? t('billsPage.state.onHold')) : undefined
              }
              to={action === 'approve' || action === 'nudge' ? undefined : to}
              busy={busy}
              onClick={
                action === 'approve'
                  ? onApprove
                  : action === 'nudge'
                    ? onNudge
                    : undefined
              }
            />
          </div>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        {row.amount !== null ? (
          <div className="flex items-center gap-1 text-text-secondary">
            <RialMark className="w-5 shrink-0" />
            <p className="text-base font-semibold leading-[1.2] tabular-nums">
              {formatAmount(row.amount, row.currency, language)}
            </p>
          </div>
        ) : (
          <p className="text-base font-medium text-text-muted">{t('billsPage.rows.noAmount')}</p>
        )}
        {row.amountNote ? (
          <p
            className={[
              'mt-1 text-xs font-medium leading-[1.2]',
              // Money that is late is what a payables list exists to surface, so the note that
              // says what is still owed carries it. The word is in the due column beside it.
              row.overdue && row.amountNote.key === 'billsPage.rows.leftToPay'
                ? 'text-danger-700'
                : 'text-text-tertiary',
            ].join(' ')}
          >
            <NoteText note={row.amountNote} currency={row.currency} />
          </p>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        {menu.length > 0 ? (
          <ActionMenu items={menu} label={t('billsPage.rowMenuLabel')} floating />
        ) : null}
      </td>
    </tr>
  )
}

/** The action under the status chip: a filled Approve, or an outlined link into the bill. */
function RowActionButton({
  action,
  label,
  to,
  busy,
  onClick,
}: {
  action: BillRowAction
  /** Overrides the action's own label: a held bill shows its reason. */
  label?: string
  to?: string
  busy: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const style = ACTION_STYLES[action]
  const className = [
    'inline-flex h-[30px] max-w-[190px] items-center gap-1 rounded-sm px-2.5 text-xs font-semibold leading-[1.2] transition-colors',
    style.primary
      ? 'bg-primary-700 text-white hover:bg-primary-800 disabled:opacity-60'
      : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
  ].join(' ')
  const content = (
    <>
      {style.trailingIcon ? null : <img src={style.icon} alt="" className="size-4 shrink-0" />}
      <span className="truncate">
        {label ??
          (action === 'approve' && busy ? t('billsPage.actions.approving') : t(style.labelKey))}
      </span>
      {style.trailingIcon ? (
        <img src={style.icon} alt="" className="size-4 shrink-0 rtl:rotate-180" />
      ) : null}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={className} title={label}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={className}>
      {content}
    </button>
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
    <nav aria-label={t('billsPage.pages')} className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        aria-label={t('billsPage.prevPage')}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
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
        aria-label={t('billsPage.nextPage')}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
      >
        <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
      </button>
    </nav>
  )
}

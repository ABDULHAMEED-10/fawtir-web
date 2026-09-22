import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { FilterMenu, Popover, RowsView, TableCheckbox } from '../../components/ui'
import { BillStatusChip } from '../../components/bills'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import {
  BILL_SUMMARY_PATH,
  approveBill,
  billListPath,
  loadBillPage,
  loadBillSummary,
  type BillRowDto,
  type BillSummaryDto,
} from '../../api/expenditure/bills'
import {
  BILL_PAGE_SIZES,
  BILL_SORTS,
  BILL_SOURCES,
  BILL_TABS,
  DEFAULT_BILL_PAGE_SIZE,
  DEFAULT_BILL_TAB,
  billPageSizeOf,
  billTabCount,
  dueNoteOf,
  isBillSort,
  isBillSource,
  isBillTab,
  toBillListItem,
  type BillListItem,
  type BillSortKey,
  type BillSourceBadge,
  type BillTabId,
  type Note,
} from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
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
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import searchIcon from '../../assets/invoices/search.svg'

/** Source badge: 4px radius, not a pill — the status chips are the pills. */
const SOURCE_STYLES: Record<BillSourceBadge, { bg: string; fg: string; labelKey: string }> = {
  peppol: { bg: 'bg-success-100', fg: 'text-success-700', labelKey: 'billsPage.source.peppol' },
  uploaded: { bg: 'bg-[#e3e4ea]', fg: 'text-[#474a5e]', labelKey: 'billsPage.source.uploaded' },
  scanned: { bg: 'bg-pending-100', fg: 'text-pending-700', labelKey: 'billsPage.source.scanned' },
  // Not drawn in the design: the two sources without a supplier's document take the neutral badge.
  recurring: { bg: 'bg-surface-background', fg: 'text-text-tertiary', labelKey: 'billsPage.source.recurring' },
  selfBilled: { bg: 'bg-primary-50', fg: 'text-primary-800', labelKey: 'billsPage.source.selfBilled' },
}


/**
 * Figma column widths. The design has no Outstanding column — it was drawn before the list
 * carried one — so every other column gives up a little to pay for it and the total stays at
 * the shell's 1144. Widening the table instead put the new column behind a horizontal scroll,
 * which is the one place it is no use: a payables list is read by scanning what is still owed.
 */
const COLUMNS = [
  { key: 'check', width: 45 },
  { key: 'supplier', width: 165 },
  { key: 'theirBill', width: 145 },
  { key: 'due', width: 150 },
  { key: 'match', width: 160 },
  { key: 'status', width: 190 },
  { key: 'amount', width: 145 },
  { key: 'outstanding', width: 144 },
] as const

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

/** The resolution window the filtered tabs read (`BillWorkflowService.RESOLUTION_WINDOW`). */
const RESOLUTION_WINDOW = 2000

type Translate = (key: string, values?: Record<string, unknown>) => string

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

  const tab: BillTabId = isBillTab(params.get('tab')) ? (params.get('tab') as BillTabId) : DEFAULT_BILL_TAB
  const sortKey: BillSortKey = isBillSort(params.get('sort')) ? (params.get('sort') as BillSortKey) : 'newest'
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
    const timer = window.setTimeout(() => update({ q: typed.trim() || null, page: null }), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
    // Armed by typing only; `update` reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const summary = useApiRead<BillSummaryDto>(BILL_SUMMARY_PATH, loadBillSummary)
  const listPath = billListPath({
    filter: BILL_TABS.find((entry) => entry.id === tab)?.filter ?? 'NEEDS_ATTENTION',
    q: query,
    source: BILL_SOURCES.find((option) => option.id === sourceKey)?.source ?? null,
    sort: BILL_SORTS.find((option) => option.value === sortKey)?.sort ?? 'NEWEST',
    page: pageNumber - 1,
    pageSize: size,
  })
  const list = useApiRead<Page<BillRowDto>>(listPath, () => loadBillPage(listPath))

  const [actionError, setActionError] = useState<unknown>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const onApprove = async (billId: string) => {
    setActionError(null)
    setApproving(billId)
    try {
      await approveBill(billId)
      summary.retry()
      list.retry()
    } catch (error) {
      setActionError(error)
    } finally {
      setApproving(null)
    }
  }

  const count = (value: number) => formatCount(value, language)
  const canCapture = can(session, 'invoice.payment.manage')

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('billsPage.title')}</h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">{t('billsPage.subtitle')}</p>
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
  const truncated = (page?.truncated ?? false) || (tab !== 'all' && totals.tabs.truncated)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      <BillKpiCards totals={totals} onReview={() => update({ tab: null, page: null })} />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {BILL_TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ tab: entry.id === DEFAULT_BILL_TAB ? null : entry.id, page: null })}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active ? 'font-semibold text-primary-800' : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                <span
                  className={[
                    'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    active ? 'bg-primary-25 text-primary-800' : 'bg-primary-25 text-text-quaternary',
                  ].join(' ')}
                >
                  {count(billTabCount(totals, entry.id))}
                </span>
                {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" /> : null}
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
          <div className="flex items-center gap-3">
            <FilterMenu
              label={t('billsPage.filters')}
              value={sourceKey}
              defaultValue="all"
              onChange={(value) => update({ source: value === 'all' ? null : value, page: null })}
              options={BILL_SOURCES.map((option) => ({ value: option.id, label: t(option.labelKey) }))}
              icon={filterIcon}
            />
            <SortMenu value={sortKey} onChange={(value) => update({ sort: value === 'newest' ? null : value, page: null })} />
          </div>
        </div>

        {tab === 'needsAttention' && totals.needsAttention.draft > 0 ? (
          <div className="px-6 pb-3.5">
            <Notice body={t('billsPage.notice.drafts', { count: totals.needsAttention.draft })} />
          </div>
        ) : null}
        {truncated ? (
          <div className="px-6 pb-3.5">
            <Notice body={t('billsPage.notice.truncated', { window: count(RESOLUTION_WINDOW) })} />
          </div>
        ) : null}
        {actionError ? (
          <div className="px-6 pb-3.5">
            <Notice body={failureText(t, actionError)} action={{ label: t('common.close'), onClick: () => setActionError(null) }} />
          </div>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <BillTable
            page={page}
            canApprove={can(session, 'invoice.approve')}
            approving={approving}
            onApprove={onApprove}
            ledgerEmpty={totals.tabs.all === 0}
          />
        )}

        {page && page.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <label className="flex items-center gap-4">
              <span className="text-sm font-medium text-text-muted">{t('billsPage.showResult')}</span>
              <select
                value={size}
                onChange={(event) =>
                  update({
                    size: Number(event.target.value) === DEFAULT_BILL_PAGE_SIZE ? null : event.target.value,
                    page: null,
                  })
                }
                className="h-9 rounded-sm border border-border-subtle bg-white px-2 text-sm font-semibold text-text-secondary"
              >
                {BILL_PAGE_SIZES.map((option) => (
                  <option key={option} value={option}>
                    {count(option)}
                  </option>
                ))}
              </select>
            </label>
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
    </div>
  )
}

function failureText(t: Translate, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/**
 * The four cards. "Start a payment run" is left off the ready card until the payment-run screens
 * are wired: it would open a page of mock runs.
 */
function BillKpiCards({ totals, onReview }: { totals: BillSummaryDto; onReview: () => void }) {
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
      link: attention.total > 0 ? { label: t('billsPage.kpi.attentionLink'), onClick: onReview } : null,
    },
    {
      id: 'due',
      icon: kpiDueIcon,
      tint: 'bg-primary-50',
      titleKey: 'billsPage.kpi.due',
      figure: money(totals.dueThisWeekTotal),
      money: true,
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
      meta: t('billsPage.kpi.payableBills', { open: count(totals.openCount), overdue: count(totals.overdueCount) }),
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
      link: null,
    },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((kpi) => (
          <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-2">
              <span className={['flex size-[45px] shrink-0 items-center justify-center rounded-full', kpi.tint].join(' ')}>
                <img src={kpi.icon} alt="" className="size-6" />
              </span>
              <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-text-secondary">{t(kpi.titleKey)}</h3>
            </div>
            <div className="flex items-center gap-1">
              {kpi.money ? <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" /> : null}
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">{kpi.figure}</p>
            </div>
            <p className="text-sm font-medium leading-[1.4] text-text-tertiary">{kpi.meta}</p>
            {kpi.link ? (
              <button
                type="button"
                onClick={kpi.link.onClick}
                className="inline-flex w-fit items-center gap-0.5 text-base font-semibold leading-[1.2] text-primary-800 transition-colors hover:text-primary-900"
              >
                {kpi.link.label}
                <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {totals.excludedFromTotals > 0 ? (
        <p className="text-xs font-medium text-text-tertiary">
          {t('billsPage.kpi.otherCurrencies', { count: totals.excludedFromTotals, currency: totals.currencyCode })}
        </p>
      ) : null}
    </div>
  )
}

function SortMenu({ value, onChange }: { value: BillSortKey; onChange: (value: BillSortKey) => void }) {
  const { t } = useTranslation()
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
        className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
      >
        <img src={sortIcon} alt="" className="size-6" />
        {value === 'newest' ? t('billsPage.sort') : t(BILL_SORTS.find((option) => option.value === value)!.labelKey)}
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={240} align="end">
        <ul role="listbox" className="py-1">
          {BILL_SORTS.map((option) => (
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
                  option.value === value ? 'font-semibold text-primary-800' : 'font-medium text-text-secondary',
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

function NoteText({ note }: { note: Note }) {
  const { t } = useTranslation()
  return <>{t(note.key, note.values)}</>
}

/**
 * Rows do not open the bill yet: the detail page is still the prototype's, which ignores the id
 * and would show another bill's figures. It is wired in its own slice (E-09).
 */
function BillTable({
  page,
  canApprove,
  approving,
  onApprove,
  ledgerEmpty,
}: {
  page: Page<BillRowDto> | null
  canApprove: boolean
  approving: string | null
  onApprove: (billId: string) => void
  ledgerEmpty: boolean
}) {
  const { t } = useTranslation()
  const rows = useMemo(() => (page ? page.items.map(toBillListItem) : []), [page])
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
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.status')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.amount')}</th>
            <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.outstanding')}</th>
          </tr>
        </thead>
        <tbody>
          {page === null ? (
            <tr>
              <td colSpan={8} role="status" className="py-12 text-center text-sm font-medium text-text-quaternary">
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
                    current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                  )
                }
                canApprove={canApprove && row.canApprove}
                approving={approving === row.id}
                onApprove={() => onApprove(row.id)}
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
  canApprove,
  approving,
  onApprove,
}: {
  row: BillListItem
  selected: boolean
  onSelect: () => void
  canApprove: boolean
  approving: boolean
  onApprove: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const source = SOURCE_STYLES[row.source]
  const dueNote = dueNoteOf(row)

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60">
      <td className="px-5 py-2.5 align-middle">
        <TableCheckbox checked={selected} onChange={onSelect} ariaLabel={t('billsPage.selectRow', { id: row.number ?? row.id })} />
      </td>

      <td className="py-2.5 pe-2 align-middle">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">{row.supplier ?? '—'}</p>
        <span
          className={[
            'mt-1 inline-flex items-center rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase leading-[1.2]',
            source.bg,
            source.fg,
          ].join(' ')}
        >
          {t(source.labelKey)}
        </span>
      </td>

      <td className="px-2 py-2.5 align-middle">
        <Link to={`/expenditure/bills/${row.id}`} className="text-sm font-semibold leading-[1.2] text-primary-900 hover:underline">
          {row.number ?? t('billsPage.rows.noNumber')}
        </Link>
        {row.issueDate ? (
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
              : '—'}
        </p>
        {dueNote ? (
          <p
            className={[
              'mt-1 text-xs font-medium leading-[1.2]',
              dueNote.key === 'billsPage.rows.daysOverdue' ? 'text-danger-700' : 'text-text-tertiary',
            ].join(' ')}
          >
            <NoteText note={dueNote} />
          </p>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        <div className="flex items-center gap-1.5">
          {row.match.verdict === 'none' ? (
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">
              <span className="block h-[1.5px] w-3 rounded-full bg-text-quaternary" />
            </span>
          ) : (
            <img src={row.match.verdict === 'ok' ? matchOkIcon : matchWarnIcon} alt="" className="size-5 shrink-0" />
          )}
          <span className="text-sm font-semibold leading-[1.2] text-text-primary">
            {row.match.verdict === 'none' ? t('billsPage.rows.noOrder') : (row.match.order ?? t('billsPage.rows.noOrder'))}
          </span>
        </div>
        {row.match.verdict === 'none' ? (
          row.match.theirOrder ? (
            <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
              {t('billsPage.rows.theyQuoted', { ref: row.match.theirOrder })}
            </p>
          ) : null
        ) : (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            <NoteText note={row.match.note} />
          </p>
        )}
      </td>

      <td className="px-2 py-2.5 align-middle">
        <BillStatusChip item={row} />
        {row.holdReason ? (
          <p className="mt-1.5 max-w-[220px] truncate text-xs font-medium leading-[1.2] text-text-tertiary" title={row.holdReason}>
            {row.holdReason}
          </p>
        ) : null}
        {canApprove ? (
          <button
            type="button"
            onClick={onApprove}
            disabled={approving}
            className="mt-2 inline-flex h-[30px] items-center gap-1 rounded-sm bg-primary-700 px-2.5 text-xs font-semibold leading-[1.2] text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            <img src={actApproveIcon} alt="" className="size-4 shrink-0" />
            {approving ? t('billsPage.actions.approving') : t('billsPage.actions.approve')}
          </button>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        {row.amount !== null ? (
          <div className="flex items-center gap-1">
            <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
            <p className="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums">
              {formatAmount(row.amount, row.currency, language)}
            </p>
          </div>
        ) : (
          <p className="text-base font-medium text-text-muted">—</p>
        )}
        {row.amountNote ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            {t(row.amountNote.key, {
              ...row.amountNote.values,
              amount:
                row.amountNote.values?.amount !== undefined
                  ? formatAmount(row.amountNote.values.amount, row.currency, language)
                  : undefined,
            })}
          </p>
        ) : null}
      </td>

      <td className="px-2 py-2.5 align-middle">
        {row.owes ? (
          <p
            className={[
              'text-base font-semibold leading-[1.2] tabular-nums',
              // Money that is late is the thing a payables list exists to surface, so the figure
              // carries it. The word is left to the due column, which already says how late;
              // repeating it here would put "Overdue" twice on one row. Colour is not the only
              // carrier — the sr-only line below says it, and the due column says it in print.
              row.overdue ? 'text-danger-700' : 'text-text-secondary',
            ].join(' ')}
          >
            {formatAmount(row.outstanding, row.currency, language)}
            {row.overdue ? <span className="sr-only"> {t('billsPage.rows.overdue')}</span> : null}
          </p>
        ) : (
          <p className="text-base font-medium text-text-muted">{t('billsPage.rows.nothingOwed')}</p>
        )}
      </td>
    </tr>
  )
}

/** The design's pager: first, last, and the neighbours of the current page, with gaps elided. */
function PageNumbers({ current, pageCount, onChange }: { current: number; pageCount: number; onChange: (page: number) => void }) {
  const { t, i18n } = useTranslation()
  const numbers = useMemo<(number | string)[]>(() => {
    if (pageCount <= 6) return Array.from({ length: pageCount }, (_, i) => i + 1)
    const near = [current - 1, current, current + 1].filter((n) => n > 1 && n < pageCount)
    return [1, ...(near[0] > 2 ? ['…'] : []), ...near, ...(near.at(-1)! < pageCount - 1 ? ['…'] : []), pageCount]
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
          <span key={`gap-${index}`} className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted">
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
              n === current ? 'bg-primary-25 text-base font-extrabold text-primary-700' : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
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

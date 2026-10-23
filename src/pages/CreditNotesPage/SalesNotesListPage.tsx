import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  Modal,
  OmAmount,
  Pager,
  RowsView,
  Select,
  SortMenu,
  TableCheckbox,
  withRial,
  type ActionMenuItem,
  type SortOption,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, pageCountOf, type Page } from '../../api'
import {
  exportInvoices,
  invoiceListPath,
  invoiceSummaryPath,
  loadInvoicePage,
  loadInvoiceSummary,
  type InvoiceListSort,
  type InvoiceRowDto,
  type InvoiceSummaryDto,
} from '../../api/invoices/list'
import {
  discardDraft,
  loadBranches,
  type BranchDto,
  type NoteKind,
} from '../../api/invoices/drafts'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { PERIODS, isPeriod, periodRange, type PeriodId } from '../../lib/invoiceList'
import {
  NOTE_ROUTES,
  NOTE_TABS,
  creditRefundOf,
  creditSummaryOf,
  debitPaymentOf,
  debitSummaryOf,
  noteMatchesTab,
  noteStatusOf,
  reasonLabelKey,
  type NoteListStatus,
  type NoteTab,
} from '../../lib/salesNote'
import { can, useSession } from '../../lib/session/session'
import creditedIcon from '../../assets/credit-notes/kpi-credited.svg'
import refundDueIcon from '../../assets/credit-notes/kpi-refund-due.svg'
import appliedIcon from '../../assets/credit-notes/kpi-applied.svg'
import refundedIcon from '../../assets/credit-notes/kpi-refunded.svg'
import chargedIcon from '../../assets/debit-notes/kpi-charged.svg'
import awaitingIcon from '../../assets/debit-notes/kpi-awaiting.svg'
import collectedIcon from '../../assets/debit-notes/kpi-collected.svg'
import overdueIcon from '../../assets/debit-notes/kpi-overdue.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import viewIcon from '../../assets/actions/view.svg'
import invoiceIcon from '../../assets/actions/invoice.svg'
import editIcon from '../../assets/actions/edit.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

type Chip = { bg: string; text: string }

/** The list's pills, in the invoices list's palette so one document reads the same twice. */
const STATUS_STYLES: Record<NoteListStatus, Chip> = {
  draft: { bg: 'bg-neutral-25', text: 'text-text-quaternary' },
  toSend: { bg: 'bg-primary-25', text: 'text-primary-800' },
  refundDue: { bg: 'bg-warning-100', text: 'text-[#6d5a39]' },
  applied: { bg: 'bg-success-100', text: 'text-success-700' },
  refunded: { bg: 'bg-success-100', text: 'text-success-700' },
  awaiting: { bg: 'bg-warning-100', text: 'text-[#6d5a39]' },
  overdue: { bg: 'bg-danger-100', text: 'text-danger-700' },
  paid: { bg: 'bg-success-100', text: 'text-success-700' },
  cancelled: { bg: 'bg-neutral-25', text: 'text-text-muted' },
}

const KPI: Record<NoteKind, { id: string; icon: string }[]> = {
  CREDIT_NOTE: [
    { id: 'credited', icon: creditedIcon },
    { id: 'refundDue', icon: refundDueIcon },
    { id: 'applied', icon: appliedIcon },
    { id: 'refunded', icon: refundedIcon },
  ],
  DEBIT_NOTE: [
    { id: 'charged', icon: chargedIcon },
    { id: 'awaiting', icon: awaitingIcon },
    { id: 'collected', icon: collectedIcon },
    { id: 'overdue', icon: overdueIcon },
  ],
}

type SortKey =
  'updated' | 'issuedNewest' | 'issuedOldest' | 'amountHighest' | 'amountLowest' | 'customer'
const SORTS: { value: SortKey; sort: InvoiceListSort }[] = [
  { value: 'updated', sort: 'UPDATED' },
  { value: 'issuedNewest', sort: 'ISSUED_NEWEST' },
  { value: 'issuedOldest', sort: 'ISSUED_OLDEST' },
  { value: 'amountHighest', sort: 'AMOUNT_HIGHEST' },
  { value: 'amountLowest', sort: 'AMOUNT_LOWEST' },
  { value: 'customer', sort: 'CUSTOMER' },
]
const SORT_OPTIONS: SortOption<SortKey>[] = SORTS.map((entry) => ({
  value: entry.value,
  labelKey: `salesNote.list.sortBy.${entry.value}`,
}))

const PAGE_SIZES = [10, 25, 50] as const
const DEFAULT_PAGE_SIZE = 10
const SEARCH_DELAY_MS = 300

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

/**
 * Income › Credit notes and Income › Debit notes, as the two list frames draw them: four figures,
 * tabs with counts, a searchable table with a status per row, and a pager. The tab, search, sort,
 * page size and page live in the URL, so a filtered list survives a reload and the back button.
 */
export function SalesNotesListPage({ kind }: { kind: NoteKind }) {
  return (
    <AppShell>
      <NotesList kind={kind} />
    </AppShell>
  )
}

function NotesList({ kind }: { kind: NoteKind }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // No new drafts while the subscription is read-only (ST-2, CA-3).
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const credit = kind === 'CREDIT_NOTE'
  const kindKey = credit ? 'credit' : 'debit'
  const base = NOTE_ROUTES[kind]
  const tabs = NOTE_TABS[kind]

  const tab: NoteTab = tabs.find((entry) => entry.id === params.get('tab')) ?? tabs[0]
  const period: PeriodId = isPeriod(params.get('period'))
    ? (params.get('period') as PeriodId)
    : 'all'
  const sortKey: SortKey = SORTS.some((entry) => entry.value === params.get('sort'))
    ? (params.get('sort') as SortKey)
    : 'updated'
  const query = params.get('q') ?? ''
  const sizeParam = Number(params.get('size'))
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

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
    // Armed by typing only; `update` reads the params when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const today = muscatToday()
  const range = periodRange(period, today)
  const filter = {
    state: tab.state,
    payment: tab.payment,
    type: kind,
    from: range.from,
    to: range.to,
    search: query,
  }
  const listPath = invoiceListPath({
    ...filter,
    sort: SORTS.find((entry) => entry.value === sortKey)?.sort ?? 'UPDATED',
    page: pageNumber - 1,
    size,
  })
  // A tab no list can answer yet (a credit note's refunds) asks nothing and shows its empty state.
  const list = useApiRead<Page<InvoiceRowDto>>(tab.none ? null : listPath, () =>
    loadInvoicePage(listPath),
  )
  // The tab counts, the subtitle and the four figures come from the summary by document type
  // (INCOME.md 4.1): `?type=CREDIT_NOTE` or `?type=DEBIT_NOTE`.
  const figures = useApiRead<InvoiceSummaryDto>(invoiceSummaryPath(kind), () =>
    loadInvoiceSummary(kind),
  )
  const summary = useMemo(
    () =>
      figures.read.status === 'ready'
        ? credit
          ? creditSummaryOf(figures.read.data)
          : debitSummaryOf(figures.read.data)
        : null,
    [credit, figures.read],
  )
  const branches = useApiRead<BranchDto[]>('/v1/branches', loadBranches)
  const branchName = (id: string | null | undefined) =>
    id && branches.read.status === 'ready'
      ? branches.read.data.find((branch) => branch.id === id)?.name
      : undefined

  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    setExporting(true)
    setNotice(null)
    try {
      const file = await exportInvoices(filter)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? `fawtir-${credit ? 'credit' : 'debit'}-notes.csv`
      link.click()
      URL.revokeObjectURL(url)
      if (file.truncated) setNotice(t('salesNote.list.exportTruncated'))
    } catch (error) {
      setNotice(failureText(t, error))
    } finally {
      setExporting(false)
    }
  }

  const [discarding, setDiscarding] = useState<InvoiceRowDto | null>(null)
  const onDiscard = async () => {
    if (!discarding) return
    const target = discarding
    setDiscarding(null)
    try {
      await discardDraft(target.id, target.version)
      list.retry()
      figures.retry()
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION'
          ? t('salesNote.list.discardStale')
          : failureText(t, error),
      )
      list.retry()
    }
  }

  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency = 'OMR') => formatAmount(value, currency, language)
  const page: Page<InvoiceRowDto> | null = tab.none
    ? { items: [], page: 0, size, total: 0, hasMore: false, truncated: false }
    : list.read.status === 'ready'
      ? list.read.data
      : null
  // Narrowed on the client where the API has no filter for the design's tab (delivery, refunds).
  const rows = page ? page.items.filter((row) => noteMatchesTab(kind, row, tab)) : []
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))

  // The row's reason as chosen, from its stored reason detail when it has one (INCOME.md 4.9).
  const reasonKeyOf = (row: InvoiceRowDto) =>
    reasonLabelKey(kind, row.details?.correctionReasonCode, row.details?.correctionReasonDetail)

  const menuFor = (row: InvoiceRowDto): ActionMenuItem[] => [
    {
      id: 'view',
      labelKey: 'salesNote.list.rowAction.view',
      icon: viewIcon,
      to: `${base}/${row.id}`,
    },
    ...(row.correctionOfInvoiceId
      ? [
          {
            id: 'invoice',
            labelKey: 'salesNote.list.rowAction.openInvoice',
            icon: invoiceIcon,
            to: `/invoices/${row.correctionOfInvoiceId}`,
          },
        ]
      : []),
    ...(row.authoringState === 'DRAFT' && can(session, 'invoice.draft')
      ? [
          {
            id: 'edit',
            labelKey: 'salesNote.list.rowAction.edit',
            icon: editIcon,
            to: `${base}/${row.id}/edit`,
          },
          {
            id: 'discard',
            labelKey: 'salesNote.list.rowAction.discard',
            icon: deleteIcon,
            danger: true,
            onSelect: () => setDiscarding(row),
          },
        ]
      : []),
  ]

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
          >
            {t('salesNote.compose.breadcrumbIncome')}
            <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
          </Link>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t(`salesNote.${kindKey}.list`)}
          </h1>
        </div>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {summary?.quarter
            ? withRial(
                t(`salesNote.list.subtitle.${kindKey}`, {
                  count: summary.quarter.count,
                  notes: count(summary.quarter.count),
                  amount: money(summary.quarter.amount),
                }),
              )
            : t(`salesNote.${kindKey}.listNote`)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {can(session, 'invoice.export') ? (
          <button type="button" onClick={onExport} disabled={exporting} className={OUTLINE_BUTTON}>
            <img src={exportIcon} alt="" className="size-6 rotate-180" />
            {exporting ? t('salesNote.list.exporting') : t('salesNote.list.export')}
          </button>
        ) : null}
        {mayDraft && can(session, credit ? 'creditnote.create' : 'debitnote.create') ? (
          <Link
            to={`${base}/new`}
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t(`salesNote.${kindKey}.new`)}
          </Link>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {header}
      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {/* The four figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI[kind].map((kpi) => {
          const figure = summary?.cards[kpi.id]
          const danger = kpi.id === 'overdue' && (figure?.count ?? 0) > 0
          const tone =
            kpi.id === 'charged'
              ? 'text-success-700'
              : danger
                ? 'text-danger-700'
                : 'text-text-secondary'
          return (
            <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
              <div className="flex items-center gap-3.5">
                <img src={kpi.icon} alt="" className="size-11 shrink-0" />
                <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t(`salesNote.list.kpi.${kpi.id}`)}
                </h3>
              </div>
              {/* As the frame draws it: "+ <rial> 69.060", the direction ahead of the sign. */}
              <span className={`inline-flex items-center gap-2 ${tone}`}>
                {kpi.id === 'charged' && figure ? (
                  <span className="text-[32px] font-semibold leading-[1.2]" aria-hidden="true">
                    +
                  </span>
                ) : null}
                {figure || !(figures.read.status === 'failed' || summary) ? (
                  <OmAmount
                    size="lg"
                    amount={figure ? money(figure.amount) : '…'}
                    amountClassName={`text-[32px] font-semibold leading-[1.2] ${tone} tabular-nums`}
                  />
                ) : (
                  // A figure that is missing, not loading, reads as words: a rial sign before "…"
                  // looked like an amount still on its way (owner, 2026-09-29).
                  <span className={`text-[32px] font-semibold leading-[1.2] ${tone}`}>
                    {t('salesNote.detail.notAvailableYet')}
                  </span>
                )}
              </span>
              <p
                className={[
                  'text-sm font-medium leading-[1.2]',
                  danger ? 'text-danger-700' : 'text-text-tertiary',
                ].join(' ')}
              >
                {figure
                  ? kpi.id === 'overdue' && figure.count === 0
                    ? t('salesNote.list.kpi.overdueNone')
                    : t(`salesNote.list.kpi.${kpi.id}Meta`, {
                        count: figure.count,
                        notes: count(figure.count),
                        days: count(figure.days ?? 0),
                      })
                  : // Failed, or a figure the summary does not carry (a credit note's refunds, 4.2).
                    figures.read.status === 'failed' || summary
                    ? t('salesNote.list.kpi.unavailable')
                    : '…'}
              </p>
            </article>
          )
        })}
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {tabs.map((entry) => {
            const active = entry.id === tab.id
            const tally = summary?.counts[entry.id] ?? null
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(`salesNote.tabs.${entry.id}`)}
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
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('salesNote.list.search')}
              aria-label={t('salesNote.list.search')}
              maxLength={200}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu
              label={t('salesNote.list.filters')}
              value={period}
              defaultValue="all"
              icon={filterIcon}
              onChange={(value) => update({ period: value === 'all' ? null : value, page: null })}
              options={PERIODS.map((option) => ({ value: option.id, label: t(option.labelKey) }))}
            />
            <SortMenu
              value={sortKey}
              options={SORT_OPTIONS}
              label={t('salesNote.list.sort')}
              onChange={(value) => update({ sort: value === 'updated' ? null : value, page: null })}
            />
          </div>
        </div>

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
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
                      ariaLabel={t('salesNote.list.selectAll')}
                    />
                  </th>
                  {(credit
                    ? [
                        'creditNote',
                        'reverses',
                        'customer',
                        'issued',
                        'creditAmount',
                        'refund',
                        'status',
                      ]
                    : [
                        'debitNote',
                        'adjusts',
                        'customer',
                        'issued',
                        'debitAmount',
                        'payment',
                        'status',
                      ]
                  ).map((key) => (
                    <th key={key} className="px-2 py-2.5 text-start font-semibold">
                      {t(`salesNote.col.${key}`)}
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
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                      role="status"
                    >
                      {t('appAccess.loading')}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {query || period !== 'all' || tab.id !== 'all'
                        ? t('salesNote.list.noResults')
                        : t(`salesNote.${kindKey}.none`)}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const status = noteStatusOf(kind, row)
                    const chip = STATUS_STYLES[status]
                    const number = row.invoiceNumber ?? t('salesNote.draft')
                    const amount = row.totals?.totalAmount ?? null
                    const refund = credit ? creditRefundOf(row) : null
                    const payment = credit ? null : debitPaymentOf(row, today)
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                        onClick={() =>
                          navigate(
                            row.authoringState === 'DRAFT' && can(session, 'invoice.draft')
                              ? `${base}/${row.id}/edit`
                              : `${base}/${row.id}`,
                          )
                        }
                      >
                        <td className="px-5 py-3" onClick={(event) => event.stopPropagation()}>
                          <TableCheckbox
                            checked={selected.includes(row.id)}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(row.id)
                                  ? current.filter((id) => id !== row.id)
                                  : [...current, row.id],
                              )
                            }
                            ariaLabel={t('salesNote.list.selectRow', { id: number })}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <Link
                            to={`${base}/${row.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-sm font-semibold text-text-primary hover:text-primary-700"
                          >
                            {number}
                          </Link>
                          <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                            {reasonKeyOf(row)
                              ? t(reasonKeyOf(row)!)
                              : (row.details?.correctionReasonCode ?? '—')}
                          </p>
                        </td>
                        <td className="px-2 py-3">
                          {row.correctionOfInvoiceId ? (
                            <Link
                              to={`/invoices/${row.correctionOfInvoiceId}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-sm font-semibold text-primary-700 hover:underline"
                            >
                              {row.correctionOfInvoiceNumber ?? '—'}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                            {row.customerName ?? '—'}
                          </p>
                          <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                            {row.details?.subject?.trim() || branchName(row.branchId) || '—'}
                          </p>
                        </td>
                        <td className="px-2 py-3 text-sm font-medium text-text-tertiary">
                          {row.issueDate ? formatDate(row.issueDate, language) : '—'}
                        </td>
                        <td className="px-2 py-3">
                          {amount !== null ? (
                            // The frame puts the direction before the sign: "- <rial> 35.910".
                            <span
                              className={`inline-flex items-center gap-1 whitespace-nowrap ${credit ? 'text-danger-700' : 'text-success-700'}`}
                            >
                              <span
                                className="text-base font-bold leading-[1.5]"
                                aria-hidden="true"
                              >
                                {credit ? '−' : '+'}
                              </span>
                              <OmAmount
                                size="sm"
                                amount={money(amount, row.currency)}
                                amountClassName={`text-base font-bold leading-[1.5] ${credit ? 'text-danger-700' : 'text-success-700'} tabular-nums`}
                              />
                            </span>
                          ) : (
                            <span className="text-base font-medium text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {credit ? (
                            <RefundCell cell={refund} currency={row.currency} />
                          ) : (
                            <PaymentCell cell={payment} />
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <span
                            className={[
                              'inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium',
                              chip.bg,
                              chip.text,
                            ].join(' ')}
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-current" />
                            {t(`salesNote.status.${status}`)}
                          </span>
                        </td>
                        <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                          <ActionMenu
                            items={menuFor(row)}
                            label={t('salesNote.list.rowMenu')}
                            floating
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </RowsView>
        )}

        {page && page.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-text-muted">
                {t('salesNote.list.showResult')}
              </span>
              <div className="w-[84px]">
                <Select
                  compact
                  value={String(size)}
                  onChange={(value) =>
                    update({ size: Number(value) === DEFAULT_PAGE_SIZE ? null : value, page: null })
                  }
                  options={PAGE_SIZES.map((option) => ({
                    value: String(option),
                    label: count(option),
                  }))}
                  ariaLabel={t('salesNote.list.showResult')}
                />
              </div>
            </div>
            {pageCountOf(page) > 1 ? (
              <Pager
                page={pageNumber}
                pageCount={pageCountOf(page)}
                onChange={(next) => update({ page: next === 1 ? null : String(next) })}
                labels={{
                  nav: t('salesNote.pager.nav'),
                  previous: t('salesNote.pager.previous'),
                  next: t('salesNote.pager.next'),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {list.read.status === 'loading' && page === null ? (
        <span className="sr-only">{t('appAccess.loading')}</span>
      ) : null}
      {figures.read.status === 'loading' && !summary ? <LoadingNotice /> : null}

      <Modal
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        title={t('salesNote.list.discardTitle')}
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
              {t('salesNote.list.discardConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('salesNote.list.discardBody')}
        </p>
      </Modal>
    </div>
  )
}

function RefundCell({
  cell,
  currency,
}: {
  cell: ReturnType<typeof creditRefundOf>
  currency: string
}) {
  const { t, i18n } = useTranslation()
  if (!cell) return <span className="text-sm font-medium text-text-muted">—</span>
  if (cell.kind === 'applied') {
    return (
      <>
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {t('salesNote.list.refund.applied')}
        </p>
        <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
          {t('salesNote.list.refund.offset')}
        </p>
      </>
    )
  }
  return (
    <>
      <OmAmount
        size="xs"
        amount={formatAmount(cell.amount, currency, i18n.language)}
        amountClassName="text-sm font-semibold text-text-primary tabular-nums"
      />
      <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
        {cell.kind === 'refundDue'
          ? t('salesNote.list.refund.due')
          : cell.on
            ? t('salesNote.list.refund.refundedOn', { date: formatDate(cell.on, i18n.language) })
            : t('salesNote.list.refund.refunded')}
      </p>
    </>
  )
}

function PaymentCell({ cell }: { cell: ReturnType<typeof debitPaymentOf> }) {
  const { t, i18n } = useTranslation()
  if (!cell) return <span className="text-sm font-medium text-text-muted">—</span>
  if (cell.kind === 'paid') {
    return (
      <>
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {cell.date
            ? t('salesNote.list.payment.paidOn', { date: formatDate(cell.date, i18n.language) })
            : t('salesNote.list.payment.paid')}
        </p>
        <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
          {t('salesNote.list.payment.settled')}
        </p>
      </>
    )
  }
  return (
    <>
      <p
        className={[
          'text-sm font-semibold leading-[1.2]',
          cell.kind === 'late' ? 'text-danger-700' : 'text-text-primary',
        ].join(' ')}
      >
        {t('salesNote.list.payment.due', { date: formatDate(cell.date, i18n.language) })}
      </p>
      <p
        className={[
          'text-xs font-medium leading-[1.2]',
          cell.kind === 'late' ? 'text-danger-700' : 'text-text-tertiary',
        ].join(' ')}
      >
        {cell.kind === 'late'
          ? t('salesNote.list.payment.daysLate', { count: cell.days })
          : cell.addedToInvoice
            ? t('salesNote.list.payment.addedToInvoice')
            : cell.daysLeft !== null
              ? t('salesNote.list.payment.inDays', { count: cell.daysLeft })
              : ''}
      </p>
    </>
  )
}

function failureText(t: Translate, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

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
import { ApiError, pageCountOf, type Page } from '../../api'
import {
  INVOICE_SUMMARY_PATH,
  exportInvoices,
  invoiceListPath,
  loadInvoicePage,
  loadInvoiceSummary,
  type InvoiceRowDto,
  type InvoiceSummaryDto,
  type InvoiceTypeDto,
} from '../../api/invoices/list'
import { discardDraft } from '../../api/invoices/drafts'
import {
  INVOICE_SORTS,
  INVOICE_TABS,
  INVOICE_TYPES,
  PERIODS,
  isInvoiceSort,
  isInvoiceTab,
  isInvoiceType,
  isPeriod,
  listFilter,
  tabCount,
  toInvoiceListItem,
  type AuthoringChip,
  type InvoiceListItem,
  type InvoiceSortKey,
  type InvoiceTabId,
  type Note,
  type PaymentChip,
  type PeriodId,
} from '../../lib/invoiceList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import outstandingIcon from '../../assets/invoices/kpi-outstanding.svg'
import paidIcon from '../../assets/invoices/kpi-paid.svg'
import awaitingIcon from '../../assets/invoices/kpi-awaiting.svg'
import overdueIcon from '../../assets/invoices/kpi-overdue.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import editIcon from '../../assets/actions/edit.svg'
import deleteIcon from '../../assets/actions/delete.svg'

type Chip = { bg: string; dot: string; text: string }

const AUTHORING_STYLES: Record<AuthoringChip, Chip> = {
  draft: { bg: 'bg-neutral-25', dot: 'bg-text-quaternary', text: 'text-text-quaternary' },
  issued: { bg: 'bg-primary-25', dot: 'bg-primary-800', text: 'text-primary-800' },
  cancelled: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
  discarded: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
}

const PAYMENT_STYLES: Record<PaymentChip, Chip> = {
  overdue: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  awaiting: { bg: 'bg-warning-100', dot: 'bg-warning-700', text: 'text-warning-700' },
  partial: { bg: 'bg-warning-100', dot: 'bg-warning-700', text: 'text-warning-700' },
  paid: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
}

const DELIVERED_BY_HAND: Chip = { bg: 'bg-primary-25', dot: 'bg-primary-700', text: 'text-primary-700' }

const PAGE_SIZES = [10, 25, 50] as const
const DEFAULT_PAGE_SIZE = 10

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
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const tab: InvoiceTabId = isInvoiceTab(params.get('tab')) ? (params.get('tab') as InvoiceTabId) : 'all'
  const type: InvoiceTypeDto | null = isInvoiceType(params.get('type')) ? (params.get('type') as InvoiceTypeDto) : null
  const period: PeriodId = isPeriod(params.get('period')) ? (params.get('period') as PeriodId) : 'all'
  const sortKey: InvoiceSortKey = isInvoiceSort(params.get('sort')) ? (params.get('sort') as InvoiceSortKey) : 'updated'
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
    const timer = window.setTimeout(() => update({ q: typed.trim() || null, page: null }), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
    // Armed by typing only: `update` is a new function each render, and depending on it would
    // restart the pause on every render. It reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const summary = useApiRead<InvoiceSummaryDto>(INVOICE_SUMMARY_PATH, loadInvoiceSummary)
  // The period counts back from the server's day, so the list waits for the summary to know it.
  const filter = summary.read.status === 'ready' ? listFilter(tab, type, period, summary.read.data.asOf, query) : null
  const listPath = filter
    ? invoiceListPath({
        ...filter,
        sort: INVOICE_SORTS.find((option) => option.value === sortKey)?.sort ?? 'UPDATED',
        page: pageNumber - 1,
        size,
      })
    : null
  const list = useApiRead<Page<InvoiceRowDto>>(listPath, () => loadInvoicePage(listPath!))

  const [notice, setNotice] = useState<{ body: string } | null>(null)
  const [exporting, setExporting] = useState(false)
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

  const count = (value: number) => formatCount(value, language)

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('invoicesPage.title')}</h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">{t('invoicesPage.subtitleLive')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {can(session, 'invoice.export') ? (
          <button type="button" onClick={onExport} disabled={exporting || !filter} className={OUTLINE_BUTTON}>
            <img src={exportIcon} alt="" className="size-6 rotate-180" />
            {exporting ? t('invoicesPage.exporting') : t('invoicesPage.export')}
          </button>
        ) : null}
        {can(session, 'invoice.draft') ? (
          <Link
            to="/invoices/new"
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('invoicesPage.createInvoice')}
          </Link>
        ) : null}
      </div>
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

  const totals = summary.read.data
  const page = list.read.status === 'ready' ? list.read.data : null
  const filtered = query !== '' || type !== null || period !== 'all'

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      {header}
      {notice ? (
        <Notice body={notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} />
      ) : null}
      <InvoiceKpiCards totals={totals} />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {INVOICE_TABS.map((entry) => {
            const active = entry.id === tab
            const tally = tabCount(totals, entry.id)
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active ? 'font-semibold text-primary-800' : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
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
                {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" /> : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-md:w-full max-md:flex-none">
            <label className="flex h-11 w-full max-w-[280px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
              <img src={searchIcon} alt="" className="size-5 shrink-0" />
              <input
                type="search"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t('invoicesPage.searchLive')}
                aria-label={t('invoicesPage.searchLive')}
                maxLength={200}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>
            <FilterMenu
              label={t('invoicesPage.filters.period.all')}
              value={period}
              defaultValue="all"
              onChange={(value) => update({ period: value === 'all' ? null : value, page: null })}
              options={PERIODS.map((option) => ({ value: option.id, label: t(option.labelKey) }))}
            />
            <FilterMenu
              label={t('invoicesPage.filters.documentType')}
              value={type ?? 'all'}
              defaultValue="all"
              onChange={(value) => update({ type: value === 'all' ? null : value, page: null })}
              options={[
                { value: 'all', label: t('invoicesPage.filters.docType.all') },
                ...INVOICE_TYPES.map((value) => ({ value, label: t(`invoicesPage.docType.${value}`) })),
              ]}
            />
          </div>
          <SortMenu value={sortKey} onChange={(value) => update({ sort: value === 'updated' ? null : value, page: null })} />
        </div>

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <InvoiceTable
            page={page}
            nothingYet={totals.all === 0 && !filtered}
            onDiscard={setDiscarding}
          />
        )}

        {page && page.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-4">
                <span className="text-sm font-medium text-text-muted">{t('invoicesPage.showResult')}</span>
                <select
                  value={size}
                  onChange={(event) =>
                    update({
                      size: Number(event.target.value) === DEFAULT_PAGE_SIZE ? null : event.target.value,
                      page: null,
                    })
                  }
                  className="h-9 rounded-sm border border-border-subtle bg-white px-2 text-sm font-semibold text-text-secondary"
                >
                  {PAGE_SIZES.map((option) => (
                    <option key={option} value={option}>
                      {count(option)}
                    </option>
                  ))}
                </select>
              </label>
              {page.total !== null ? (
                <span className="text-sm font-medium text-text-tertiary">
                  {t('invoicesPage.resultTotal', { count: page.total, documents: count(page.total) })}
                </span>
              ) : null}
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
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('invoiceDraft.discardBody')}</p>
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
  const oldest = totals.oldestOverdueDueDate ? daysBetween(totals.oldestOverdueDueDate, totals.asOf) : null
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
      meta: t('invoicesPage.kpi.paidLive', { count: totals.paidInvoices, invoices: count(totals.paidInvoices) }),
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
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">{t(kpi.titleKey)}</h3>
          </div>
          <div className="flex items-center gap-1">
            <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
            <span className="sr-only">{totals.currencyCode}</span>
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">{kpi.figure}</p>
          </div>
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{kpi.meta}</p>
        </article>
      ))}
    </div>
  )
}

function SortMenu({ value, onChange }: { value: InvoiceSortKey; onChange: (value: InvoiceSortKey) => void }) {
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
        {t(INVOICE_SORTS.find((option) => option.value === value)?.labelKey ?? 'invoicesPage.filters.sort')}
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={220} align="end">
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

function InvoiceTable({
  page,
  nothingYet,
  onDiscard,
}: {
  page: Page<InvoiceRowDto> | null
  nothingYet: boolean
  onDiscard: (item: InvoiceListItem) => void
}) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const rows = useMemo(() => (page ? page.items.map(toInvoiceListItem) : []), [page])
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))
  const canDraft = can(session, 'invoice.draft')

  // Drafts only (D4): an issued invoice is corrected by a credit note, never deleted, and there is
  // no route to duplicate one. The issued invoice's own screen is slice I-06; until it is wired an
  // entry pointing at the mock detail page would show someone else's invoice.
  const menuFor = (row: InvoiceListItem): ActionMenuItem[] =>
    row.isDraft && canDraft
      ? [
          { id: 'edit', labelKey: 'invoicesPage.rowAction.edit', icon: editIcon, to: `/invoices/${row.id}/edit` },
          {
            id: 'discard',
            labelKey: 'invoicesPage.rowAction.discard',
            icon: deleteIcon,
            danger: true,
            onSelect: () => onDiscard(row),
          },
        ]
      : []

  const message = (key: string) => (
    <tr>
      <td colSpan={8} className="py-12 text-center text-sm font-medium text-text-quaternary">
        {t(key)}
      </td>
    </tr>
  )

  return (
    <RowsView>
      <table className="w-full min-w-[960px] border-collapse text-start">
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
            {(['invoice', 'customer', 'issued', 'due', 'amount', 'status'] as const).map((key) => (
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
              <td colSpan={8} role="status" className="py-12 text-center text-sm font-medium text-text-quaternary">
                {t('appAccess.loading')}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            message(nothingYet ? 'invoicesPage.nothingYet' : 'invoicesPage.noResults')
          ) : (
            rows.map((row) => {
              const menu = menuFor(row)
              const editable = row.isDraft && canDraft
              return (
                <tr
                  key={row.id}
                  className={[
                    'border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60',
                    editable ? 'cursor-pointer' : '',
                  ].join(' ')}
                  onClick={editable ? () => navigate(`/invoices/${row.id}/edit`) : undefined}
                >
                  <td className="px-5 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <TableCheckbox
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                        )
                      }
                      ariaLabel={t('invoicesPage.selectRow', { id: row.number ?? t('invoicesPage.draftNumber') })}
                    />
                  </td>
                  <InvoiceRowCells row={row} />
                  <td className="px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                    {menu.length > 0 ? <ActionMenu items={menu} label={t('invoicesPage.rowMenu')} floating /> : null}
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

function NoteText({ note, currency }: { note: Note; currency: string }) {
  const { t, i18n } = useTranslation()
  const values = note.values ?? {}
  const amount = typeof values.amount === 'number' ? formatAmount(values.amount, currency, i18n.language) : undefined
  return <>{t(note.key, amount === undefined ? values : { ...values, amount })}</>
}

function StatusChip({ chip, label }: { chip: Chip; label: string }) {
  return (
    <span className={['inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium', chip.bg, chip.text].join(' ')}>
      <span className={['size-1.5 shrink-0 rounded-full', chip.dot].join(' ')} />
      {label}
    </span>
  )
}

function InvoiceRowCells({ row }: { row: InvoiceListItem }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  return (
    <>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold text-text-quaternary">{row.number ?? t('invoicesPage.draftNumber')}</p>
        {row.type !== 'INVOICE' ? (
          <span className="mt-0.5 inline-flex items-center rounded-sm bg-neutral-25 px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {t(`invoicesPage.docType.${row.type}`)}
          </span>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">{row.customer ?? '—'}</p>
        {row.subtitle ? (
          <p className="text-xs font-medium leading-[1.2] text-text-tertiary">{row.subtitle}</p>
        ) : null}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
        {row.issueDate ? formatDate(row.issueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
        {row.dueDate ? formatDate(row.dueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5">
        {row.amount !== null ? (
          <>
            <span className="inline-flex items-center gap-1">
              <RialMark className="w-6 shrink-0 text-text-secondary" />
              <span className="text-base font-bold leading-[1.5] text-text-secondary tabular-nums">
                {formatAmount(row.amount, row.currency, language)}
              </span>
            </span>
            {row.estimated ? (
              <p className="text-xs font-medium leading-[1.2] text-text-muted">{t('invoicesPage.amountNote.estimate')}</p>
            ) : row.amountNote ? (
              <p className="text-xs font-semibold leading-[1.2] text-text-tertiary">
                <NoteText note={row.amountNote} currency={row.currency} />
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-base font-medium text-text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {row.payment === null || row.authoring !== 'issued' ? (
            <StatusChip chip={AUTHORING_STYLES[row.authoring]} label={t(`invoicesPage.authoring.${row.authoring}`)} />
          ) : null}
          {row.payment ? (
            <StatusChip
              chip={PAYMENT_STYLES[row.payment]}
              label={t(`invoicesPage.payment.${row.payment}`, row.paymentValues)}
            />
          ) : null}
          {row.sentManually ? <StatusChip chip={DELIVERED_BY_HAND} label={t('invoicesPage.delivery.sentManually')} /> : null}
        </div>
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
    return [1, ...(near[0] > 2 ? ['…'] : []), ...near, ...(near.at(-1)! < pageCount - 1 ? ['…'] : []), pageCount]
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

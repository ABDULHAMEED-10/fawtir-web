import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  Popover,
  RialMark,
  RowsView,
  TableCheckbox,
  withRial,
  type ActionMenuItem,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import {
  CUSTOMER_SUMMARY_PATH,
  customerListPath,
  customerReceivablesPath,
  exportCustomers,
  loadCustomerPage,
  loadCustomerReceivables,
  loadCustomerSummary,
  type CustomerDto,
  type CustomerReceivableDto,
  type CustomerReceivablesDto,
  type CustomerSummaryDto,
} from '../../api/customers/customers'
import {
  CUSTOMER_PAGE_SIZES,
  CUSTOMER_SORTS,
  CUSTOMER_TABS,
  DEFAULT_CUSTOMER_PAGE_SIZE,
  customerPageSizeOf,
  isCustomerSort,
  isCustomerTab,
  tabCount,
  toCustomerListItem,
  toReceivableView,
  type CustomerListItem,
  type CustomerSortKey,
  type Note,
} from '../../lib/customerList'
import type { CustomerKind, PeppolState, ReceivableState, CustomerTabId } from '../../lib/customers'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import receivablesIcon from '../../assets/customers/kpi-receivables.svg'
import overdueIcon from '../../assets/customers/kpi-overdue.svg'
import customersIcon from '../../assets/customers/kpi-customers.svg'
import peppolIcon from '../../assets/customers/kpi-peppol.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import bulkUploadIcon from '../../assets/invoices/bulk-upload.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import invoiceIcon from '../../assets/actions/invoice.svg'
import editIcon from '../../assets/actions/edit.svg'

/** 34px rounded square, tinted by customer kind. */
const AVATAR_STYLES: Record<CustomerKind, string> = {
  business: 'bg-primary-50 text-primary-700',
  government: 'bg-pending-100 text-pending-700',
  consumer: 'bg-neutral-25 text-text-secondary',
}

/** Peppol state renders as a dot pill, not bare text. */
const PEPPOL_STYLES: Record<PeppolState, { bg: string; fg: string; dot: string; labelKey: string }> = {
  onPeppol: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    dot: 'bg-success-700',
    labelKey: 'customersPage.peppol.onPeppol',
  },
  notConnected: {
    bg: 'bg-neutral-25',
    fg: 'text-[#595d75]',
    dot: 'bg-[#595d75]',
    labelKey: 'customersPage.peppol.notConnected',
  },
  qrReceipt: {
    bg: 'bg-primary-25',
    fg: 'text-primary-700',
    dot: 'bg-primary-700',
    labelKey: 'customersPage.peppol.qrReceipt',
  },
}

const AMOUNT_STYLES: Record<ReceivableState, { amount: string; note: string }> = {
  overdue: { amount: 'text-danger-700', note: 'text-danger-700' },
  attention: { amount: 'text-text-secondary', note: 'text-pending-500' },
  settled: { amount: 'text-text-muted', note: 'text-text-muted' },
}

/** How long typing pauses before the search is sent, so each keystroke is not a request. */
const SEARCH_DELAY_MS = 300

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

export function CustomersPage() {
  return (
    <AppShell>
      <CustomersScreen />
    </AppShell>
  )
}

/**
 * Inside the shell, so its reads start only once the shell has confirmed a session. The tab,
 * search, sort, page size and page live in the URL, so a filtered list survives a reload and the
 * back button.
 */
function CustomersScreen() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const tab: CustomerTabId = isCustomerTab(params.get('tab')) ? (params.get('tab') as CustomerTabId) : 'all'
  const sortKey: CustomerSortKey = isCustomerSort(params.get('sort'))
    ? (params.get('sort') as CustomerSortKey)
    : 'nameAsc'
  const query = params.get('q') ?? ''
  const size = customerPageSizeOf(params.get('size'))
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

  const type = CUSTOMER_TABS.find((entry) => entry.id === tab)?.type ?? null
  const summary = useApiRead<CustomerSummaryDto>(CUSTOMER_SUMMARY_PATH, loadCustomerSummary)
  const listPath = customerListPath({
    type,
    search: query,
    sort: CUSTOMER_SORTS.find((option) => option.value === sortKey)?.sort ?? 'NAME_ASC',
    page: pageNumber - 1,
    size,
  })
  const list = useApiRead<Page<CustomerDto>>(listPath, () => loadCustomerPage(listPath))

  // What the customers on this page owe, asked once the page is known: one grouped read per page.
  const ids = list.read.status === 'ready' ? list.read.data.items.map((customer) => customer.id) : []
  const receivablesPath = ids.length > 0 ? customerReceivablesPath(ids) : null
  const receivables = useApiRead<CustomerReceivablesDto>(receivablesPath, () =>
    loadCustomerReceivables(receivablesPath!),
  )

  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState<{ body: string } | null>(null)
  const onExport = async () => {
    setExporting(true)
    setExportNotice(null)
    try {
      const file = await exportCustomers({ type, search: query })
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? 'fawtir-customers.csv'
      link.click()
      URL.revokeObjectURL(url)
      if (file.truncated) setExportNotice({ body: t('customersPage.exportTruncated') })
    } catch (error) {
      setExportNotice({ body: failureText(t, error) })
    } finally {
      setExporting(false)
    }
  }

  const count = (value: number) => formatCount(value, language)

  const header = (totals: CustomerSummaryDto | null) => (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('customersPage.title')}</h1>
        {totals ? (
          <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
            {withRial(
              t('customersPage.subtitle', {
                count: totals.total,
                customers: count(totals.total),
                amount: formatAmount(totals.receivables.outstanding, totals.currencyCode, language),
              }),
            )}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {can(session, 'customer.import') ? (
          <button type="button" className={OUTLINE_BUTTON}>
            <img src={bulkUploadIcon} alt="" className="size-6" />
            {t('customersPage.bulkUpload')}
          </button>
        ) : null}
        {can(session, 'customer.export') ? (
          <button type="button" onClick={onExport} disabled={exporting} className={OUTLINE_BUTTON}>
            <img src={exportIcon} alt="" className="size-6 rotate-180" />
            {exporting ? t('customersPage.exporting') : t('customersPage.export')}
          </button>
        ) : null}
        {can(session, 'customer.manage') ? (
          <Link
            to="/customers/new"
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('customersPage.newCustomer')}
          </Link>
        ) : null}
      </div>
    </div>
  )

  if (summary.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {header(null)}
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
  const owed = new Map<string, CustomerReceivableDto>(
    receivables.read.status === 'ready' ? receivables.read.data.items.map((row) => [row.customerId, row]) : [],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      {header(totals)}
      {exportNotice ? (
        <Notice
          body={exportNotice.body}
          action={{ label: t('common.close'), onClick: () => setExportNotice(null) }}
        />
      ) : null}
      <CustomerKpiCards totals={totals} />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
          {CUSTOMER_TABS.map((entry) => {
            const active = entry.id === tab
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
                    active ? 'bg-primary-25 text-primary-800' : 'bg-primary-25 text-text-quaternary',
                  ].join(' ')}
                >
                  {count(tabCount(totals, entry.id))}
                </span>
                {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" /> : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('customersPage.searchPlaceholder')}
              aria-label={t('customersPage.searchPlaceholder')}
              maxLength={200}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <SortMenu value={sortKey} onChange={(value) => update({ sort: value === 'nameAsc' ? null : value, page: null })} />
        </div>

        {receivables.read.status === 'failed' ? (
          <div className="px-6 pb-3.5">
            <ApiReadFailure error={receivables.read.error} retry={receivables.retry} />
          </div>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : (
          <CustomerTable
            page={page}
            owed={owed}
            owedReady={receivables.read.status === 'ready'}
            currency={receivables.read.status === 'ready' ? receivables.read.data.currencyCode : totals.currencyCode}
            directoryEmpty={totals.total === 0}
            searching={query !== '' || tab !== 'all'}
          />
        )}

        {page && page.items.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <label className="flex items-center gap-4">
              <span className="text-sm font-medium text-text-muted">{t('customersPage.showResult')}</span>
              <select
                value={size}
                onChange={(event) =>
                  update({
                    size: Number(event.target.value) === DEFAULT_CUSTOMER_PAGE_SIZE ? null : event.target.value,
                    page: null,
                  })
                }
                className="h-9 rounded-sm border border-border-subtle bg-white px-2 text-sm font-semibold text-text-secondary"
              >
                {CUSTOMER_PAGE_SIZES.map((option) => (
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

function CustomerKpiCards({ totals }: { totals: CustomerSummaryDto }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const count = (value: number) => formatCount(value, language)
  const money = (value: number) => formatAmount(value, totals.currencyCode, language)
  const cards = [
    {
      id: 'receivables',
      icon: receivablesIcon,
      titleKey: 'customersPage.kpi.receivables',
      figure: money(totals.receivables.outstanding),
      withCurrency: true,
      meta: t('customersPage.kpi.receivablesMeta', {
        count: totals.receivables.customersOwing,
        customers: count(totals.receivables.customersOwing),
      }),
    },
    {
      id: 'overdue',
      icon: overdueIcon,
      titleKey: 'customersPage.kpi.overdue',
      figure: money(totals.receivables.overdue),
      withCurrency: true,
      meta: t('customersPage.kpi.overdueMeta', {
        count: totals.receivables.customersOverdue,
        customers: count(totals.receivables.customersOverdue),
      }),
    },
    {
      id: 'customers',
      icon: customersIcon,
      titleKey: 'customersPage.kpi.customers',
      figure: count(totals.total),
      withCurrency: false,
      meta: t('customersPage.kpi.customersMeta', {
        business: count(totals.byType.business),
        government: count(totals.byType.government),
        consumer: count(totals.byType.consumer),
      }),
    },
    {
      id: 'peppol',
      icon: peppolIcon,
      titleKey: 'customersPage.kpi.peppolReady',
      figure: count(totals.peppolReady),
      suffix: t('customersPage.kpi.peppolOf', { total: count(totals.peppolEligible) }),
      withCurrency: false,
      meta: t('customersPage.kpi.peppolMeta'),
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
          <div className="flex items-baseline gap-1">
            {kpi.withCurrency ? <img src={omrIcon} alt="" className="h-auto w-8 shrink-0 self-center" /> : null}
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">{kpi.figure}</p>
            {kpi.suffix ? (
              <span className="text-base font-semibold leading-[1.2] text-text-quaternary">{kpi.suffix}</span>
            ) : null}
          </div>
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{kpi.meta}</p>
        </article>
      ))}
    </div>
  )
}

function SortMenu({ value, onChange }: { value: CustomerSortKey; onChange: (value: CustomerSortKey) => void }) {
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
        {t(CUSTOMER_SORTS.find((option) => option.value === value)?.labelKey ?? 'customersPage.sort')}
      </button>
      <Popover open={open} anchorRef={anchor} onClose={() => setOpen(false)} width={220} align="end">
        <ul role="listbox" className="py-1">
          {CUSTOMER_SORTS.map((option) => (
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

function CustomerTable({
  page,
  owed,
  owedReady,
  currency,
  directoryEmpty,
  searching,
}: {
  page: Page<CustomerDto> | null
  owed: Map<string, CustomerReceivableDto>
  owedReady: boolean
  currency: string
  directoryEmpty: boolean
  searching: boolean
}) {
  const { t } = useTranslation()
  const session = useSession()
  const rows = useMemo(() => (page ? page.items.map(toCustomerListItem) : []), [page])
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))

  // Only what works today. The design's View, Statement and Delete need the customer detail
  // screen, which is not designed yet; an entry that goes nowhere is worse than none.
  const menuFor = (id: string): ActionMenuItem[] => [
    ...(can(session, 'invoice.draft')
      ? [{ id: 'newInvoice', labelKey: 'rowActions.customer.newInvoice', icon: invoiceIcon, to: '/invoices/new' }]
      : []),
    ...(can(session, 'customer.manage')
      ? [{ id: 'edit', labelKey: 'customerForm.menuEdit', icon: editIcon, to: `/customers/${id}/edit` }]
      : []),
  ]

  const message = (key: string) => (
    <tr>
      <td colSpan={8} className="py-12 text-center text-sm font-medium text-text-quaternary">
        {t(key)}
      </td>
    </tr>
  )

  return (
    <RowsView>
      <table className="w-full min-w-[1000px] border-collapse text-start">
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
                ariaLabel={t('customersPage.selectAll')}
              />
            </th>
            {(['customer', 'contact', 'location', 'peppol', 'invoices', 'receivable'] as const).map((key) => (
              <th key={key} className="px-2 py-2.5 text-start font-semibold">
                {t(`customersPage.col.${key}`)}
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
            message(directoryEmpty && !searching ? 'customersPage.emptyDirectory' : 'customersPage.empty')
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60">
                <td className="px-5 py-2.5">
                  <TableCheckbox
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                      )
                    }
                    ariaLabel={t('customersPage.selectRow', { name: row.name })}
                  />
                </td>
                <CustomerRowCells row={row} receivable={owed.get(row.id)} owedReady={owedReady} currency={currency} />
                <td className="px-2 py-2.5">
                  {menuFor(row.id).length > 0 ? <ActionMenu items={menuFor(row.id)} label={t('customersPage.rowMenu')} /> : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </RowsView>
  )
}

function NoteText({ note }: { note: Note }) {
  const { t } = useTranslation()
  return <>{t(note.key, note.values)}</>
}

function locationOf(row: CustomerListItem, language: string, t: Translate): string | null {
  let country: string | null = null
  if (row.countryCode) {
    try {
      country = new Intl.DisplayNames([language], { type: 'region' }).of(row.countryCode.toUpperCase()) ?? row.countryCode
    } catch {
      country = row.countryCode
    }
  }
  if (row.city && country) return t('customersPage.location', { city: row.city, country })
  return row.city ?? country
}

function CustomerRowCells({
  row,
  receivable,
  owedReady,
  currency,
}: {
  row: CustomerListItem
  receivable: CustomerReceivableDto | undefined
  owedReady: boolean
  currency: string
}) {
  const { t, i18n } = useTranslation()
  const peppol = PEPPOL_STYLES[row.peppol]
  const view = toReceivableView(receivable)
  const amount = AMOUNT_STYLES[view.state]
  const location = locationOf(row, i18n.language, t)

  return (
    <>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={[
              'inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm text-sm font-semibold',
              AVATAR_STYLES[row.kind],
            ].join(' ')}
          >
            {row.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold leading-[1.2] text-text-secondary">{row.name}</p>
              <span className="inline-flex items-center rounded-sm bg-neutral-25 px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                {t(`customersPage.kind.${row.kind}`)}
              </span>
            </div>
            <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
              {'parts' in row.subtitle ? (
                <>
                  <NoteText note={row.subtitle.parts[0]} /> · <NoteText note={row.subtitle.parts[1]} />
                </>
              ) : (
                <NoteText note={row.subtitle} />
              )}
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-secondary">{row.contactName ?? '—'}</p>
        {row.contactEmail ? (
          <p className="text-xs font-medium leading-[1.2] text-text-quaternary">{row.contactEmail}</p>
        ) : null}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-primary">{location ?? '—'}</td>
      <td className="px-2 py-2.5">
        <span
          className={['inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-semibold', peppol.bg, peppol.fg].join(
            ' ',
          )}
        >
          <span className={['size-1.5 shrink-0 rounded-full', peppol.dot].join(' ')} />
          {t(peppol.labelKey)}
        </span>
      </td>
      {!owedReady ? (
        <>
          <td className="px-2 py-2.5 text-sm font-medium text-text-muted" aria-busy="true">
            …
          </td>
          <td className="px-2 py-2.5 text-base font-medium text-text-muted" aria-busy="true">
            …
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-2.5 text-sm font-semibold text-text-primary">
            {t('customersPage.invoiceCount', { count: view.invoices })}
          </td>
          <td className="px-2 py-2.5">
            {view.amount !== null ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <RialMark className={['w-6 shrink-0', amount.amount].join(' ')} />
                  <span className={['text-base font-semibold leading-[1.2] tabular-nums', amount.amount].join(' ')}>
                    {formatAmount(view.amount, currency, i18n.language)}
                  </span>
                </span>
                {view.note ? (
                  <p className={['text-xs font-semibold leading-[1.2]', amount.note].join(' ')}>
                    <NoteText note={view.note} />
                  </p>
                ) : null}
              </>
            ) : (
              <span className="text-base font-medium leading-[1.2] text-text-muted">
                {view.invoices > 0 ? t('customersPage.note.settled') : '—'}
              </span>
            )}
          </td>
        </>
      )}
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
    <nav aria-label={t('customersPage.pages')} className="flex items-center">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, current - 1))}
        disabled={current <= 1}
        className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
        aria-label={t('customersPage.prevPage')}
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
        aria-label={t('customersPage.nextPage')}
      >
        <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
      </button>
    </nav>
  )
}

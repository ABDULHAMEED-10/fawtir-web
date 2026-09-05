import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover, RowsView, TableCheckbox } from '../../components/ui'
import { BulkUploadModal } from '../../components/invoice'
import { invoiceRowActions } from '../../lib/rowActions'
import {
  CHANNEL_OPTIONS,
  INVOICE_KIND_OPTIONS,
  INVOICE_KPI,
  INVOICE_ROWS,
  INVOICE_TABS,
  PERIOD_OPTIONS,
  periodEnd,
  periodStart,
  type InvoiceChannel,
  type InvoiceKind,
  type InvoiceListStatus,
  type InvoiceTabId,
  type PeriodId,
  type TransmissionState,
} from '../../lib/invoices'
import outstandingIcon from '../../assets/invoices/kpi-outstanding.svg'
import paidIcon from '../../assets/invoices/kpi-paid.svg'
import awaitingIcon from '../../assets/invoices/kpi-awaiting.svg'
import overdueIcon from '../../assets/invoices/kpi-overdue.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import bulkUploadIcon from '../../assets/invoices/bulk-upload.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KPI_ICONS = {
  outstanding: outstandingIcon,
  paid: paidIcon,
  awaiting: awaitingIcon,
  overdue: overdueIcon,
} as const

const STATUS_STYLES: Record<
  InvoiceListStatus,
  { bg: string; dot: string; text: string; labelKey: string }
> = {
  overdue: {
    bg: 'bg-danger-100',
    dot: 'bg-danger-700',
    text: 'text-danger-700',
    labelKey: 'invoicesPage.status.overdue',
  },
  awaiting: {
    bg: 'bg-warning-100',
    dot: 'bg-warning-700',
    text: 'text-warning-700',
    labelKey: 'invoicesPage.status.awaiting',
  },
  partial: {
    bg: 'bg-warning-100',
    dot: 'bg-warning-700',
    text: 'text-warning-700',
    labelKey: 'invoicesPage.status.partial',
  },
  toSend: {
    bg: 'bg-primary-25',
    dot: 'bg-primary-800',
    text: 'text-primary-800',
    labelKey: 'invoicesPage.status.toSend',
  },
  paid: {
    bg: 'bg-success-100',
    dot: 'bg-success-700',
    text: 'text-success-700',
    labelKey: 'invoicesPage.status.paid',
  },
  draft: {
    bg: 'bg-neutral-25',
    dot: 'bg-text-quaternary',
    text: 'text-text-quaternary',
    labelKey: 'invoicesPage.status.draft',
  },
}

/**
 * Figma prints the raw Peppol/OTA codes (AP / AB / RE). We spell them out instead —
 * `acknowledged` (AB) is still an acceptance, so it reads "Accepted" but in blue to
 * distinguish it from a confirmed clearance.
 */
const TRANSMISSION_STYLES: Record<
  TransmissionState,
  { bg: string; fg: string; dot: string; labelKey: string; titleKey: string }
> = {
  accepted: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    dot: 'bg-success-700',
    labelKey: 'invoicesPage.transmission.accepted',
    titleKey: 'invoicesPage.transmission.acceptedHint',
  },
  acknowledged: {
    bg: 'bg-primary-25',
    fg: 'text-primary-700',
    dot: 'bg-primary-700',
    labelKey: 'invoicesPage.transmission.acknowledged',
    titleKey: 'invoicesPage.transmission.acknowledgedHint',
  },
  rejected: {
    bg: 'bg-danger-100',
    fg: 'text-danger-700',
    dot: 'bg-danger-700',
    labelKey: 'invoicesPage.transmission.rejected',
    titleKey: 'invoicesPage.transmission.rejectedHint',
  },
}

const PAGE_SIZE = 6

type SortKey = 'issuedDesc' | 'issuedAsc' | 'amountDesc' | 'amountAsc' | 'customerAsc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'issuedDesc', label: 'Newest first' },
  { value: 'issuedAsc', label: 'Oldest first' },
  { value: 'amountDesc', label: 'Amount: high to low' },
  { value: 'amountAsc', label: 'Amount: low to high' },
  { value: 'customerAsc', label: 'Customer A–Z' },
]

/** Which list statuses each tab covers; `all` matches everything. */
const TAB_STATUSES: Record<InvoiceTabId, InvoiceListStatus[]> = {
  all: [],
  drafts: ['draft'],
  toSend: ['toSend'],
  awaiting: ['awaiting', 'partial'],
  overdue: ['overdue'],
  paid: ['paid'],
}

/** `1,204.500` → a comparable number. Display strings are the only amounts the list holds. */
const amountValue = (amount: string) => Number(amount.replace(/,/g, '')) || 0

/** `23 Jun 2026` → a sortable timestamp. */
const dateValue = (text: string) => {
  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? 0 : parsed
}

function InvoicesHeader() {
  const { t } = useTranslation()
  const [bulkOpen, setBulkOpen] = useState(false)

  return (
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
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={bulkUploadIcon} alt="" className="size-6" />
          {t('invoicesPage.bulkUpload')}
        </button>
        <BulkUploadModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('invoicesPage.export')}
        </button>
        <Link
          to="/invoices/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('invoicesPage.createInvoice')}
        </Link>
      </div>
    </div>
  )
}

function InvoiceKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {INVOICE_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={KPI_ICONS[kpi.icon]} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <img src={omrIcon} alt="" className="w-8 h-auto shrink-0" />
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {kpi.amount}
            </p>
          </div>
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{t(kpi.metaKey)}</p>
        </article>
      ))}
    </div>
  )
}

function InvoiceTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<InvoiceTabId>('all')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('issuedDesc')
  const [selected, setSelected] = useState<string[]>([])
  const [period, setPeriod] = useState<PeriodId>('thisMonth')
  const [kind, setKind] = useState<InvoiceKind | 'all'>('all')
  const [channel, setChannel] = useState<InvoiceChannel | 'all'>('all')

  /** Tab, then the toolbar filters, then free-text search, then order — the server applies the same. */
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const from = periodStart(period)
    const until = periodEnd(period)
    const filtered = INVOICE_ROWS.filter((row) => {
      const inTab = activeTab === 'all' || TAB_STATUSES[activeTab].includes(row.status)
      const issued = new Date(row.issued)
      const inPeriod = (!from || issued >= from) && (!until || issued < until)
      const inKind = kind === 'all' || row.kind === kind
      const inChannel = channel === 'all' || row.channel === channel
      const matches =
        needle === '' ||
        row.id.toLowerCase().includes(needle) ||
        row.customer.toLowerCase().includes(needle) ||
        row.subtitle.toLowerCase().includes(needle)
      return inTab && inPeriod && inKind && inChannel && matches
    })
    const ordered = [...filtered]
    ordered.sort((a, b) => {
      if (sort === 'amountDesc' || sort === 'amountAsc') {
        const diff = amountValue(a.amount) - amountValue(b.amount)
        return sort === 'amountAsc' ? diff : -diff
      }
      if (sort === 'customerAsc') return a.customer.localeCompare(b.customer)
      const diff = dateValue(a.issued) - dateValue(b.issued)
      return sort === 'issuedAsc' ? diff : -diff
    })
    return ordered
  }, [activeTab, query, sort, period, kind, channel])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const allOnPageSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && visible.some((row) => selected.includes(row.id))
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)

  /** Elide the middle when there are many pages, keeping first, last and the neighbours. */
  const pageNumbers = useMemo<(number | string)[]>(() => {
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
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
        {INVOICE_TABS.map((tab) => {
          const active = tab.id === activeTab
          const tabCount =
            tab.id === 'all'
              ? INVOICE_ROWS.length
              : INVOICE_ROWS.filter((row) => TAB_STATUSES[tab.id].includes(row.status)).length
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id)
                setPage(1)
              }}
              className={[
                'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                active
                  ? 'font-semibold text-primary-800'
                  : 'font-medium text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(tab.labelKey)}
              <span
                className={[
                  'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  tab.danger
                    ? 'bg-danger-100 text-danger-700'
                    : active
                      ? 'bg-primary-25 text-primary-800'
                      : 'bg-primary-25 text-text-quaternary',
                ].join(' ')}
              >
                {tabCount}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-md:w-full max-md:flex-none">
          <label className="flex h-11 w-full max-w-[280px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder={t('invoicesPage.searchPlaceholder')}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <FilterMenu
            label={t('invoicesPage.filters.thisMonth')}
            value={period}
            defaultValue="thisMonth"
            onChange={(value) => {
              setPeriod(value)
              setPage(1)
            }}
            options={PERIOD_OPTIONS.map((option) => ({
              value: option.id,
              label: t(option.labelKey),
            }))}
          />
          <FilterMenu
            label={t('invoicesPage.filters.invoiceType')}
            value={kind}
            defaultValue="all"
            onChange={(value) => {
              setKind(value)
              setPage(1)
            }}
            options={[
              { value: 'all' as const, label: t('invoicesPage.filters.kind.all') },
              ...INVOICE_KIND_OPTIONS.map((option) => ({
                value: option.id,
                label: t(option.labelKey),
              })),
            ]}
          />
          <FilterMenu
            label={t('invoicesPage.filters.channel')}
            value={channel}
            defaultValue="all"
            onChange={(value) => {
              setChannel(value)
              setPage(1)
            }}
            options={[
              { value: 'all' as const, label: t('invoicesPage.filters.chan.all') },
              ...CHANNEL_OPTIONS.map((option) => ({
                value: option.id,
                label: t(option.labelKey),
              })),
            ]}
          />
        </div>
        <div className="relative">
          <button
            ref={sortRef}
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {SORT_OPTIONS.find((option) => option.value === sort)?.label ??
              t('invoicesPage.filters.sort')}
          </button>
          <Popover
            open={sortOpen}
            anchorRef={sortRef}
            onClose={() => setSortOpen(false)}
            width={220}
            align="end"
          >
            <ul role="listbox" className="py-1">
              {SORT_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === sort}
                    onClick={() => {
                      setSort(option.value)
                      setSortOpen(false)
                    }}
                    className={[
                      'w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                      option.value === sort
                        ? 'font-semibold text-primary-800'
                        : 'font-medium text-text-secondary',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
      </div>

      <RowsView>
        <table className="w-full min-w-[960px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <TableCheckbox
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  onChange={() =>
                    setSelected((current) =>
                      allOnPageSelected
                        ? current.filter((id) => !visible.some((row) => row.id === id))
                        : [...new Set([...current, ...visible.map((row) => row.id)])],
                    )
                  }
                  ariaLabel={t('invoicesPage.selectAll')}
                />
              </th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.invoice')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.customer')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.issued')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.due')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.amount')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.status')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('invoicesPage.col.transmission')}</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = STATUS_STYLES[row.status]
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                  onClick={() => navigate(`/invoices/${row.id}`)}
                >
                  <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <TableCheckbox
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                      ariaLabel={t('invoicesPage.selectRow', { id: row.id })}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-sm font-semibold text-text-quaternary">
                    <Link
                      to={`/invoices/${row.id}`}
                      className="hover:text-primary-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {row.customer}
                    </p>
                    <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                      {row.subtitle}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
                    {row.issued}
                  </td>
                  <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">{row.due}</td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      <img src={omrRowIcon} alt="" className="w-6 h-auto shrink-0" />
                      <span className="text-base font-bold leading-[1.5] text-text-secondary">
                        {row.amount}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
                        status.bg,
                        status.text,
                      ].join(' ')}
                    >
                      <span className={['size-1.5 rounded-full', status.dot].join(' ')} />
                      {t(status.labelKey)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    {row.transmission ? (
                      (() => {
                        const tx = TRANSMISSION_STYLES[row.transmission]
                        return (
                          <span
                            title={t(tx.titleKey)}
                            className={[
                              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
                              tx.bg,
                              tx.fg,
                            ].join(' ')}
                          >
                            <span
                              className={['size-1.5 shrink-0 rounded-full', tx.dot].join(' ')}
                            />
                            {t(tx.labelKey)}
                          </span>
                        )
                      })()
                    ) : (
                      <span className="text-sm font-medium text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={invoiceRowActions(row.id)}
                      label={t('invoicesPage.rowMenu')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm font-medium text-text-tertiary">
            {t('invoicesPage.noResults')}
          </p>
        ) : null}
      </RowsView>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">
            {t('invoicesPage.showResult')}
          </span>
          <span className="text-sm font-medium text-text-tertiary">
            {rows.length === 0
              ? t('invoicesPage.noResults')
              : t('invoicesPage.resultCount', { count: rows.length })}
          </span>
          <button
            type="button"
            className="inline-flex h-9 w-[55px] items-center justify-between rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
          >
            6
            <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
          </button>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={current === 1}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
            aria-label={t('invoicesPage.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {pageNumbers.map((n, index) => {
            if (typeof n === 'string') {
              return (
                <span
                  key={`gap-${index}`}
                  className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
                >
                  …
                </span>
              )
            }
            const active = n === current
            return (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n as number)}
                className={[
                  'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
                  active
                    ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                    : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={current === pageCount}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
            aria-label={t('invoicesPage.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function InvoicesPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <InvoicesHeader />
        <InvoiceKpiCards />
        <InvoiceTable />
      </div>
    </AppShell>
  )
}

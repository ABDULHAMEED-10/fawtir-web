import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover, TableCheckbox } from '../../components/ui'
import { billRowActions } from '../../lib/rowActions'
import {
  BILL_KPI,
  BILL_ROWS,
  BILL_TABS,
  BILL_TAB_COUNTS,
  BILL_TAB_STATUSES,
  billAmountValue,
  billDueValue,
  type BillAction,
  type BillMatch,
  type BillSource,
  type BillStatus,
  type BillTabId,
} from '../../lib/bills'
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
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import searchIcon from '../../assets/invoices/search.svg'

const KPI_ICONS = {
  attention: kpiAttentionIcon,
  due: kpiDueIcon,
  payable: kpiPayableIcon,
  ready: kpiReadyIcon,
} as const

/** Circle behind each KPI glyph, tinted to the glyph. */
const KPI_TINTS = {
  attention: 'bg-danger-100',
  due: 'bg-primary-50',
  payable: 'bg-pending-100',
  ready: 'bg-success-100',
} as const

/** Source badge: 4px radius, not a pill — the status chips are the pills. */
const SOURCE_STYLES: Record<BillSource, { bg: string; fg: string; labelKey: string }> = {
  peppol: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    labelKey: 'billsPage.source.peppol',
  },
  uploaded: {
    bg: 'bg-[#e3e4ea]',
    fg: 'text-[#474a5e]',
    labelKey: 'billsPage.source.uploaded',
  },
  scanned: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    labelKey: 'billsPage.source.scanned',
  },
}

const STATUS_STYLES: Record<BillStatus, { bg: string; fg: string; dot: string; labelKey: string }> =
  {
    newNotReviewed: {
      bg: 'bg-primary-50',
      fg: 'text-primary-900',
      dot: 'bg-primary-900',
      labelKey: 'billsPage.status.newNotReviewed',
    },
    mismatch: {
      bg: 'bg-pending-100',
      fg: 'text-pending-700',
      dot: 'bg-pending-700',
      labelKey: 'billsPage.status.mismatch',
    },
    awaitingApprover: {
      bg: 'bg-pending-100',
      fg: 'text-pending-700',
      dot: 'bg-pending-700',
      labelKey: 'billsPage.status.awaitingApprover',
    },
    draft: {
      bg: 'bg-[#e3e4ea]',
      fg: 'text-[#474a5e]',
      dot: 'bg-[#474a5e]',
      labelKey: 'billsPage.status.draft',
    },
    onHold: {
      bg: 'bg-danger-100',
      fg: 'text-[#7a1009]',
      dot: 'bg-[#7a1009]',
      labelKey: 'billsPage.status.onHold',
    },
    approved: {
      bg: 'bg-success-100',
      fg: 'text-success-700',
      dot: 'bg-success-700',
      labelKey: 'billsPage.status.approved',
    },
    paid: {
      bg: 'bg-success-100',
      fg: 'text-success-700',
      dot: 'bg-success-700',
      labelKey: 'billsPage.status.paid',
    },
  }

const MATCH_ICONS: Record<Exclude<BillMatch, 'none'>, string> = {
  ok: matchOkIcon,
  warn: matchWarnIcon,
}

/**
 * Row action.
 *
 * Only `approve` is the filled button — it is the one action that moves the bill forward on its
 * own. The rest open something, so they read as secondary.
 */
const ACTION_STYLES: Record<
  BillAction,
  { icon: string; labelKey: string; primary?: boolean; trailingIcon?: boolean }
> = {
  approve: { icon: actApproveIcon, labelKey: 'billsPage.actions.approve', primary: true },
  reviewDifference: { icon: actEyeIcon, labelKey: 'billsPage.actions.reviewDifference' },
  nudge: { icon: actBellIcon, labelKey: 'billsPage.actions.nudge' },
  checkAndSave: { icon: actEditIcon, labelKey: 'billsPage.actions.checkAndSave' },
  viewDispute: {
    icon: actChevronIcon,
    labelKey: 'billsPage.actions.viewDispute',
    trailingIcon: true,
  },
}

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50]

type BillSortKey = 'natural' | 'dueAsc' | 'dueDesc' | 'amountDesc' | 'amountAsc' | 'supplierAsc'

const BILL_SORT_OPTIONS: { value: BillSortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'billsPage.sortOptions.natural' },
  { value: 'dueAsc', labelKey: 'billsPage.sortOptions.dueAsc' },
  { value: 'dueDesc', labelKey: 'billsPage.sortOptions.dueDesc' },
  { value: 'amountDesc', labelKey: 'billsPage.sortOptions.amountDesc' },
  { value: 'amountAsc', labelKey: 'billsPage.sortOptions.amountAsc' },
  { value: 'supplierAsc', labelKey: 'billsPage.sortOptions.supplierAsc' },
]

const SOURCE_FILTERS: { id: BillSource | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'billsPage.sourceFilter.all' },
  { id: 'peppol', labelKey: 'billsPage.source.peppol' },
  { id: 'uploaded', labelKey: 'billsPage.source.uploaded' },
  { id: 'scanned', labelKey: 'billsPage.source.scanned' },
]

function BillsHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('billsPage.title')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('billsPage.subtitle')}
        </p>
      </div>
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
    </div>
  )
}

function BillKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {BILL_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-2">
            <span
              className={[
                'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                KPI_TINTS[kpi.id],
              ].join(' ')}
            >
              <img src={KPI_ICONS[kpi.id]} alt="" className="size-6" />
            </span>
            <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>

          {'count' in kpi ? (
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {kpi.count}
            </p>
          ) : (
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {kpi.amount}
              </p>
            </div>
          )}

          <p className="text-sm font-medium leading-[1.4] text-text-tertiary">{t(kpi.metaKey)}</p>

          {'linkKey' in kpi ? (
            <button
              type="button"
              className="inline-flex w-fit items-center gap-0.5 text-base font-semibold leading-[1.2] text-primary-800 transition-colors hover:text-primary-900"
            >
              {t(kpi.linkKey)}
              <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
            </button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

/** Figma column widths, so the seven columns line up with the design at 1144. */
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

function BillTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<BillTabId>('needsAttention')
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<BillSource | 'all'>('all')
  const [sort, setSort] = useState<BillSortKey>('natural')
  const [selected, setSelected] = useState<string[]>([])
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [sizeOpen, setSizeOpen] = useState(false)
  const sizeRef = useRef<HTMLButtonElement>(null)

  /** Tab, then source, then free text, then order — the sequence the server will apply too. */
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = BILL_ROWS.filter((row) => {
      const statuses = BILL_TAB_STATUSES[activeTab]
      const inTab = statuses.length === 0 || statuses.includes(row.status)
      const inSource = source === 'all' || row.source === source
      const matches =
        needle === '' ||
        row.supplier.toLowerCase().includes(needle) ||
        row.theirBill.toLowerCase().includes(needle) ||
        (row.matchRef ?? '').toLowerCase().includes(needle)
      return inTab && inSource && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'supplierAsc') return a.supplier.localeCompare(b.supplier)
      if (sort === 'amountDesc' || sort === 'amountAsc') {
        const diff = billAmountValue(a.amount) - billAmountValue(b.amount)
        return sort === 'amountAsc' ? diff : -diff
      }
      const diff = billDueValue(a.due) - billDueValue(b.due)
      return sort === 'dueAsc' ? diff : -diff
    })
  }, [activeTab, source, query, sort])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)
  const allOnPageSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && visible.some((row) => selected.includes(row.id))

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
        {BILL_TABS.map((tab) => {
          const active = tab.id === activeTab
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
                  active ? 'bg-primary-25 text-primary-800' : 'bg-primary-25 text-text-quaternary',
                ].join(' ')}
              >
                {BILL_TAB_COUNTS[tab.id]}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            placeholder={t('billsPage.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-3">
          <FilterMenu
            label={t('billsPage.filters')}
            value={source}
            defaultValue="all"
            onChange={(value) => {
              setSource(value)
              setPage(1)
            }}
            options={SOURCE_FILTERS.map((option) => ({
              value: option.id,
              label: t(option.labelKey),
            }))}
            icon={filterIcon}
          />
          <div>
            <button
              ref={sortRef}
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
            >
              <img src={sortIcon} alt="" className="size-6" />
              {sort === 'natural'
                ? t('billsPage.sort')
                : t(BILL_SORT_OPTIONS.find((option) => option.value === sort)!.labelKey)}
            </button>
            <Popover
              open={sortOpen}
              anchorRef={sortRef}
              onClose={() => setSortOpen(false)}
              width={240}
              align="end"
            >
              <ul role="listbox" className="py-1">
                {BILL_SORT_OPTIONS.map((option) => (
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
                      {t(option.labelKey)}
                    </button>
                  </li>
                ))}
              </ul>
            </Popover>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
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
                  onChange={() =>
                    setSelected((cur) =>
                      allOnPageSelected
                        ? cur.filter((id) => !visible.some((row) => row.id === id))
                        : [...new Set([...cur, ...visible.map((row) => row.id)])],
                    )
                  }
                  ariaLabel={t('billsPage.selectAll')}
                />
              </th>
              <th className="py-2.5 pe-2 text-start font-semibold">
                {t('billsPage.col.supplier')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('billsPage.col.theirBill')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.due')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.matched')}</th>
              {/* Figma labels this "Amount" as well, which must be a copy-paste slip — the
                  column holds the status and the action, and the amount is the one after it. */}
              <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.status')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('billsPage.col.amount')}</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const status = STATUS_STYLES[row.status]
              const sourceStyle = SOURCE_STYLES[row.source]
              const action = ACTION_STYLES[row.action]
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                  onClick={() => navigate(`/expenditure/bills/${row.id}`)}
                >
                  <td className="px-5 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    <TableCheckbox
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((cur) =>
                          cur.includes(row.id)
                            ? cur.filter((id) => id !== row.id)
                            : [...cur, row.id],
                        )
                      }
                      ariaLabel={t('billsPage.selectRow', { id: row.theirBill })}
                    />
                  </td>

                  <td className="py-2.5 pe-2 align-middle">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {row.supplier}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span
                        className={[
                          'inline-flex items-center rounded-[2px] px-2 py-1 text-[10px] font-semibold uppercase leading-[1.2]',
                          sourceStyle.bg,
                          sourceStyle.fg,
                        ].join(' ')}
                      >
                        {t(sourceStyle.labelKey)}
                      </span>
                      {row.sourceNote ? (
                        <span className="text-xs font-medium leading-[1.2] text-text-tertiary">
                          {t(row.sourceNote)}
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    <Link
                      to={`/expenditure/bills/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-sm font-semibold leading-[1.2] text-primary-900 hover:underline"
                    >
                      {row.theirBill}
                    </Link>
                    <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(row.theirBillNote)}
                    </p>
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {row.due ?? t('billsPage.rows.paidOnTheDay')}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(row.dueNote)}
                    </p>
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    <div className="flex items-center gap-1.5">
                      {row.match === 'none' ? (
                        <span
                          aria-hidden="true"
                          className="flex size-5 shrink-0 items-center justify-center"
                        >
                          <span className="block h-[1.5px] w-3 rounded-full bg-text-quaternary" />
                        </span>
                      ) : (
                        <img src={MATCH_ICONS[row.match]} alt="" className="size-5 shrink-0" />
                      )}
                      <span className="text-sm font-semibold leading-[1.2] text-text-primary">
                        {row.matchRef ?? t('billsPage.rows.noOrder')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(row.matchNote)}
                    </p>
                  </td>

                  <td className="px-2 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    <span
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
                        status.bg,
                        status.fg,
                      ].join(' ')}
                    >
                      <span className={['size-1.5 rounded-full', status.dot].join(' ')} />
                      {t(status.labelKey)}
                    </span>
                    <button
                      type="button"
                      className={[
                        'mt-2 inline-flex h-[30px] items-center gap-1 rounded-sm px-2.5 text-xs font-semibold leading-[1.2] transition-colors',
                        action.primary
                          ? 'bg-primary-700 text-white hover:bg-primary-800'
                          : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                      ].join(' ')}
                    >
                      {action.trailingIcon ? null : (
                        <img src={action.icon} alt="" className="size-4 shrink-0" />
                      )}
                      {t(action.labelKey)}
                      {action.trailingIcon ? (
                        <img
                          src={action.icon}
                          alt=""
                          className="size-4 shrink-0 rtl:rotate-180"
                        />
                      ) : null}
                    </button>
                  </td>

                  <td className="px-2 py-2.5 align-middle">
                    <div className="flex items-center gap-1">
                      <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                      <p className="text-base font-semibold leading-[1.2] text-text-secondary">
                        {row.amount}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                      {t(row.amountNote)}
                    </p>
                  </td>

                  <td className="px-2 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={billRowActions(row.id)}
                      label={t('billsPage.rowMenuLabel')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm font-medium text-text-tertiary">
            {t('billsPage.empty')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">{t('billsPage.showResult')}</span>
          <button
            ref={sizeRef}
            type="button"
            onClick={() => setSizeOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={sizeOpen}
            className="inline-flex h-9 items-center justify-between gap-2 rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
          >
            {pageSize}
            <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
          </button>
          <Popover
            open={sizeOpen}
            anchorRef={sizeRef}
            onClose={() => setSizeOpen(false)}
            width={96}
          >
            <ul role="listbox" className="py-1">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <li key={size}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={size === pageSize}
                    onClick={() => {
                      setPageSize(size)
                      setPage(1)
                      setSizeOpen(false)
                    }}
                    className={[
                      'w-full px-4 py-2 text-start text-sm transition-colors hover:bg-primary-25',
                      size === pageSize
                        ? 'font-semibold text-primary-800'
                        : 'font-medium text-text-secondary',
                    ].join(' ')}
                  >
                    {size}
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={current === 1}
            aria-label={t('billsPage.prevPage')}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {pageNumbers.map((n) => {
            if (typeof n === 'string') {
              return (
                <span
                  key={`gap-${n}`}
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
                onClick={() => setPage(n)}
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
            aria-label={t('billsPage.nextPage')}
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted disabled:opacity-40"
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function BillsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <BillsHeader />
        <BillKpiCards />
        <BillTable />
      </div>
    </AppShell>
  )
}

import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover } from '../../components/ui'
import {
  ROW_ACTION,
  SUPPLIERS,
  SUPPLIER_SORTS,
  SUPPLIER_SUMMARY,
  SUPPLIER_TABS,
  countTab,
  formatOmr,
  matchesTab,
  type SupplierChannel,
  type SupplierRow,
  type SupplierSortKey,
  type SupplierTabId,
} from '../../lib/suppliers'
import { SuppliersEmptyState } from './SuppliersEmptyState'
import kpiSuppliersIcon from '../../assets/suppliers/kpi-suppliers.svg'
import kpiPeppolIcon from '../../assets/suppliers/kpi-peppol.svg'
import kpiOweIcon from '../../assets/suppliers/kpi-owe.svg'
import kpiFixIcon from '../../assets/suppliers/kpi-fix.svg'
import chipPeppolIcon from '../../assets/suppliers/chip-peppol.svg'
import chipPaperIcon from '../../assets/suppliers/chip-paper.svg'
import chipEmailIcon from '../../assets/suppliers/chip-email.svg'
import menuOrderIcon from '../../assets/suppliers/menu-order.svg'
import menuBillIcon from '../../assets/suppliers/menu-bill.svg'
import menuPayIcon from '../../assets/suppliers/menu-pay.svg'
import menuAttachIcon from '../../assets/suppliers/menu-attach.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'
import menuCopyIcon from '../../assets/suppliers/menu-copy.svg'
import menuOffIcon from '../../assets/suppliers/menu-off.svg'
import importIcon from '../../assets/bills/upload.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import prevIcon from '../../assets/invoices/chevron.svg'

const CHANNEL_CHIP: Record<SupplierChannel, { icon: string; tone: string }> = {
  peppol: { icon: chipPeppolIcon, tone: 'bg-success-100 text-[#3d5648]' },
  emailPdf: { icon: chipEmailIcon, tone: 'bg-primary-50 text-primary-800' },
  paper: { icon: chipPaperIcon, tone: 'bg-pending-100 text-pending-700' },
}

/** The dots in "their record" run dark for a complete record and amber for one with a hole. */
const SCORE_TONE: Record<number, string> = {
  4: 'bg-[#3d5648]',
  3: 'bg-pending-500',
  2: 'bg-pending-500',
  1: 'bg-warning-700',
  0: 'bg-border-default',
}

const PAGE_SIZE = 6

export function SuppliersPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SupplierTabId>('all')
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState<string>('all')
  const [sort, setSort] = useState<SupplierSortKey>('natural')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [page, setPage] = useState(1)

  /** Switching a supplier off from the row menu moves them without a round trip. */
  const [switchedOff, setSwitchedOff] = useState<string[]>([])

  const suppliers = useMemo(
    () =>
      SUPPLIERS.map((supplier) =>
        switchedOff.includes(supplier.id)
          ? { ...supplier, active: false, issue: 'switchedOff' as const, score: 0 }
          : supplier,
      ),
    [switchedOff],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = suppliers.filter((supplier) => {
      const inTab = matchesTab(supplier, activeTab)
      const inChannel = channel === 'all' || supplier.channel === channel
      const matches =
        needle === '' ||
        supplier.name.toLowerCase().includes(needle) ||
        (supplier.vat ?? '').toLowerCase().includes(needle)
      return inTab && inChannel && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'nameAsc') return a.name.localeCompare(b.name)
      return sort === 'owedAsc' ? a.owed - b.owed : b.owed - a.owed
    })
  }, [activeTab, channel, query, sort, suppliers])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const reset = () => setPage(1)

  if (SUPPLIERS.length === 0) return <SuppliersEmptyState />

  const scope =
    activeTab === 'active'
      ? t('suppliersPage.scope.active')
      : activeTab === 'switchedOff'
        ? t('suppliersPage.scope.switchedOff')
        : t('suppliersPage.scope.all')

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[720px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('suppliersPage.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('suppliersPage.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Link
              to="/suppliers/import"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={importIcon} alt="" className="size-5" />
              {t('suppliersPage.importFromExcel')}
            </Link>
            <Link
              to="/suppliers/new"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('suppliersPage.newSupplier')}
            </Link>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <img src={kpiSuppliersIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('suppliersPage.kpi.suppliers')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {SUPPLIER_SUMMARY.total}
            </p>
            <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
              {t('suppliersPage.kpi.suppliersNote', {
                active: SUPPLIER_SUMMARY.active,
                off: SUPPLIER_SUMMARY.switchedOff,
              })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-100">
                <img src={kpiPeppolIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('suppliersPage.kpi.peppol')}
              </h3>
            </div>
            <p className="mt-3 flex items-baseline gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              {SUPPLIER_SUMMARY.onPeppol}
              <span className="text-sm font-medium text-text-quaternary">
                {t('suppliersPage.kpi.peppolOf', { total: SUPPLIER_SUMMARY.active })}
              </span>
            </p>
            <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
              {t('suppliersPage.kpi.peppolNote', { count: SUPPLIER_SUMMARY.notOnPeppol })}
            </p>
          </article>

          <article className="rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <img src={kpiOweIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('suppliersPage.kpi.owe')}
              </h3>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
              <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" />
              {formatOmr(SUPPLIER_SUMMARY.owedTotal)}
            </p>
            <p className="mt-2 text-xs font-medium leading-[1.3] text-text-quaternary">
              {t('suppliersPage.kpi.oweNote', { count: SUPPLIER_SUMMARY.openBills })}
            </p>
          </article>

          <article className="rounded-md border border-pending-200 bg-pending-100 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pending-500">
                <img src={kpiFixIcon} alt="" className="size-[18px]" />
              </span>
              <h3 className="text-base font-medium leading-[1.2] text-text-secondary">
                {t('suppliersPage.kpi.needsFix')}
              </h3>
            </div>
            <p className="mt-3 text-[28px] font-semibold leading-[1.2] text-pending-700 tabular-nums">
              {SUPPLIER_SUMMARY.needsFix}
            </p>
            <p className="mt-2 text-xs font-medium leading-[1.3] text-text-tertiary">
              {t('suppliersPage.kpi.needsFixNote', {
                bank: SUPPLIER_SUMMARY.noBankDetails,
                vat: SUPPLIER_SUMMARY.missingVat,
                account: SUPPLIER_SUMMARY.changedAccount,
              })}
            </p>
          </article>
        </div>

        {/* Table */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {SUPPLIER_TABS.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id)
                    reset()
                  }}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(tab.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      isActive ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {countTab(tab.id)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center">
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
                placeholder={t('suppliersPage.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <FilterMenu
                label={t('suppliersPage.filters')}
                value={channel}
                defaultValue="all"
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('suppliersPage.allChannels') },
                  { value: 'peppol', label: t('suppliersPage.channel.peppol') },
                  { value: 'emailPdf', label: t('suppliersPage.channel.emailPdf') },
                  { value: 'paper', label: t('suppliersPage.channel.paper') },
                ]}
                onChange={(value) => {
                  setChannel(value)
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
                {t('suppliersPage.sort')}
              </button>
              <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
                <ul className="w-[220px] py-1.5">
                  {SUPPLIER_SORTS.map((option) => (
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

          <div className="overflow-x-auto px-5">
            <table className="w-full min-w-[1140px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(['supplier', 'howTheyBill', 'terms', 'youOwe', 'theirRecord'] as const).map(
                    (key, index) => (
                      <th
                        key={key}
                        className={[
                          'h-[46px] px-4 font-semibold first:rounded-s-sm',
                          index === 3 ? 'text-end' : 'text-start',
                        ].join(' ')}
                      >
                        {t(`suppliersPage.col.${key}`)}
                      </th>
                    ),
                  )}
                  <th className="h-[46px] px-4" />
                  <th className="h-[46px] rounded-e-sm px-4" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('suppliersPage.empty')}
                    </td>
                  </tr>
                ) : (
                  visible.map((supplier) => (
                    <SupplierTableRow
                      key={supplier.id}
                      supplier={supplier}
                      onSwitchOff={() => setSwitchedOff((ids) => [...ids, supplier.id])}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-sm font-medium text-text-quaternary">
                {t('suppliersPage.showing', {
                  shown: visible.length,
                  total: rows.length,
                  scope,
                })}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={prevIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
                </button>
                {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => index + 1).map(
                  (number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      className={[
                        'inline-flex size-9 items-center justify-center rounded-sm text-sm font-semibold transition-colors',
                        number === current
                          ? 'bg-primary-700 text-white'
                          : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                      ].join(' ')}
                    >
                      {number}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={current === pageCount}
                  onClick={() => setPage(current + 1)}
                  className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white disabled:opacity-40"
                >
                  <img src={prevIcon} alt="" className="size-4 rtl:rotate-180" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}

function SupplierTableRow({
  supplier,
  onSwitchOff,
}: {
  supplier: SupplierRow
  onSwitchOff: () => void
}) {
  const { t } = useTranslation()
  const chip = CHANNEL_CHIP[supplier.channel]

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-xs font-semibold text-primary-800">
            {supplier.initials}
          </span>
          <div className="min-w-0">
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="whitespace-nowrap text-sm font-semibold text-text-primary hover:text-primary-700"
            >
              {supplier.name}
            </Link>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {!supplier.active && supplier.switchedOffOn
                ? t('suppliersPage.switchedOffOn', { date: supplier.switchedOffOn })
                : supplier.vat
                  ? t('suppliersPage.vatOf', { vat: supplier.vat })
                  : t('suppliersPage.noVatOnFile')}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center gap-1.5 rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.4px]',
            chip.tone,
          ].join(' ')}
        >
          <img src={chip.icon} alt="" className="size-3" />
          {t(`suppliersPage.channel.${supplier.channel}`)}
        </span>
        <p className="mt-1.5 max-w-[170px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {supplier.channelNoteKey ? t(supplier.channelNoteKey) : supplier.peppolId}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-text-secondary">{t(supplier.termsKey)}</p>
        {supplier.termsNoteKey ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {t(supplier.termsNoteKey)}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p
          className={[
            'flex items-center justify-end gap-1 text-sm font-semibold tabular-nums',
            supplier.owed === 0 ? 'text-text-quaternary' : 'text-text-primary',
          ].join(' ')}
        >
          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
          {formatOmr(supplier.owed)}
        </p>
        <p
          className={[
            'mt-1 whitespace-nowrap text-xs font-medium',
            supplier.owedAlert ? 'text-warning-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          {t(supplier.owedNoteKey, { count: supplier.openBills })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-[3px]">
            {[0, 1, 2, 3].map((dot) => (
              <span
                key={dot}
                className={[
                  'size-[7px] rounded-[2px]',
                  dot < supplier.score ? SCORE_TONE[supplier.score] : 'bg-border-subtle',
                ].join(' ')}
              />
            ))}
          </span>
          <span className="whitespace-nowrap text-sm font-medium text-text-secondary">
            {t(`suppliersPage.record.${supplier.issue}`)}
          </span>
        </div>
        {supplier.recordNoteKey ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            {t(supplier.recordNoteKey)}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top">
        <Link
          to={`/suppliers/${supplier.slug}`}
          className="inline-flex h-[34px] items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t(ROW_ACTION[supplier.issue])}
        </Link>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <ActionMenu
          wide
          label={t('suppliersPage.rowActions')}
          items={[
            {
              id: 'newPurchaseOrder',
              sectionKey: 'suppliersPage.menu.workWithThem',
              labelKey: 'suppliersPage.menu.newPurchaseOrder',
              descriptionKey: 'suppliersPage.menu.newPurchaseOrderNote',
              icon: menuOrderIcon,
              to: `/suppliers/${supplier.slug}/purchase-order`,
            },
            {
              id: 'recordBill',
              labelKey: 'suppliersPage.menu.recordBill',
              descriptionKey: 'suppliersPage.menu.recordBillNote',
              icon: menuBillIcon,
              to: `/suppliers/${supplier.slug}/record-bill`,
            },
            {
              id: 'payNow',
              labelKey: 'suppliersPage.menu.payNow',
              descriptionKey: 'suppliersPage.menu.payNowNote',
              icon: menuPayIcon,
              to: '/expenditure/payments',
            },
            {
              id: 'attachDocument',
              sectionKey: 'suppliersPage.menu.theirRecord',
              labelKey: 'suppliersPage.menu.attachDocument',
              descriptionKey: 'suppliersPage.menu.attachDocumentNote',
              icon: menuAttachIcon,
            },
            {
              id: 'exportStatement',
              labelKey: 'suppliersPage.menu.exportStatement',
              descriptionKey: 'suppliersPage.menu.exportStatementNote',
              icon: menuStatementIcon,
              to: `/suppliers/${supplier.slug}/statement`,
            },
            {
              id: 'copyToNew',
              labelKey: 'suppliersPage.menu.copyToNew',
              descriptionKey: 'suppliersPage.menu.copyToNewNote',
              icon: menuCopyIcon,
              to: '/suppliers/new',
            },
            {
              id: 'switchOff',
              labelKey: 'suppliersPage.menu.switchOff',
              descriptionKey: 'suppliersPage.menu.switchOffNote',
              values: { count: 31 },
              icon: menuOffIcon,
              danger: true,
              onSelect: onSwitchOff,
            },
          ]}
        />
      </td>
    </tr>
  )
}

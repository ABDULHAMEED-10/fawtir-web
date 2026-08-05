import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { orderFormRowActions } from '../../lib/rowActions'
import {
  ORDER_KPI,
  ORDER_MODES,
  ORDER_PAGE_NUMBERS,
  ORDER_ROWS,
  ORDER_TABS,
  type BarTone,
  type OrderMode,
  type OrderRow,
  type OrderStatus,
  type OrderTabId,
} from '../../lib/orderForms'
import kpiOrdersIcon from '../../assets/order-forms/kpi-orders.svg'
import kpiTransitIcon from '../../assets/order-forms/kpi-transit.svg'
import kpiDeliveredIcon from '../../assets/order-forms/kpi-delivered.svg'
import kpiReceivedIcon from '../../assets/order-forms/kpi-received.svg'
import modeAllIcon from '../../assets/order-forms/mode-all.svg'
import modeSalesIcon from '../../assets/order-forms/mode-sales.svg'
import modePurchaseIcon from '../../assets/order-forms/mode-purchase.svg'
import chipSalesIcon from '../../assets/order-forms/chip-sales.svg'
import chipPurchaseIcon from '../../assets/order-forms/chip-purchase.svg'
import invoiceActionIcon from '../../assets/order-forms/invoice-action.svg'
import arrowRightIcon from '../../assets/order-forms/arrow-right.svg'
import backIcon from '../../assets/quotations/back.svg'
import exportIcon from '../../assets/quotations/export.svg'
import plusIcon from '../../assets/quotations/plus.svg'
import searchIcon from '../../assets/quotations/search.svg'
import filterIcon from '../../assets/quotations/filter.svg'
import sortIcon from '../../assets/quotations/sort.svg'
import chevronDownIcon from '../../assets/quotations/chevron-down.svg'
import chevronLeftIcon from '../../assets/quotations/chevron-left.svg'
import omrLargeIcon from '../../assets/quotations/omr-lg.svg'
import omrRowIcon from '../../assets/quotations/omr-row.svg'

const KPI_TILES = {
  orders: { icon: kpiOrdersIcon, disc: 'bg-[#f4f6fb]' },
  transit: { icon: kpiTransitIcon, disc: 'bg-[#f7f1e6]' },
  delivered: { icon: kpiDeliveredIcon, disc: 'bg-[#f4f6fb]' },
  received: { icon: kpiReceivedIcon, disc: 'bg-[#f7f1e6]' },
} as const

const MODE_ICONS: Record<OrderMode, string> = {
  all: modeAllIcon,
  sales: modeSalesIcon,
  purchase: modePurchaseIcon,
}

/** Fulfilment bar fills — the legend at the foot of the table names each one. */
const BAR_FILLS: Record<BarTone, string> = {
  invoiced: 'bg-[#2c4eb7]',
  unbilled: 'bg-[#b99a66]',
  supplierBilled: 'bg-[#595d75]',
}

const STATUS_STYLES: Record<OrderStatus, { bg: string; fg: string; labelKey: string }> = {
  readyToInvoice: {
    bg: 'bg-[#f7f1e6]',
    fg: 'text-[#6d5a39]',
    labelKey: 'orderForms.status.readyToInvoice',
  },
  awaitingSupplierBill: {
    bg: 'bg-[#f7f1e6]',
    fg: 'text-[#6d5a39]',
    labelKey: 'orderForms.status.awaitingSupplierBill',
  },
  inProgress: { bg: 'bg-[#f4f6fb]', fg: 'text-[#2c4eb7]', labelKey: 'orderForms.status.inProgress' },
  partReceived: {
    bg: 'bg-[#f3f3f3]',
    fg: 'text-[#2c3342]',
    labelKey: 'orderForms.status.partReceived',
  },
  deliveryOverdue: {
    bg: 'bg-[#fff0f0]',
    fg: 'text-[#98140b]',
    labelKey: 'orderForms.status.deliveryOverdue',
  },
  ordered: { bg: 'bg-[#f3f3f3]', fg: 'text-[#2c3342]', labelKey: 'orderForms.status.ordered' },
  completed: { bg: 'bg-[#e6efea]', fg: 'text-[#4c6c5a]', labelKey: 'orderForms.status.completed' },
}

const ACTION_STYLES = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800',
  slate: 'bg-[#595d75] text-white hover:bg-[#4a4e63]',
  outline: 'border border-[#e8e8ea] bg-white text-[#444957]',
  link: '',
} as const

function OrderFormsHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            to="/trade-documents/quotations"
            className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
          >
            {t('orderForms.breadcrumbParent')}
          </Link>
          <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
          <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
            {t('orderForms.title')}
          </h1>
        </div>
        <p className="mt-1 max-w-[564px] text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('orderForms.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6" />
          {t('orderForms.export')}
        </button>
        <Link
          to="/trade-documents/order-forms/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('orderForms.newOrderForm')}
        </Link>
      </div>
    </div>
  )
}

/** All orders / Sales orders / Purchase orders — the dual nature of an order form. */
function ModeSelector({ mode, onChange }: { mode: OrderMode; onChange: (m: OrderMode) => void }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {ORDER_MODES.map((option) => {
        const active = option.id === mode
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={[
              'flex h-[65px] items-center justify-between gap-2 rounded-sm px-4 text-start',
              active ? 'border-2 border-[#5671c5] bg-[#eaedf8]' : 'border border-[#d0d2d5] bg-white',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img src={MODE_ICONS[option.id]} alt="" className="size-6 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium leading-[1.2] text-[#0c0d34]">
                  {t(option.titleKey)}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(option.hintKey)}
                </span>
              </span>
            </span>
            <span className="text-2xl font-semibold leading-[1.2] text-[#2c3342]">
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function OrderKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {ORDER_KPI.map((kpi) => {
        const tile = KPI_TILES[kpi.icon]
        return (
          <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={[
                  'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                  tile.disc,
                ].join(' ')}
              >
                <img src={tile.icon} alt="" className="size-6" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{t(kpi.titleKey)}</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <img src={omrLargeIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-[#2c3342]">{kpi.amount}</p>
            </div>
            {kpi.split ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 shrink-0 rounded-full bg-[#233e92]" />
                  <span className="text-sm font-medium leading-[1.2] text-[#444957]">
                    {t(kpi.split.salesKey)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 shrink-0 rounded-full bg-[#a1a4ab]" />
                  <span className="text-sm font-medium leading-[1.2] text-[#444957]">
                    {t(kpi.split.purchaseKey)}
                  </span>
                </span>
              </div>
            ) : null}
            {kpi.link ? (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 self-start text-base font-semibold text-[#233e92]"
              >
                {t(kpi.link)}
                <img src={arrowRightIcon} alt="" className="size-[17px] rtl:rotate-180" />
              </button>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

/** 225px track showing how much of the order's value has moved and been billed. */
function FulfilmentBar({ row }: { row: OrderRow }) {
  if (row.barPercent === 0 && row.barText) {
    return (
      <p
        className={[
          'text-[9px] font-medium leading-[1.2]',
          row.barText.tone === 'done' ? 'text-[#4c6c5a]' : 'text-[#2c3342]',
        ].join(' ')}
      >
        {row.barText.text}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[3px]">
      <div className="h-3 w-full max-w-[225px] overflow-hidden rounded-[2px] bg-[#f3f3f3]">
        <div
          className={['h-full rounded-[2px]', BAR_FILLS[row.barTone]].join(' ')}
          style={{ width: `${row.barPercent}%` }}
        />
      </div>
      {row.barText ? (
        <p
          className={[
            'text-[9px] font-medium leading-[1.2]',
            row.barText.tone === 'done' ? 'text-[#4c6c5a]' : 'text-[#2c3342]',
          ].join(' ')}
        >
          {row.barText.text}
        </p>
      ) : null}
      {row.legend ? (
        <div className="flex items-center gap-1.5">
          {row.legend.dots.map((dot) => (
            <span key={dot} className={['size-2 shrink-0 rounded-[2px]', BAR_FILLS[dot]].join(' ')} />
          ))}
          <span className="inline-flex items-center gap-0.5">
            <img src={omrRowIcon} alt="" className="h-auto w-3.5 shrink-0" />
            <span className="text-[9px] font-semibold leading-[1.2] text-[#2c3342]">
              {row.legend.amount}
            </span>
          </span>
          <span className="text-[8px] font-semibold leading-[1.2] text-[#737781]">
            {row.legend.label}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function OrderRowCells({ row }: { row: OrderRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]

  return (
    <>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#2c3342]">{row.id}</p>
        <span
          className={[
            'mt-[3px] inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[10px] font-semibold leading-[1.2]',
            row.direction === 'sales' ? 'bg-[#f4f6fb] text-[#2c4eb7]' : 'bg-[#ededed] text-[#5b606c]',
          ].join(' ')}
        >
          <img
            src={row.direction === 'sales' ? chipSalesIcon : chipPurchaseIcon}
            alt=""
            className="size-3"
          />
          {t(
            row.direction === 'sales'
              ? 'orderForms.direction.sales'
              : 'orderForms.direction.purchase',
          )}
        </span>
        <p className="mt-[7px] text-xs font-medium leading-[1.2] text-[#5b606c]">{row.origin}</p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.party}</p>
        <p
          className={[
            'mt-1 text-xs font-medium leading-[1.2]',
            row.partyRole === 'customer' ? 'text-[#233e92]' : 'text-[#444957]',
          ].join(' ')}
        >
          {t(
            row.partyRole === 'customer' ? 'orderForms.role.customer' : 'orderForms.role.supplier',
          )}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.due}</p>
        <p
          className={[
            'mt-1 text-xs font-medium leading-[1.2]',
            row.dueTone === 'danger' ? 'text-[#98140b]' : 'text-[#444957]',
          ].join(' ')}
        >
          {row.dueNote}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <span className="inline-flex items-center gap-1">
          <img src={omrRowIcon} alt="" className="h-auto w-6 shrink-0" />
          <span className="text-base font-semibold leading-[1.2] text-[#2c3342]">{row.value}</span>
        </span>
        <p className="mt-1.5 text-xs font-semibold leading-[1.2] text-[#737781]">{row.valueNote}</p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <FulfilmentBar row={row} />
      </td>
      <td className="px-2 py-3.5 align-top">
        <span
          className={[
            'inline-flex items-center rounded-full px-3 py-[5px] text-sm font-semibold',
            status.bg,
            status.fg,
          ].join(' ')}
        >
          {t(status.labelKey)}
        </span>
        {row.action ? (
          row.action.variant === 'link' ? (
            <button
              type="button"
              className="mt-2 block text-base font-semibold text-[#233e92]"
              onClick={(e) => e.stopPropagation()}
            >
              {t(row.action.labelKey)}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={[
                'mt-2 inline-flex h-9 items-center gap-1 rounded-sm px-2.5 text-sm font-semibold',
                ACTION_STYLES[row.action.variant],
              ].join(' ')}
            >
              {row.action.icon ? (
                <img src={invoiceActionIcon} alt="" className="size-5" />
              ) : null}
              {t(row.action.labelKey)}
            </button>
          )
        ) : null}
      </td>
    </>
  )
}

function OrderFormsTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<OrderTabId>('all')
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-x-[52px] gap-y-3 px-6 pt-[17px]">
        {ORDER_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1"
            >
              <span
                className={[
                  'text-base leading-[1.2]',
                  active ? 'font-semibold text-[#233e92]' : 'font-medium text-[#5b606c]',
                ].join(' ')}
              >
                {t(tab.labelKey)}
              </span>
              <span
                className={[
                  'inline-flex h-[18px] items-center rounded-full px-1.5 text-xs font-semibold leading-[1.2]',
                  tab.tone === 'danger'
                    ? 'bg-[#fff0f0] text-[#98140b]'
                    : active
                      ? 'bg-[#f4f6fb] text-[#233e92]'
                      : 'bg-[#f4f6fb] text-[#5b606c]',
                ].join(' ')}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Filters/Sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-[27px]">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            placeholder={t('orderForms.searchPlaceholder')}
            className="w-full bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-[#8a8e96]"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('orderForms.filters')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('orderForms.sort')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-start">
          <thead>
            <tr className="bg-[#2c3342] text-start text-xs leading-[1.2] text-white">
              <th className="w-10 px-5 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t('orderForms.selectAll')}
                  className="size-[15px] rounded-[4px] border border-[#d0d2d5] bg-transparent"
                />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('orderForms.col.order')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('orderForms.col.party')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('orderForms.col.movementDue')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('orderForms.col.value')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('orderForms.col.fulfilment')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('orderForms.col.status')}</th>
              <th className="w-14 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ORDER_ROWS.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                onClick={() => navigate(`/trade-documents/order-forms/${row.id}`)}
              >
                <td className="px-5 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={t('orderForms.selectRow', { id: row.id })}
                    className="mt-6 size-[15px] rounded-[4px] border border-[#d0d2d5]"
                  />
                </td>
                <OrderRowCells row={row} />
                <td className="px-2 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={orderFormRowActions(row.id)} label={t('orderForms.rowMenu')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar legend — what each fill colour means, split by direction. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium leading-[1.2] text-[#151c2d]">
            {t('orderForms.legend.sales')}
          </span>
          <span className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <span className="h-[7px] w-[18px] rounded-[2px] bg-[#2c4eb7]" />
              <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                {t('orderForms.legend.invoiced')}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-[7px] w-[18px] rounded-[2px] bg-[#b99a66]" />
              <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                {t('orderForms.legend.deliveredNotInvoiced')}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-[7px] w-[18px] rounded-[2px] bg-[#f3f3f3]" />
              <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                {t('orderForms.legend.stillToDeliver')}
              </span>
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium leading-[1.2] text-[#151c2d]">
            {t('orderForms.legend.purchase')}
          </span>
          <span className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <span className="h-[7px] w-[18px] rounded-[2px] bg-[#595d75]" />
              <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                {t('orderForms.legend.billedBySupplier')}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-[7px] w-[18px] rounded-[2px] bg-[#b99a66]" />
              <span className="text-xs font-medium leading-[1.2] text-[#444957]">
                {t('orderForms.legend.receivedNotBilled')}
              </span>
            </span>
          </span>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-[#737781]">{t('orderForms.showResult')}</span>
          <span className="inline-flex items-center gap-2.5 rounded-sm border border-[#e8e8ea] px-3 py-2 text-sm font-semibold text-[#2c3342]">
            7
            <img src={chevronDownIcon} alt="" className="size-4" />
          </span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            aria-label={t('orderForms.prevPage')}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
          {ORDER_PAGE_NUMBERS.map((n, i) =>
            n === '...' ? (
              <span
                key={`gap-${i}`}
                className="flex size-10 items-center justify-center text-sm font-medium text-[#737781]"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(Number(n))}
                className={[
                  'flex size-10 items-center justify-center rounded-xl',
                  page === Number(n)
                    ? 'bg-[#f4f6fb] text-base font-extrabold text-[#2c4eb7]'
                    : 'text-sm font-medium text-[#737781]',
                ].join(' ')}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label={t('orderForms.nextPage')}
            onClick={() => setPage((p) => p + 1)}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function OrderFormsPage() {
  const [mode, setMode] = useState<OrderMode>('all')

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <OrderFormsHeader />
        <ModeSelector mode={mode} onChange={setMode} />
        <OrderKpiCards />
        <OrderFormsTable />
      </div>
    </AppShell>
  )
}

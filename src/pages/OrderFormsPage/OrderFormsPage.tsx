import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, RowsView, TableCheckbox } from '../../components/ui'
import { orderFormRowActions, type TradeRowAction } from '../../lib/rowActions'
import { matchesSearch, pageNumbers, selfBillGate } from '../../lib/tradeDocuments'
import { useTradeNotice } from '../../components/trade/TradeNotice'
import { useApiRead } from '../../hooks'
import {
  AGREEMENTS_PATH,
  loadAgreements,
  type AgreementDto,
} from '../../api/selfBilling/agreements'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import { muscatToday } from '../../lib/invoiceIssue'
import {
  BAR_TRACK,
  ORDER_MODES,
  ORDER_PAGE_SIZE,
  ORDER_ROWS,
  ORDER_TABS,
  inMode,
  inOrderTab,
  orderKpis,
  type BarTone,
  type OrderMode,
  type OrderRow,
  type OrderStatus,
  type OrderTabId,
} from '../../lib/orderForms'
import backIcon from '../../assets/order-forms-v2/back.svg'
import exportIcon from '../../assets/order-forms-v2/export.svg'
import plusIcon from '../../assets/order-forms-v2/plus.svg'
import modeAllIcon from '../../assets/order-forms-v2/mode-all.svg'
import modeSalesIcon from '../../assets/order-forms-v2/mode-sales.svg'
import modePurchaseIcon from '../../assets/order-forms-v2/mode-purchase.svg'
import kpiOpenIcon from '../../assets/order-forms-v2/kpi-open.svg'
import kpiTransitIcon from '../../assets/order-forms-v2/kpi-transit.svg'
import kpiDeliveredIcon from '../../assets/order-forms-v2/kpi-delivered.svg'
import kpiReceivedIcon from '../../assets/order-forms-v2/kpi-received.svg'
import linkChevronIcon from '../../assets/order-forms-v2/link-chevron.svg'
import searchIcon from '../../assets/order-forms-v2/search.svg'
import filterIcon from '../../assets/order-forms-v2/filter.svg'
import sortIcon from '../../assets/order-forms-v2/sort.svg'
import actInvoiceIcon from '../../assets/order-forms-v2/act-invoice.svg'
import actSelfBillIcon from '../../assets/order-forms-v2/act-selfbill.svg'
import actDeliverIcon from '../../assets/order-forms-v2/act-deliver.svg'
import actTickIcon from '../../assets/order-forms-v2/act-tick.svg'
import chevronDownIcon from '../../assets/order-forms-v2/chevron-down.svg'
import chevronLeftIcon from '../../assets/order-forms-v2/chevron-left.svg'
import omrIcon from '../../assets/order-forms-v2/omr.svg'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

const MODE_ICONS: Record<OrderMode, string> = {
  all: modeAllIcon,
  sales: modeSalesIcon,
  purchase: modePurchaseIcon,
}

const KPI_ICONS = {
  open: kpiOpenIcon,
  transit: kpiTransitIcon,
  delivered: kpiDeliveredIcon,
  received: kpiReceivedIcon,
} as const

/** Bar and legend fills, straight from the Figma swatches. */
const TONE_FILL: Record<BarTone, string> = {
  invoiced: 'bg-[#2c4eb7]',
  delivered: 'bg-[#b99a66]',
  supplierBilled: 'bg-[#595d75]',
}

const STATUS_STYLES: Record<
  OrderStatus,
  { bg: string; fg: string; dot: string; labelKey: string }
> = {
  readyToInvoice: {
    bg: 'bg-[#f7f1e6]',
    fg: 'text-[#6d5a39]',
    dot: 'bg-[#6d5a39]',
    labelKey: 'orderForms.status.readyToInvoice',
  },
  awaitingSupplierBill: {
    bg: 'bg-[#f7f1e6]',
    fg: 'text-[#6d5a39]',
    dot: 'bg-[#6d5a39]',
    labelKey: 'orderForms.status.awaitingSupplierBill',
  },
  inProgress: {
    bg: 'bg-[#f4f6fb]',
    fg: 'text-[#2c4eb7]',
    dot: 'bg-[#2c4eb7]',
    labelKey: 'orderForms.status.inProgress',
  },
  partReceived: {
    bg: 'bg-[#f3f3f3]',
    fg: 'text-[#2c3342]',
    dot: 'bg-[#2c3342]',
    labelKey: 'orderForms.status.partReceived',
  },
  deliveryOverdue: {
    bg: 'bg-[#fff0f0]',
    fg: 'text-[#98140b]',
    dot: 'bg-[#98140b]',
    labelKey: 'orderForms.status.deliveryOverdue',
  },
  ordered: {
    bg: 'bg-[#f3f3f3]',
    fg: 'text-[#2c3342]',
    dot: 'bg-[#2c3342]',
    labelKey: 'orderForms.status.ordered',
  },
  completed: {
    bg: 'bg-[#e6efea]',
    fg: 'text-[#4c6c5a]',
    dot: 'bg-[#4c6c5a]',
    labelKey: 'orderForms.status.completed',
  },
}

const ACTION_ICONS = {
  invoice: actInvoiceIcon,
  selfbill: actSelfBillIcon,
  deliver: actDeliverIcon,
  receipt: actTickIcon,
} as const

function Amount({
  value,
  size = 'md',
  className = '',
}: {
  value: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const mark = { xs: 'w-3.5', sm: 'w-5', md: 'w-6', lg: 'w-8' }[size]
  return (
    <span className="inline-flex items-center gap-1">
      <img src={omrIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={className}>{value}</span>
    </span>
  )
}

function OrderFormsHeader({ onUnavailable }: { onUnavailable: () => void }) {
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const { t } = useTranslation()
  // Making one needs a plan with trade documents (PL-8).
  const tradeDocumentsIncluded = usePlanIncludes('tradeDocuments')

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[564px]">
        <div className="flex flex-wrap items-center gap-2">
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
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('orderForms.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onUnavailable}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6" />
          {t('orderForms.export')}
        </button>
        {mayCreate && tradeDocumentsIncluded ? (
          <Link
            to="/trade-documents/order-forms/new"
            className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-[#2c4eb7] py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('orderForms.newOrderForm')}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

/** All orders / Sales orders / Purchase orders — 373x65 cards, selected gets a 2px brand border. */
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
            aria-pressed={active}
            className={[
              'flex h-[65px] items-center justify-between gap-2 rounded-sm px-4 text-start transition-colors',
              active
                ? 'border-2 border-[#5671c5] bg-[#eaedf8]'
                : 'border border-[#d0d2d5] bg-white',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img src={MODE_ICONS[option.id]} alt="" className="size-6 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(option.titleKey)}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(option.hintKey)}
                </span>
              </span>
            </span>
            <span className="text-2xl font-semibold leading-[1.2] text-[#2c3342]">
              {inMode(ORDER_ROWS, option.id).length}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function OrderKpiCards({ onTab }: { onTab: (tab: OrderTabId) => void }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {orderKpis(ORDER_ROWS).map((kpi) => (
        <article key={kpi.id} className="flex flex-col rounded-md bg-surface-card p-5">
          <div className="-me-5 flex items-center gap-2.5">
            <span
              className={[
                'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                kpi.disc,
              ].join(' ')}
            >
              <img src={KPI_ICONS[kpi.icon]} alt="" className="size-6" />
            </span>
            <h3 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{t(kpi.titleKey)}</h3>
          </div>
          <div className="mt-2.5">
            <Amount
              value={kpi.amount}
              size="lg"
              className="text-[32px] font-semibold leading-[1.2] text-[#2c3342]"
            />
          </div>
          {kpi.legend ? (
            <div className="-me-5 mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {kpi.legend.map((entry) => (
                <span key={entry.labelKey} className="inline-flex items-center gap-1.5">
                  <span
                    className={['size-2 shrink-0 rounded-full', TONE_FILL[entry.tone]].join(' ')}
                  />
                  <span className="whitespace-nowrap text-sm font-medium leading-[1.2] text-[#444957]">
                    {t(entry.labelKey, entry.values)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          {kpi.link ? (
            <button
              type="button"
              onClick={() => onTab(kpi.link.tab)}
              className="mt-2.5 inline-flex items-center gap-0.5 text-base font-semibold leading-[1.2] text-[#233e92]"
            >
              {t(kpi.link.labelKey, kpi.link.values)}
              <img
                src={linkChevronIcon}
                alt=""
                aria-hidden="true"
                className="size-[17px] rtl:rotate-180"
              />
            </button>
          ) : null}
        </article>
      ))}
    </div>
  )
}

/** 225px track; segments paint in order so a later blue can sit over an earlier tan. */
function FulfilmentBar({ row }: { row: OrderRow }) {
  const { t } = useTranslation()

  return (
    <div className="flex max-w-[225px] flex-col gap-[3px]">
      <div className="relative h-3 w-full overflow-hidden rounded-[2px] bg-[#f3f3f3]">
        {row.segments.map((segment, index) => (
          <span
            key={index}
            className={['absolute inset-y-0 start-0 rounded-[2px]', TONE_FILL[segment.tone]].join(
              ' ',
            )}
            style={{ width: `${(segment.width / BAR_TRACK) * 100}%` }}
          />
        ))}
      </div>
      {row.note.kind === 'amount' ? (
        <span className="flex flex-wrap items-center gap-1">
          <span className={['size-2 shrink-0 rounded-[2px]', TONE_FILL[row.note.tone]].join(' ')} />
          <Amount
            value={row.note.amount}
            size="xs"
            className="text-[9px] font-semibold leading-[1.2] text-[#2c3342]"
          />
          <span className="text-[8px] font-semibold leading-[1.2] text-[#737781]">
            {t(row.note.labelKey)}
          </span>
        </span>
      ) : row.note.kind === 'done' ? (
        <span className="inline-flex items-center gap-1">
          <img src={actTickIcon} alt="" className="size-3" />
          <span className="text-[9px] font-medium leading-[1.2] text-[#4c6c5a]">
            {t(row.note.labelKey)}
          </span>
        </span>
      ) : (
        <span className="text-[9px] font-medium leading-[1.2] text-[#2c3342]">
          {t(row.note.labelKey)}
        </span>
      )}
    </div>
  )
}

export type NextStepHandler = (row: OrderRow) => void

function NextStepButton({
  row,
  onStep,
  blocked,
}: {
  row: OrderRow
  onStep: NextStepHandler
  /** Set when the step may not be taken here (self-billing without an agreement). */
  blocked: boolean
}) {
  const { t } = useTranslation()
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const action = row.action

  if (action.kind === 'link') {
    return (
      <Link
        to={`/invoices/${action.target}`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex items-center gap-0.5 text-base font-semibold leading-[1.2] text-[#233e92]"
      >
        {t(action.labelKey, { id: action.target })}
        <img
          src={linkChevronIcon}
          alt=""
          aria-hidden="true"
          className="size-[17px] rtl:rotate-180"
        />
      </Link>
    )
  }

  // Every other step opens a composer: none while read-only.
  if (!mayCreate) return null

  const filled =
    action.kind === 'invoice'
      ? 'bg-[#2c4eb7] text-white'
      : action.kind === 'selfbill'
        ? 'bg-[#595d75] text-white'
        : 'border border-[#d0d2d5] bg-white text-[#444957]'

  return (
    <button
      type="button"
      aria-disabled={blocked || undefined}
      onClick={(event) => {
        event.stopPropagation()
        onStep(row)
      }}
      className={[
        'inline-flex h-9 items-center gap-1 rounded-sm px-2.5 text-sm font-semibold leading-[1.2] transition-opacity hover:opacity-90',
        filled,
        blocked ? 'cursor-not-allowed opacity-50 hover:opacity-50' : '',
      ].join(' ')}
    >
      <img
        src={ACTION_ICONS[action.kind]}
        alt=""
        className={['size-5', action.kind === 'receipt' ? '' : ''].join(' ')}
      />
      {t(action.labelKey)}
    </button>
  )
}

function OrderRowCells({
  row,
  onStep,
  blocked,
}: {
  row: OrderRow
  onStep: NextStepHandler
  blocked: boolean
}) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]
  const sales = row.direction === 'sales'

  return (
    <>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#2c3342]">{row.id}</p>
        <span
          className={[
            'mt-[3px] inline-flex items-center gap-1 rounded-sm px-2 py-1',
            sales ? 'bg-[#f4f6fb]' : 'bg-[#ededed]',
          ].join(' ')}
        >
          <img src={sales ? modeSalesIcon : modePurchaseIcon} alt="" className="size-3 shrink-0" />
          <span
            className={[
              'text-[10px] font-semibold uppercase leading-[1.2]',
              sales ? 'text-[#2c4eb7]' : 'text-[#5b606c]',
            ].join(' ')}
          >
            {t(sales ? 'orderForms.chip.sales' : 'orderForms.chip.purchase')}
          </span>
        </span>
        <p className="mt-1.5 text-xs font-medium leading-[1.2] text-[#5b606c]">
          {t(row.sourceKey)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.party}</p>
        <p
          className={[
            'mt-1 text-xs font-medium leading-[1.2]',
            row.partyKind === 'customer' ? 'text-[#233e92]' : 'text-[#444957]',
          ].join(' ')}
        >
          {t(
            row.partyKind === 'customer'
              ? 'orderForms.party.customer'
              : 'orderForms.party.supplier',
          )}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.due}</p>
        <p
          className={[
            'mt-1 text-xs leading-[1.2]',
            row.dueOverdue ? 'font-medium text-[#98140b]' : 'font-medium text-[#444957]',
          ].join(' ')}
        >
          {t(row.dueNoteKey)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <Amount
          value={row.value}
          size="md"
          className="text-base font-semibold leading-[1.2] text-[#2c3342]"
        />
        <p className="mt-1 text-xs font-semibold leading-[1.2] text-[#737781]">
          {t(row.valueNoteKey, row.valueNoteValues)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <FulfilmentBar row={row} />
      </td>
      <td className="px-2 py-3.5 align-top">
        <span
          className={[
            'inline-flex items-center gap-1.5 rounded-full px-3 py-[5px]',
            status.bg,
          ].join(' ')}
        >
          <span className={['size-1.5 shrink-0 rounded-full', status.dot].join(' ')} />
          <span className={['text-sm font-semibold leading-[1.2]', status.fg].join(' ')}>
            {t(status.labelKey)}
          </span>
        </span>
        <div className="mt-2">
          <NextStepButton row={row} onStep={onStep} blocked={blocked} />
        </div>
      </td>
    </>
  )
}

/** The two directions read their bars differently, so each gets its own key. */
function BarLegend() {
  const { t } = useTranslation()

  const entry = (tone: BarTone, labelKey: string) => (
    <span key={labelKey} className="inline-flex items-center gap-1">
      <span className={['h-[7px] w-[18px] shrink-0 rounded-[2px]', TONE_FILL[tone]].join(' ')} />
      <span className="text-xs font-medium leading-[1.2] text-[#444957]">{t(labelKey)}</span>
    </span>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 pb-4 pt-1">
      <span className="inline-flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium leading-[1.2] text-[#151c2d]">
          {t('orderForms.legend.sales')}
        </span>
        <span className="inline-flex flex-wrap items-center gap-4">
          {entry('invoiced', 'orderForms.legend.invoiced')}
          {entry('delivered', 'orderForms.legend.deliveredNotInvoiced')}
          <span className="inline-flex items-center gap-1">
            <span className="h-[7px] w-[18px] shrink-0 rounded-[2px] bg-[#f3f3f3]" />
            <span className="text-xs font-medium leading-[1.2] text-[#444957]">
              {t('orderForms.legend.stillToDeliver')}
            </span>
          </span>
        </span>
      </span>
      <span aria-hidden="true" className="hidden h-[18px] w-px bg-[#f3f3f3] lg:block" />
      <span className="inline-flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium leading-[1.2] text-[#151c2d]">
          {t('orderForms.legend.purchase')}
        </span>
        <span className="inline-flex flex-wrap items-center gap-4">
          {entry('supplierBilled', 'orderForms.legend.billedBySupplier')}
          {entry('delivered', 'orderForms.legend.receivedNotBilled')}
        </span>
      </span>
    </div>
  )
}

function OrderFormsTable({
  mode,
  activeTab,
  setActiveTab,
  onUnavailable,
  onAction,
  onStep,
  isBlocked,
}: {
  mode: OrderMode
  activeTab: OrderTabId
  setActiveTab: (tab: OrderTabId) => void
  onUnavailable: () => void
  onAction: TradeRowAction
  onStep: NextStepHandler
  isBlocked: (row: OrderRow) => boolean
}) {
  const { t } = useTranslation()
  // Nothing new is made while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayCreate = useSubscriptionAllows('CREATE_DRAFTS')
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  // TODO(backend): TRADE_DOCUMENTS.md rows T.1 and T.7: the rows are the page's own data.
  const inView = inMode(ORDER_ROWS, mode)
  const rows = inOrderTab(inView, activeTab).filter((row) =>
    matchesSearch(search, row.id, row.party, t(row.sourceKey)),
  )
  const pages = pageNumbers(rows.length, ORDER_PAGE_SIZE)

  const toggleRow = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id))

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-4 pt-4">
        {ORDER_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id)
                setPage(1)
              }}
              aria-pressed={active}
              className={[
                'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                active
                  ? 'font-semibold text-[#233e92]'
                  : 'font-medium text-[#5b606c] hover:text-text-secondary',
              ].join(' ')}
            >
              {t(tab.labelKey)}
              <span
                className={[
                  'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  tab.danger ? 'bg-[#fff0f0] text-[#98140b]' : 'bg-[#f4f6fb]',
                  tab.danger ? '' : active ? 'text-[#233e92]' : 'text-[#5b606c]',
                ].join(' ')}
              >
                {inOrderTab(inView, tab.id).length}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#233e92]" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('orderForms.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-[#8a8e96]"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onUnavailable}
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('orderForms.filters')}
          </button>
          <button
            type="button"
            onClick={onUnavailable}
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('orderForms.sort')}
          </button>
        </div>
      </div>

      <RowsView>
        <table className="w-full min-w-[1124px] table-fixed border-collapse text-start">
          {/* Column widths straight from Figma so the 225px fulfilment track is not squeezed. */}
          <colgroup>
            <col className="w-[45px]" />
            <col className="w-[152px]" />
            <col className="w-[186px]" />
            <col className="w-[126px]" />
            <col className="w-[147px]" />
            <col className="w-[257px]" />
            <col className="w-[193px]" />
            <col className="w-[44px]" />
          </colgroup>
          <thead>
            <tr className="bg-[#2c3342]">
              <th className="px-4 py-2.5 text-start">
                <TableCheckbox
                  checked={allSelected}
                  onChange={toggleAll}
                  indeterminate={selected.length > 0 && !allSelected}
                  ariaLabel={t('orderForms.selectAll')}
                />
              </th>
              {[
                'orderForms.columns.order',
                'orderForms.columns.party',
                'orderForms.columns.movementDue',
                'orderForms.columns.orderValue',
                'orderForms.columns.fulfilment',
                'orderForms.columns.statusNextStep',
              ].map((key) => (
                <th
                  key={key}
                  className="px-2 py-2.5 text-start text-xs font-semibold uppercase leading-[1.2] text-white"
                >
                  {t(key)}
                </th>
              ))}
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm font-medium text-[#737781]">
                  {t('tradeDocs.empty')}
                </td>
              </tr>
            ) : null}
            {rows.slice((page - 1) * ORDER_PAGE_SIZE, page * ORDER_PAGE_SIZE).map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                onClick={() => navigate(`/trade-documents/order-forms/${row.id}`)}
              >
                <td className="px-4 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <TableCheckbox
                    checked={selected.includes(row.id)}
                    onChange={() => toggleRow(row.id)}
                    ariaLabel={t('orderForms.selectRow', { id: row.id })}
                  />
                </td>
                <OrderRowCells row={row} onStep={onStep} blocked={isBlocked(row)} />
                <td className="px-2 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={orderFormRowActions(row.id, onAction, mayCreate)}
                    label={t('orderForms.rowMenu')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>

      <BarLegend />

      <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-4">
        <label className="flex items-center gap-4 text-sm font-medium text-[#737781]">
          {t('orderForms.showResult')}
          <span className="inline-flex h-[33px] items-center gap-2.5 rounded-sm border border-[#e8e8ea] px-3 text-sm font-semibold text-[#2c3342]">
            {ORDER_PAGE_SIZE}
            <img src={chevronDownIcon} alt="" className="size-4" />
          </span>
        </label>
        <nav className="flex items-center" aria-label={t('orderForms.pagination')}>
          <button
            type="button"
            aria-label={t('orderForms.previous')}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
          {pages.map((label, index) =>
            label === '...' ? (
              <span
                key={`gap-${index}`}
                className="flex size-10 items-center justify-center text-sm font-medium text-[#737781]"
              >
                …
              </span>
            ) : (
              <button
                key={label}
                type="button"
                onClick={() => setPage(Number(label))}
                aria-current={page === Number(label) ? 'page' : undefined}
                className={[
                  'flex size-10 items-center justify-center rounded-xl',
                  page === Number(label)
                    ? 'bg-[#f4f6fb] text-base font-extrabold text-[#2c4eb7]'
                    : 'text-sm font-medium text-[#737781]',
                ].join(' ')}
              >
                {label}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label={t('orderForms.next')}
            onClick={() => setPage((p) => Math.min(pages.length, p + 1))}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
        </nav>
      </div>
    </section>
  )
}

export function OrderFormsPage() {
  return (
    <AppShell>
      <OrderForms />
    </AppShell>
  )
}

/** Inside the shell, where the session is: what the reader may see decides the self-billing check. */
function OrderForms() {
  const [mode, setMode] = useState<OrderMode>('all')
  const [activeTab, setActiveTab] = useState<OrderTabId>('all')
  const navigate = useNavigate()
  const notice = useTradeNotice()
  const session = useSession()
  const today = muscatToday()
  const canSeeAgreements = can(session, 'selfbilling.agreement.manage')
  const agreementsRead = useApiRead<AgreementDto[]>(
    canSeeAgreements ? AGREEMENTS_PATH : null,
    loadAgreements,
  )
  const agreements = !canSeeAgreements
    ? null
    : agreementsRead.read.status === 'ready'
      ? agreementsRead.read.data
      : []
  const gateFor = (row: OrderRow) => selfBillGate(row.counterpartyId, agreements, today)

  const onStep: NextStepHandler = (row) => {
    const action = row.action
    if (action.kind === 'invoice') navigate(`/invoices/new?from=${encodeURIComponent(row.id)}`)
    else if (action.kind === 'deliver')
      navigate(`/trade-documents/delivery-notes/new?order=${encodeURIComponent(row.id)}`)
    else if (action.kind === 'receipt')
      navigate(
        `/trade-documents/delivery-notes/new?type=purchase&order=${encodeURIComponent(row.id)}`,
      )
    else if (action.kind === 'selfbill') {
      // Only under a signed, active self-billing agreement with this supplier (handbook 5.1).
      const gate = gateFor(row)
      if (gate.allowed) navigate('/expenditure/self-billing/new')
      else notice.show(gate.reasonKey, gate.values)
    }
  }
  const onAction: TradeRowAction = (itemId, documentId) => {
    if (itemId === 'invoice') navigate(`/invoices/new?from=${encodeURIComponent(documentId)}`)
    else if (itemId === 'delivery')
      navigate(`/trade-documents/delivery-notes/new?order=${encodeURIComponent(documentId)}`)
    else notice.unavailable()
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <OrderFormsHeader onUnavailable={notice.unavailable} />
        <ModeSelector
          mode={mode}
          onChange={(next) => {
            setMode(next)
            setActiveTab('all')
          }}
        />
        <OrderKpiCards onTab={setActiveTab} />
        {notice.node}
        <OrderFormsTable
          mode={mode}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onUnavailable={notice.unavailable}
          onAction={onAction}
          onStep={onStep}
          isBlocked={(row) => row.action.kind === 'selfbill' && !gateFor(row).allowed}
        />
      </div>
    </>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { deliveryNoteRowActions } from '../../lib/rowActions'
import {
  DELIVERY_KPI,
  DELIVERY_MODES,
  DELIVERY_PAGE_NUMBERS,
  DELIVERY_ROWS,
  DELIVERY_TABS,
  type DeliveryMode,
  type DeliveryRow,
  type DeliveryTabId,
  type ProofKind,
} from '../../lib/deliveryNotes'
import { type OrderStatus } from '../../lib/orderForms'
import backIcon from '../../assets/order-forms-v2/back.svg'
import exportIcon from '../../assets/order-forms-v2/export.svg'
import plusIcon from '../../assets/order-forms-v2/plus.svg'
import modeAllIcon from '../../assets/order-forms-v2/mode-all.svg'
import modeSalesIcon from '../../assets/order-forms-v2/mode-sales.svg'
import modePurchaseIcon from '../../assets/order-forms-v2/mode-purchase.svg'
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
import kpiMoveIcon from '../../assets/delivery-notes-v2/kpi-move.svg'
import kpiNoProofIcon from '../../assets/delivery-notes-v2/kpi-noproof.svg'
import kpiDeliveredIcon from '../../assets/delivery-notes-v2/kpi-delivered.svg'
import kpiShortIcon from '../../assets/delivery-notes-v2/kpi-short.svg'
import proofSignedIcon from '../../assets/delivery-notes-v2/proof-signed.svg'
import proofCheckIcon from '../../assets/delivery-notes-v2/proof-check.svg'
import proofClockIcon from '../../assets/delivery-notes-v2/proof-clock.svg'
import proofXIcon from '../../assets/delivery-notes-v2/proof-x.svg'
import proofCameraIcon from '../../assets/delivery-notes-v2/proof-camera.svg'

const MODE_ICONS: Record<DeliveryMode, string> = {
  all: modeAllIcon,
  sales: modeSalesIcon,
  purchase: modePurchaseIcon,
}

const KPI_ICONS = {
  move: kpiMoveIcon,
  noproof: kpiNoProofIcon,
  delivered: kpiDeliveredIcon,
  short: kpiShortIcon,
} as const

/** Each proof outcome has its own disc fill, border and glyph. */
const PROOF_STYLES: Record<ProofKind, { ring: string; icon: string; danger?: boolean }> = {
  signed: { ring: 'border-[#e8e8ea] bg-transparent', icon: proofSignedIcon },
  check: { ring: 'border-[#b7c4bd] bg-[#e6efea]', icon: proofCheckIcon },
  clock: { ring: 'border-[#d0d2d5] bg-[#f3f4f5]', icon: proofClockIcon },
  short: { ring: 'border-[#d6a19d] bg-[#fff0f0]', icon: proofXIcon, danger: true },
  unsigned: { ring: 'border-[#e8e8ea] bg-[#f3f4f5]', icon: proofXIcon },
  photo: { ring: 'border-[#d0d2d5] bg-transparent', icon: proofCameraIcon },
  awaiting: { ring: 'border-[#d0d2d5] bg-[#f3f4f5]', icon: proofClockIcon },
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

function DeliveryNotesHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[790px]">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/trade-documents/quotations"
            className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
          >
            {t('deliveryNotes.breadcrumbParent')}
          </Link>
          <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
          <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
            {t('deliveryNotes.title')}
          </h1>
        </div>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('deliveryNotes.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6" />
          {t('deliveryNotes.export')}
        </button>
        <Link
          to="/trade-documents/delivery-notes/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-[#2c4eb7] py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('deliveryNotes.newDeliveryNote')}
        </Link>
      </div>
    </div>
  )
}

function ModeSelector({
  mode,
  onChange,
}: {
  mode: DeliveryMode
  onChange: (m: DeliveryMode) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {DELIVERY_MODES.map((option) => {
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
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Counts, not amounts — these cards are 209px tall and carry no currency mark. */
function DeliveryKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {DELIVERY_KPI.map((kpi) => (
        <article
          key={kpi.id}
          className="flex min-h-[209px] flex-col rounded-md bg-surface-card p-5"
        >
          <div className="-me-5 flex items-center gap-2.5">
            <span
              className={[
                'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                kpi.disc,
              ].join(' ')}
            >
              <img src={KPI_ICONS[kpi.icon]} alt="" className="size-6" />
            </span>
            <h3 className="whitespace-nowrap text-xl font-medium leading-[1.2] text-[#2c3342]">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <p className="mt-2.5 text-[32px] font-semibold leading-[1.2] text-[#2c3342]">
            {kpi.count}
          </p>
          {'legend' in kpi && kpi.legend ? (
            <div className="mt-2.5 flex items-center gap-3">
              {kpi.legend.map((entry) => (
                <span key={entry.labelKey} className="inline-flex items-center gap-1.5">
                  <span
                    className={[
                      'size-2 shrink-0 rounded-full',
                      entry.tone === 'out' ? 'bg-[#2c4eb7]' : 'bg-[#a9adb4]',
                    ].join(' ')}
                  />
                  <span className="whitespace-nowrap text-sm font-medium leading-[1.2] text-[#444957]">
                    {t(entry.labelKey)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
          {'noteKey' in kpi && kpi.noteKey ? (
            <p className="mt-2.5 text-sm font-medium leading-[1.2] text-[#444957]">
              {t(kpi.noteKey)}
            </p>
          ) : null}
          {'link' in kpi && kpi.link ? (
            <Link
              to={kpi.link.to}
              className="mt-2.5 inline-flex items-center gap-0.5 text-base font-semibold leading-[1.2] text-[#233e92]"
            >
              {t(kpi.link.labelKey)}
              <img
                src={linkChevronIcon}
                alt=""
                aria-hidden="true"
                className="size-[17px] rtl:rotate-180"
              />
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function NextStepButton({ row }: { row: DeliveryRow }) {
  const { t } = useTranslation()
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

  const filled =
    action.kind === 'invoice'
      ? 'bg-[#2c4eb7] text-white'
      : action.kind === 'selfbill'
        ? 'bg-[#595d75] text-white'
        : 'border border-[#d0d2d5] bg-white text-[#444957]'

  return (
    <button
      type="button"
      onClick={(event) => event.stopPropagation()}
      className={[
        'inline-flex h-9 items-center gap-1 rounded-sm px-2.5 text-sm font-semibold leading-[1.2] transition-opacity hover:opacity-90',
        filled,
      ].join(' ')}
    >
      <img src={ACTION_ICONS[action.kind]} alt="" className="size-5" />
      {t(action.labelKey)}
    </button>
  )
}

function DeliveryRowCells({ row }: { row: DeliveryRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]
  const proof = PROOF_STYLES[row.proof]
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
            'mt-1 text-xs font-medium leading-[1.2]',
            row.dueOverdue ? 'text-[#98140b]' : 'text-[#444957]',
          ].join(' ')}
        >
          {t(row.dueNoteKey)}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <p className="text-base font-semibold leading-[1.2] text-[#2c3342]">{row.lines}</p>
        <p
          className={[
            'mt-1 text-xs font-semibold leading-[1.2]',
            row.quantitiesAlert ? 'text-[#98140b]' : 'text-[#737781]',
          ].join(' ')}
        >
          {row.quantities}
        </p>
      </td>
      <td className="px-2 py-3.5 align-top">
        <div className="flex items-start gap-[7px]">
          <span
            className={[
              'flex size-[47px] shrink-0 items-center justify-center rounded-full border',
              proof.ring,
            ].join(' ')}
          >
            <img src={proof.icon} alt="" className="size-[19px]" />
          </span>
          <span className="min-w-0 pt-1">
            <span
              className={[
                'block text-base font-semibold leading-[1.2]',
                proof.danger ? 'text-[#98140b]' : 'text-[#2c3342]',
              ].join(' ')}
            >
              {t(row.proofTitleKey)}
            </span>
            <span className="mt-1 block text-xs font-semibold leading-[1.2] text-[#737781]">
              {t(row.proofNoteKey)}
            </span>
          </span>
        </div>
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
          <NextStepButton row={row} />
        </div>
      </td>
    </>
  )
}

function DeliveryNotesTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<DeliveryTabId>('all')
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-4 pt-4">
        {DELIVERY_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
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
                  tab.danger
                    ? 'bg-[#fff0f0] text-[#98140b]'
                    : active
                      ? 'bg-[#f4f6fb] text-[#233e92]'
                      : 'bg-[#f4f6fb] text-[#5b606c]',
                ].join(' ')}
              >
                {tab.count}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-[#233e92]" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            placeholder={t('deliveryNotes.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-[#8a8e96]"
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1124px] table-fixed border-collapse text-start">
          {/* Figma column widths — the proof column is 201 wide, wider than order forms. */}
          <colgroup>
            <col className="w-[45px]" />
            <col className="w-[152px]" />
            <col className="w-[186px]" />
            <col className="w-[126px]" />
            <col className="w-[147px]" />
            <col className="w-[201px]" />
            <col className="w-[193px]" />
            <col className="w-[44px]" />
          </colgroup>
          <thead>
            <tr className="bg-[#2c3342]">
              <th className="px-4 py-2.5 text-start">
                <input
                  type="checkbox"
                  aria-label={t('deliveryNotes.selectAll')}
                  className="size-[15px] rounded-[4px] border border-[#d0d2d5] bg-transparent"
                />
              </th>
              {[
                'orderForms.columns.order',
                'orderForms.columns.party',
                'orderForms.columns.movementDue',
                'deliveryNotes.columns.whatMoved',
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
            {DELIVERY_ROWS.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                onClick={() => navigate(`/trade-documents/delivery-notes/${row.id}`)}
              >
                <td className="px-4 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={t('deliveryNotes.selectRow', { id: row.id })}
                    className="mt-1 size-[15px] rounded-[4px] border border-[#d0d2d5]"
                  />
                </td>
                <DeliveryRowCells row={row} />
                <td className="px-2 py-3.5 align-top" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={deliveryNoteRowActions(row.id)}
                    label={t('deliveryNotes.rowMenu')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-3">
        <label className="flex items-center gap-4 text-sm font-medium text-[#737781]">
          {t('orderForms.showResult')}
          <span className="inline-flex h-[33px] items-center gap-2.5 rounded-sm border border-[#e8e8ea] px-3 text-sm font-semibold text-[#2c3342]">
            6
            <img src={chevronDownIcon} alt="" className="size-4" />
          </span>
        </label>
        <nav className="flex items-center" aria-label={t('orderForms.pagination')}>
          <button
            type="button"
            aria-label={t('orderForms.previous')}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
          {DELIVERY_PAGE_NUMBERS.map((label, index) =>
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
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
        </nav>
      </div>
    </section>
  )
}

export function DeliveryNotesPage() {
  const [mode, setMode] = useState<DeliveryMode>('all')

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <DeliveryNotesHeader />
        <ModeSelector mode={mode} onChange={setMode} />
        <DeliveryKpiCards />
        <DeliveryNotesTable />
      </div>
    </AppShell>
  )
}

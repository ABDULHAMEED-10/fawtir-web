import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField, withRial } from '../../components/ui'
import { SectionCard, ToggleRow } from '../../components/form'
import {
  calculateInvoice,
  formatAtScale,
  projectInvoice,
  type DiscountType,
} from '../../lib/invoiceMath'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import { formatOmr } from '../../lib/suppliers'
import chevronIcon from '../../assets/invoices/chevron.svg'
import tickIcon from '../../assets/supplier-credit-notes/act-set.svg'
import checkIcon from '../../assets/bill-detail/tick.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const SHELL = 'border-primary-300 bg-surface-tab-bar'
const READONLY = 'border-border-subtle bg-surface-background'

type BillLine = { id: string; item: string; qty: string; unit: string; price: string; vat: string }

const CATALOG = ['Green beans', 'Jute sacks - 25 kg', 'Roasting service']

const INITIAL_LINES: BillLine[] = [
  { id: 'l1', item: CATALOG[0], qty: '240', unit: 'KG', price: '7.400', vat: '5%' },
  { id: 'l2', item: CATALOG[1], qty: '10', unit: 'EA', price: '1.850', vat: '5%' },
]

/** The orders this bill could be settling. */
const ORDERS = [
  {
    id: 'PO-0033',
    placed: '18 Jul',
    noteKey: 'recordBill.order.receivedInFull',
    amount: 1876.4,
    stateKey: 'recordBill.order.waitingForBill',
  },
  {
    id: 'PO-0034',
    placed: '30 Jul',
    noteKey: 'recordBill.order.sentThisMorning',
    amount: 3140.55,
    stateKey: 'recordBill.order.notDelivered',
  },
]

const AFTER = ['approves', 'joinsRun', 'orderCloses']

export function RecordSupplierBillPage() {
  const { t } = useTranslation()
  const supplier = SUPPLIER_DETAIL

  const [billNumber, setBillNumber] = useState('MR-INV-8844')
  const [billDate, setBillDate] = useState('2026-07-30')
  const [paymentDue, setPaymentDue] = useState('2026-08-29')
  const [against, setAgainst] = useState<string>('PO-0033')
  const [lines, setLines] = useState<BillLine[]>(INITIAL_LINES)
  const [straightToApproval, setStraightToApproval] = useState(true)

  const totals = useMemo(() => {
    const engineLines = lines.map((line, index) => ({
      id: line.id,
      lineNumber: index + 1,
      unitPrice: line.price || '0',
      quantity: line.qty || '0',
      vatRate: line.vat.replace('%', '') || '0',
      discountType: 'PERCENTAGE' as DiscountType,
      discountValue: '0',
    }))
    const projected = projectInvoice(calculateInvoice(engineLines, 'PERCENTAGE', '0'))
    return {
      net: formatAtScale(projected.taxable),
      vat: formatAtScale(projected.vat),
      total: formatAtScale(projected.total),
      totalValue: Number(formatAtScale(projected.total).replace(/,/g, '')),
    }
  }, [lines])

  const chosenOrder = ORDERS.find((order) => order.id === against)

  /** Taking the 2% inside seven days, worked out rather than printed. */
  const earlySaving = Math.round(totals.totalValue * 0.02 * 1000) / 1000

  const lineTotal = (line: BillLine) =>
    ((Number(line.qty.replace(/,/g, '')) || 0) * (Number(line.price) || 0)).toLocaleString(
      'en-US',
      {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      },
    )

  const update = (id: string, patch: Partial<BillLine>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/suppliers"
                className="text-base font-medium text-text-quaternary hover:text-primary-700"
              >
                {t('suppliersPage.title')}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
              <Link
                to={`/suppliers/${supplier.slug}`}
                className="text-base font-medium text-text-quaternary hover:text-primary-700"
              >
                {supplier.name}
              </Link>
              <img src={chevronIcon} alt="" aria-hidden="true" className="size-4 rtl:rotate-180" />
              <span className="text-base font-semibold text-text-primary">
                {t('recordBill.title')}
              </span>
            </div>
            <h1 className="mt-1.5 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('recordBill.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('recordBill.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('recordBill.discard')}
            </Link>
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={tickIcon} alt="" className="size-4" />
              {t('recordBill.sendForApproval')}
            </Link>
          </div>
        </div>

        {/* Supplier strip */}
        <section className="flex flex-wrap items-center justify-between gap-6 rounded-md border border-primary-300 bg-primary-25 p-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
              {supplier.initials}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-[1.2] text-text-primary">
                {supplier.name}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.3] text-text-tertiary">
                {t('recordBill.supplierNote', { vat: supplier.vat })}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap items-center gap-8">
            {[
              { key: 'terms', value: t('supplierDetail.net30Days') },
              { key: 'earlySettlement', value: t('supplierDetail.twoPercentSeven') },
              { key: 'openOrders', value: String(ORDERS.length) },
            ].map((entry) => (
              <div key={entry.key}>
                <dt className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                  {t(`recordBill.${entry.key}`)}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-text-primary">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <SectionCard step={1} title={t('recordBill.theirBill')}>
              <div className="grid gap-4 md:grid-cols-3">
                <Labelled label={t('recordBill.billNumber')} required>
                  <input
                    value={billNumber}
                    onChange={(event) => setBillNumber(event.target.value)}
                    aria-label={t('recordBill.billNumber')}
                    className={[
                      'h-[50px] w-full rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SHELL,
                    ].join(' ')}
                  />
                </Labelled>
                <Labelled label={t('recordBill.billDate')} required>
                  <DateField
                    value={billDate}
                    onChange={setBillDate}
                    ariaLabel={t('recordBill.billDate')}
                  />
                </Labelled>
                <Labelled label={t('recordBill.paymentDue')} required>
                  <DateField
                    value={paymentDue}
                    onChange={setPaymentDue}
                    ariaLabel={t('recordBill.paymentDue')}
                  />
                </Labelled>
              </div>
            </SectionCard>

            <SectionCard step={2} title={t('recordBill.whichOrder')}>
              <div className="flex flex-col gap-2.5" role="radiogroup">
                {ORDERS.map((order) => {
                  const active = against === order.id
                  return (
                    <button
                      key={order.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setAgainst(order.id)}
                      className={[
                        'flex items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                        active
                          ? 'border-primary-700 bg-primary-25'
                          : 'border-border-subtle bg-white hover:border-primary-300',
                      ].join(' ')}
                    >
                      <Radio active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                          {t('recordBill.orderPlaced', { id: order.id, date: order.placed })}
                        </span>
                        <span className="mt-1 block text-xs font-medium leading-[1.4] text-text-quaternary">
                          {t(order.noteKey)}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                          {formatOmr(order.amount)}
                        </span>
                        <span className="mt-1 block whitespace-nowrap text-xs font-medium text-text-quaternary">
                          {t(order.stateKey)}
                        </span>
                      </span>
                    </button>
                  )
                })}

                <button
                  type="button"
                  role="radio"
                  aria-checked={against === 'none'}
                  onClick={() => setAgainst('none')}
                  className={[
                    'flex items-center gap-3 rounded-sm border p-4 text-start transition-colors',
                    against === 'none'
                      ? 'border-primary-700 bg-primary-25'
                      : 'border-border-subtle bg-white hover:border-primary-300',
                  ].join(' ')}
                >
                  <Radio active={against === 'none'} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-[1.3] text-text-primary">
                      {t('recordBill.noOrder')}
                    </span>
                    <span className="mt-1 block text-xs font-medium leading-[1.4] text-text-quaternary">
                      {t('recordBill.noOrderNote')}
                    </span>
                  </span>
                </button>
              </div>
            </SectionCard>

            <SectionCard step={3} title={t('recordBill.whatCharging')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                      {(['item', 'quantity', 'unitPrice', 'vat', 'lineTotal'] as const).map(
                        (key, index) => (
                          <th
                            key={key}
                            className={[
                              'pb-2 font-semibold',
                              index === 0 ? 'text-start' : 'text-end',
                            ].join(' ')}
                          >
                            {t(`purchaseOrder.col.${key}`)}
                          </th>
                        ),
                      )}
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id}>
                        <td className="py-1.5 pe-2">
                          <div className="relative">
                            <select
                              value={line.item}
                              onChange={(event) => update(line.id, { item: event.target.value })}
                              aria-label={t('purchaseOrder.col.item')}
                              className={[
                                'h-[46px] w-full appearance-none rounded-sm border px-3 pe-9 text-sm font-medium text-text-secondary outline-none',
                                SHELL,
                              ].join(' ')}
                            >
                              {CATALOG.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                            <img
                              src={chevronIcon}
                              alt=""
                              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 rotate-90"
                            />
                          </div>
                        </td>
                        <td className="px-1 py-1.5">
                          <div className="relative">
                            <input
                              value={line.qty}
                              inputMode="decimal"
                              onChange={(event) => update(line.id, { qty: event.target.value })}
                              aria-label={t('purchaseOrder.col.quantity')}
                              className={[
                                'h-[46px] w-[122px] rounded-sm border ps-3 pe-12 text-end text-sm font-medium text-text-secondary outline-none',
                                SHELL,
                              ].join(' ')}
                            />
                            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-medium text-text-quaternary">
                              {line.unit}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            value={line.price}
                            inputMode="decimal"
                            onChange={(event) => update(line.id, { price: event.target.value })}
                            aria-label={t('purchaseOrder.col.unitPrice')}
                            className={[
                              'h-[46px] w-[92px] rounded-sm border px-3 text-end text-sm font-medium text-text-secondary outline-none',
                              SHELL,
                            ].join(' ')}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            value={line.vat}
                            onChange={(event) => update(line.id, { vat: event.target.value })}
                            aria-label={t('purchaseOrder.col.vat')}
                            className={[
                              'h-[46px] w-[64px] rounded-sm border px-2 text-end text-sm font-medium text-text-secondary outline-none',
                              SHELL,
                            ].join(' ')}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <span
                            className={[
                              'flex h-[46px] w-[110px] items-center justify-end rounded-sm border px-3 text-sm font-semibold text-text-secondary tabular-nums',
                              READONLY,
                            ].join(' ')}
                          >
                            {lineTotal(line)}
                          </span>
                        </td>
                        <td className="py-1.5 ps-1">
                          <button
                            type="button"
                            onClick={() =>
                              setLines((current) => current.filter((x) => x.id !== line.id))
                            }
                            aria-label={t('purchaseOrder.removeLine')}
                            className="inline-flex size-9 items-center justify-center rounded-sm hover:bg-surface-background"
                          >
                            <img src={deleteIcon} alt="" className="size-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      id: `l${current.length + 1}-${current.length}`,
                      item: CATALOG[0],
                      qty: '1',
                      unit: 'EA',
                      price: '',
                      vat: '5%',
                    },
                  ])
                }
                className="mt-3 inline-flex h-[42px] items-center gap-2 rounded-sm border border-dashed border-border-default bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-primary-300"
              >
                <img src={plusIcon} alt="" className="size-4" />
                {t('purchaseOrder.addLine')}
              </button>

              <dl className="ms-auto mt-6 w-full max-w-[340px]">
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('purchaseOrder.net')}
                  </dt>
                  <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {totals.net}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t('purchaseOrder.vatRow')}
                  </dt>
                  <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                    {totals.vat}
                  </dd>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('recordBill.theyreCharging')}
                  </dt>
                  <dd className="flex items-center gap-1.5 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                    {totals.total}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard step={4} title={t('recordBill.beforeYouSave')}>
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-[1.2] text-text-primary">
                      {t('recordBill.attachDocument')}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                      {t('recordBill.attachDocumentNote')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-[42px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                  >
                    {t('recordBill.attachFile')}
                  </button>
                </div>
                <ToggleRow
                  label={t('recordBill.straightToApproval')}
                  hint={t('recordBill.straightToApprovalHint', { limit: '2,000', who: 'Yusuf' })}
                  checked={straightToApproval}
                  onChange={setStraightToApproval}
                />
              </div>
            </SectionCard>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('recordBill.doesItMatch')}
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {[
                  {
                    id: 'ordered',
                    value: chosenOrder ? formatOmr(chosenOrder.amount) : '—',
                    currency: true,
                  },
                  { id: 'received', value: '240 KG · 10 sacks', currency: false },
                  { id: 'billing', value: totals.total, currency: true },
                ].map((row) => (
                  <li key={row.id} className="flex items-center gap-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success-100">
                      <img src={checkIcon} alt="" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-text-secondary">
                      {t(`recordBill.match.${row.id}`)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-primary tabular-nums">
                      {row.currency ? (
                        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                      ) : null}
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('recordBill.vatEffect')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <SideRow label={t('recordBill.vatOnBill')} value={totals.vat} currency />
                <SideRow label={t('recordBill.reclaimable')} value={t('recordBill.allOfIt')} />
                <SideRow
                  label={t('recordBill.theirVatNumber')}
                  value={t('recordBill.onFileValid')}
                  last
                />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('purchaseOrder.whatHappens')}
              </h2>
              <ol className="mt-3 flex flex-col gap-4">
                {AFTER.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      className={[
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                        index === 0
                          ? 'bg-primary-700 text-white'
                          : 'bg-surface-background text-text-quaternary',
                      ].join(' ')}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                        {t(`recordBill.after.${step}`, { who: 'Yusuf', order: against })}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {withRial(
                          t(`recordBill.after.${step}Note`, {
                            limit: '2,000',
                            due: '29 Aug',
                            by: '6 Aug',
                            saves: formatOmr(earlySaving),
                          }),
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="rounded-sm bg-primary-25 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-primary-700">
                  {t('purchaseOrder.inPlainWords')}
                </p>
                <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-secondary">
                  {t('recordBill.plainWords', {
                    amount: totals.total,
                    supplier: 'Muscat Roastery',
                    order: against === 'none' ? t('recordBill.noOrderShort') : against,
                    payable: '29 August',
                  })}
                </p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Radio({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        active ? 'border-primary-700' : 'border-border-default',
      ].join(' ')}
    >
      {active ? <span className="size-2.5 rounded-full bg-primary-700" /> : null}
    </span>
  )
}

function Labelled({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </span>
      {children}
    </div>
  )
}

function SideRow({
  label,
  value,
  currency,
  last,
}: {
  label: string
  value: string
  currency?: boolean
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1 text-sm font-semibold text-text-primary tabular-nums">
        {currency ? <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" /> : null}
        {value}
      </dd>
    </div>
  )
}

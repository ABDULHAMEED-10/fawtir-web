import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { DateField } from '../../components/ui'
import { SectionCard, ToggleRow } from '../../components/form'
import {
  calculateInvoice,
  formatAtScale,
  projectInvoice,
  type DiscountType,
} from '../../lib/invoiceMath'
import { SUPPLIER_DETAIL } from '../../lib/supplierDetail'
import chevronIcon from '../../assets/invoices/chevron.svg'
import sendIcon from '../../assets/invoice-details/send.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const SHELL = 'border-primary-300 bg-surface-tab-bar'
const READONLY = 'border-border-subtle bg-surface-background'

type OrderLine = { id: string; item: string; qty: string; unit: string; price: string; vat: string }

const CATALOG = [
  'Green beans Yirgacheffe',
  'Green beans House Blend',
  'Jute sacks - 25 kg',
  'Roasting service',
]

const INITIAL_LINES: OrderLine[] = [
  { id: 'l1', item: CATALOG[0], qty: '300', unit: 'KG', price: '7.400', vat: '5%' },
  { id: 'l2', item: CATALOG[1], qty: '120', unit: 'KG', price: '6.100', vat: '5%' },
  { id: 'l3', item: CATALOG[2], qty: '20', unit: 'EA', price: '1.950', vat: '5%' },
]

/** What happens once it is sent, in the order it happens. */
const AFTER = ['approves', 'sent', 'goodsArrive', 'billTurnsUp']

export function NewPurchaseOrderPage() {
  const { t } = useTranslation()
  const supplier = SUPPLIER_DETAIL

  const [lines, setLines] = useState<OrderLine[]>(INITIAL_LINES)
  const [orderDate, setOrderDate] = useState('2026-07-30')
  const [wantedBy, setWantedBy] = useState('2026-08-06')
  const [reference, setReference] = useState('ALBAHJA-PO-0034')
  const [note, setNote] = useState('Deliveries accepted Sunday to Thursday, 06:00–10:00 only.')
  const [overPeppol, setOverPeppol] = useState(true)
  const [emailPdf, setEmailPdf] = useState(true)
  const [remindMe, setRemindMe] = useState(true)

  /** The same engine every other total in the app uses, so an order reconciles like a bill. */
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
    }
  }, [lines])

  /** Line totals carry thousands separators, like every other amount on the screen. */
  const lineTotal = (line: OrderLine) =>
    ((Number(line.qty.replace(/,/g, '')) || 0) * (Number(line.price) || 0)).toLocaleString(
      'en-US',
      { minimumFractionDigits: 3, maximumFractionDigits: 3 },
    )

  const update = (id: string, patch: Partial<OrderLine>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
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
              <span className="text-base font-semibold text-text-primary">PO-0034</span>
            </div>
            <h1 className="mt-1.5 text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('purchaseOrder.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('purchaseOrder.subtitle')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('purchaseOrder.discard')}
            </Link>
            <Link
              to={`/suppliers/${supplier.slug}`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={sendIcon} alt="" className="size-4 brightness-0 invert" />
              {t('purchaseOrder.sendForApproval')}
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
                {t('purchaseOrder.supplierNote', { count: supplier.counts.bills })}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap items-center gap-8">
            {[
              { key: 'terms', value: t('supplierDetail.net30Days') },
              { key: 'earlySettlement', value: t('supplierDetail.twoPercentSeven') },
              { key: 'leadTime', value: t('purchaseOrder.sixDays') },
            ].map((entry) => (
              <div key={entry.key}>
                <dt className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                  {t(`purchaseOrder.${entry.key}`)}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-text-primary">{entry.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* Lines */}
            <SectionCard step={1} title={t('purchaseOrder.whatOrdering')}>
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
                        <td className="ps-1 py-1.5">
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
                <TotalRow label={t('purchaseOrder.net')} value={totals.net} />
                <TotalRow label={t('purchaseOrder.vatRow')} value={totals.vat} />
                <div className="mt-2 flex items-center justify-between gap-4 border-t border-surface-background pt-3.5">
                  <dt className="text-base font-semibold text-text-primary">
                    {t('purchaseOrder.orderValue')}
                  </dt>
                  <dd className="flex items-center gap-1.5 text-[22px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                    <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                    {totals.total}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            {/* When and where */}
            <SectionCard step={2} title={t('purchaseOrder.whenAndWhere')}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Labelled label={t('purchaseOrder.orderDate')} required>
                    <DateField
                      value={orderDate}
                      onChange={setOrderDate}
                      ariaLabel={t('purchaseOrder.orderDate')}
                    />
                  </Labelled>
                  <Labelled label={t('purchaseOrder.wantedBy')} required>
                    <DateField
                      value={wantedBy}
                      onChange={setWantedBy}
                      ariaLabel={t('purchaseOrder.wantedBy')}
                    />
                  </Labelled>
                  <Labelled label={t('purchaseOrder.yourReference')}>
                    <input
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      aria-label={t('purchaseOrder.yourReference')}
                      className={[
                        'h-[50px] w-full rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                        SHELL,
                      ].join(' ')}
                    />
                  </Labelled>
                </div>

                <Labelled label={t('purchaseOrder.deliverTo')} required>
                  <div className="relative">
                    <select
                      aria-label={t('purchaseOrder.deliverTo')}
                      className={[
                        'h-[50px] w-full appearance-none rounded-sm border px-4 pe-11 text-sm font-medium text-text-secondary outline-none',
                        SHELL,
                      ].join(' ')}
                    >
                      <option>Al Bahja Coffee - Souq Street, Nizwa</option>
                      <option>Al Bahja Coffee - Rusayl warehouse</option>
                    </select>
                    <img
                      src={chevronIcon}
                      alt=""
                      className="pointer-events-none absolute end-4 top-1/2 size-4 -translate-y-1/2 rotate-90"
                    />
                  </div>
                </Labelled>

                <Labelled label={t('purchaseOrder.noteForSupplier')}>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    aria-label={t('purchaseOrder.noteForSupplier')}
                    className={[
                      'h-[50px] w-full rounded-sm border px-4 text-sm font-medium text-text-secondary outline-none',
                      SHELL,
                    ].join(' ')}
                  />
                </Labelled>
              </div>
            </SectionCard>

            {/* How to send */}
            <SectionCard step={3} title={t('purchaseOrder.howToSend')}>
              <div className="flex flex-col gap-5">
                <ToggleRow
                  label={t('purchaseOrder.sendOverPeppol')}
                  hint={t('purchaseOrder.sendOverPeppolHint')}
                  checked={overPeppol}
                  onChange={setOverPeppol}
                />
                <ToggleRow
                  label={t('purchaseOrder.emailPdf')}
                  hint={t('purchaseOrder.emailPdfHint', {
                    name: supplier.contacts[0].name,
                    email: supplier.contacts[0].detail,
                  })}
                  checked={emailPdf}
                  onChange={setEmailPdf}
                />
                <ToggleRow
                  label={t('purchaseOrder.tellMeArrive')}
                  hint={t('purchaseOrder.tellMeArriveHint', { date: '6 Aug' })}
                  checked={remindMe}
                  onChange={setRemindMe}
                />
              </div>
            </SectionCard>
          </div>

          {/* Side */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('purchaseOrder.thisOrder')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <SideRow label={t('purchaseOrder.lines')} value={String(lines.length)} />
                <SideRow label={t('purchaseOrder.net')} value={totals.net} currency />
                <SideRow label={t('purchaseOrder.vat')} value={totals.vat} currency />
                <SideRow label={t('purchaseOrder.orderValue')} value={totals.total} currency />
                <SideRow label={t('purchaseOrder.payableBy')} value="5 Sep 2026" last />
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
                        {t(`purchaseOrder.after.${step}`, { who: 'Hafidh' })}
                      </p>
                      <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(`purchaseOrder.after.${step}Note`, { limit: '2,000', grn: 'GRN-0093' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <h2 className="text-base font-semibold leading-[1.2] text-text-primary">
                {t('purchaseOrder.comparedWithLast')}
              </h2>
              <dl className="mt-3 flex flex-col">
                <SideRow label="PO-0031" value="20 Jul · OMR 2,354.310" />
                <SideRow label={t('purchaseOrder.sameItems')} value="2 of 3" />
                <SideRow label={t('purchaseOrder.quantity')} value="+40% beans" tone="up" />
                <SideRow label={t('purchaseOrder.sackPrice')} value="up 5.4%" tone="warn" last />
              </dl>
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="rounded-sm bg-primary-25 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.7px] text-primary-700">
                  {t('purchaseOrder.inPlainWords')}
                </p>
                <p className="mt-2.5 text-sm font-medium leading-[1.6] text-text-secondary">
                  {t('purchaseOrder.plainWords', {
                    amount: totals.total,
                    supplier: 'Muscat Roastery',
                    wanted: '6 August',
                    payable: '5 September',
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

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm font-medium text-text-tertiary">{label}</dt>
      <dd className="flex items-center gap-1 text-sm font-semibold text-text-secondary tabular-nums">
        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
        {value}
      </dd>
    </div>
  )
}

function SideRow({
  label,
  value,
  currency,
  tone,
  last,
}: {
  label: string
  value: string
  currency?: boolean
  tone?: 'up' | 'warn'
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
      <dd
        className={[
          'flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums',
          tone === 'up'
            ? 'text-[#3d5648]'
            : tone === 'warn'
              ? 'text-pending-700'
              : 'text-text-primary',
        ].join(' ')}
      >
        {currency ? <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" /> : null}
        {value}
      </dd>
    </div>
  )
}

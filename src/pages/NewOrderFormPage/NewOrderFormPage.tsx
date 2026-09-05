import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  Amount,
  ChoiceCards,
  Field,
  FormFooter,
  NotesAndAttachments,
  NumberStepper,
  SectionCard,
} from '../../components/trade/TradeFormKit'
import {
  NEW_PURCHASE_ORDER,
  NEW_SALES_ORDER,
  type OrderFormMode,
  type OrderLine,
  type OrderTotals,
} from '../../lib/tradeCreate'
import backIcon from '../../assets/trade-create/back.svg'
import noteTextIcon from '../../assets/trade-create/note-text.svg'
import editIcon from '../../assets/trade-create/edit.svg'
import eyeIcon from '../../assets/trade-create/eye.svg'
import uploadIcon from '../../assets/trade-create/upload.svg'
import deliverIcon from '../../assets/trade-create/deliver.svg'
import tickCircleIcon from '../../assets/trade-create/tick-circle.svg'
import deleteIcon from '../../assets/trade-create/delete.svg'
import plusIcon from '../../assets/trade-create/plus.svg'
import arrowNextIcon from '../../assets/trade-create/arrow-next.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import calendarIcon from '../../assets/create-invoice/calendar.svg'
import customerLogo from '../../assets/create-invoice/customer-logo.svg'
import modeSalesIcon from '../../assets/order-forms-v2/mode-sales.svg'
import modePurchaseIcon from '../../assets/order-forms-v2/mode-purchase.svg'
import { RowsView } from '../../components/ui'

function ModePicker({
  mode,
  onChange,
}: {
  mode: OrderFormMode
  onChange: (m: OrderFormMode) => void
}) {
  const { t } = useTranslation()
  const options: { id: OrderFormMode; titleKey: string; hintKey: string; icon: string }[] = [
    {
      id: 'sales',
      titleKey: 'tradeCreate.sales.modeTitle',
      hintKey: 'tradeCreate.sales.modeHint',
      icon: modeSalesIcon,
    },
    {
      id: 'purchase',
      titleKey: 'tradeCreate.purchase.modeTitle',
      hintKey: 'tradeCreate.purchase.modeHint',
      icon: modePurchaseIcon,
    },
  ]

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const active = option.id === mode
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'flex items-center justify-between gap-2 rounded-sm px-4 py-3 text-start transition-colors',
              active
                ? 'border-2 border-[#5671c5] bg-[#eaedf8]'
                : 'border border-[#e8e8ea] bg-white',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-2">
              <img src={option.icon} alt="" className="size-6 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(option.titleKey)}
                </span>
                <span className="mt-1 truncate text-xs font-medium leading-[1.2] text-[#444957]">
                  {t(option.hintKey)}
                </span>
              </span>
            </span>
            {active ? <img src={tickCircleIcon} alt="" className="size-5 shrink-0" /> : null}
          </button>
        )
      })}
    </div>
  )
}

function LinesTable({ lines, totals }: { lines: OrderLine[]; totals: OrderTotals }) {
  const { t } = useTranslation()

  return (
    <>
      <RowsView>
        <table className="w-full min-w-[900px] border-collapse text-start">
          <thead>
            <tr>
              {[
                'tradeCreate.cols.description',
                'tradeCreate.cols.unitPrice',
                'tradeCreate.cols.vat',
                'tradeCreate.cols.quantity',
                'tradeCreate.cols.unit',
                'tradeCreate.cols.discount',
                'tradeCreate.cols.totExcl',
              ].map((key) => (
                <th
                  key={key}
                  className="pb-2 text-start text-xs font-semibold uppercase leading-[1.2] tracking-[0.02em] text-[#5b606c]"
                >
                  {t(key)}
                </th>
              ))}
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5 pe-3">
                  <Field value={line.description} suffix="chevron" />
                </td>
                <td className="py-1.5 pe-3">
                  <Field value={line.unitPrice} />
                </td>
                <td className="py-1.5 pe-3">
                  <Field value={line.vat} />
                </td>
                <td className="py-1.5 pe-3">
                  <Field value={line.qty} suffix={<NumberStepper />} />
                </td>
                <td className="py-1.5 pe-3">
                  <Field value={line.unit} suffix="chevron" />
                </td>
                <td className="py-1.5 pe-3">
                  <Field value={line.discount} />
                </td>
                <td className="py-1.5 pe-3 text-base font-semibold text-[#151c2d]">{line.total}</td>
                <td className="py-1.5">
                  <button type="button" aria-label={t('tradeCreate.removeLine')}>
                    <img src={deleteIcon} alt="" className="size-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </RowsView>

      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-[#b6c2e4] py-3 text-base font-semibold text-[#2c4eb7]"
      >
        <img src={plusIcon} alt="" className="size-5" />
        {t('tradeCreate.addLineItem')}
      </button>

      <dl className="mt-6 ms-auto flex w-full max-w-[420px] flex-col gap-3">
        {[
          { labelKey: 'tradeCreate.totals.subtotal', value: totals.subtotal },
          { labelKey: 'tradeCreate.totals.discount', value: totals.discount, negative: true },
          { labelKey: 'tradeCreate.totals.net', value: totals.net },
          { labelKey: 'tradeCreate.totals.vat', value: totals.vat },
        ].map((row) => (
          <div key={row.labelKey} className="flex items-center justify-between gap-3">
            <dt className="text-sm font-medium leading-[1.2] text-[#5b606c]">{t(row.labelKey)}</dt>
            <dd className="flex items-center gap-1">
              {row.negative ? <span className="text-sm text-[#5b606c]">−</span> : null}
              <Amount
                value={row.value}
                size="sm"
                className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
              />
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-[#f3f3f3] pt-4">
          <dt className="text-base font-medium leading-[1.2] text-[#151c2d]">
            {t(totals.totalLabelKey)}
          </dt>
          <dd>
            <Amount
              value={totals.total}
              size="lg"
              className="text-[22px] font-semibold leading-[1.2] text-[#151c2d]"
            />
          </dd>
        </div>
      </dl>
    </>
  )
}

export function NewOrderFormPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<OrderFormMode>(
    params.get('type') === 'purchase' ? 'purchase' : 'sales',
  )
  const [deliveryOption, setDeliveryOption] = useState('one')

  const sales = mode === 'sales'
  const doc = sales ? NEW_SALES_ORDER : NEW_PURCHASE_ORDER

  const deliveryOptions = sales
    ? [
        {
          id: 'one',
          titleKey: 'tradeCreate.delivery.oneSale',
          hintKey: 'tradeCreate.delivery.oneSaleHint',
          icon: deliverIcon,
        },
        {
          id: 'repeat',
          titleKey: 'tradeCreate.delivery.repeating',
          hintKey: 'tradeCreate.delivery.repeatingHint',
          icon: calendarIcon,
        },
        {
          id: 'none',
          titleKey: 'tradeCreate.delivery.nothingDeliver',
          hintKey: 'tradeCreate.delivery.nothingDeliverHint',
        },
      ]
    : [
        {
          id: 'one',
          titleKey: 'tradeCreate.delivery.onePurchase',
          hintKey: 'tradeCreate.delivery.onePurchaseHint',
          icon: deliverIcon,
        },
        {
          id: 'callOff',
          titleKey: 'tradeCreate.delivery.callOff',
          hintKey: 'tradeCreate.delivery.callOffHint',
          icon: calendarIcon,
        },
        {
          id: 'none',
          titleKey: 'tradeCreate.delivery.nothingReceive',
          hintKey: 'tradeCreate.delivery.nothingReceiveHint',
        },
      ]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/trade-documents/order-forms"
              className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
            >
              {t('orderDetail.breadcrumbOrderForms')}
            </Link>
            <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
            <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
              {t(sales ? 'tradeCreate.sales.title' : 'tradeCreate.purchase.title')}
            </h1>
            <span className="text-sm font-medium text-[#8f8f8f]">{doc.id}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f3f3] px-3 py-1 text-sm font-semibold text-[#5b606c]">
              <span className="size-1.5 rounded-full bg-[#5b606c]" />
              {t('tradeCreate.draft')}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5b606c]">
            <img src={tickCircleIcon} alt="" className="size-5" />
            {t('tradeCreate.savedJustNow')}
          </span>
        </div>

        <ModePicker mode={mode} onChange={setMode} />

        {/* 1 source + party (left) | value summary (right) */}
        <div className="grid items-start gap-4 xl:grid-cols-[1fr_332px]">
          <SectionCard
            step={1}
            title={t(sales ? 'tradeCreate.sales.sourceTitle' : 'tradeCreate.purchase.sourceTitle')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb]/60 p-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white">
                  <img src={noteTextIcon} alt="" className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                    {doc.sourceTitle}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#5b606c]">
                    {t(doc.sourceMetaKey)}
                  </span>
                </span>
              </span>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-[#e8e8ea] bg-white px-3 text-sm font-semibold text-[#444957]"
              >
                {t('tradeCreate.change')}
                <img src={chevronIcon} alt="" className="size-5 rotate-90" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-[#fafafa] px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-[#5b606c]">
                <img src={editIcon} alt="" className="size-5" />
                {t(sales ? 'tradeCreate.sales.noQuote' : 'tradeCreate.purchase.noQuote')}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#233e92]"
              >
                {t('tradeCreate.startBlank')}
                <img src={arrowNextIcon} alt="" className="size-4 rtl:rotate-180" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#d5dcf1] bg-[#f4f6fb]/60 p-3">
              <span className="flex min-w-0 items-center gap-3">
                <img src={customerLogo} alt="" className="size-10 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-base font-medium leading-[1.2] text-[#151c2d]">
                    {sales ? NEW_SALES_ORDER.customer : NEW_PURCHASE_ORDER.supplier}
                  </span>
                  <span className="mt-1 block text-xs font-medium leading-[1.2] text-[#5b606c]">
                    {sales ? NEW_SALES_ORDER.customerVat : NEW_PURCHASE_ORDER.supplierVat}
                  </span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-[#e8e8ea] bg-white px-3 py-1.5 text-sm font-medium text-[#3d5648]">
                <img src={tickCircleIcon} alt="" className="size-4" />
                {t('tradeCreate.onPeppol')}
              </span>
            </div>
          </SectionCard>

          <section className="rounded-sm bg-surface-card p-4">
            <h2 className="text-base font-medium leading-[1.2] text-[#151c2d]">
              {t(doc.summary.titleKey)}
            </h2>
            <div className="mt-3 h-px w-full bg-border-subtle" />
            <dl className="mt-4 flex flex-col gap-3">
              {[
                { labelKey: 'tradeCreate.totals.subtotal', value: doc.summary.subtotal },
                {
                  labelKey: 'tradeCreate.totals.discount',
                  value: doc.summary.discount,
                  negative: true,
                },
                { labelKey: 'tradeCreate.totals.net', value: doc.summary.net },
                { labelKey: 'tradeCreate.totals.vat', value: doc.summary.vat },
              ].map((row) => (
                <div key={row.labelKey} className="flex items-center justify-between gap-3">
                  <dt className="text-sm font-medium leading-[1.2] text-[#5b606c]">
                    {t(row.labelKey)}
                  </dt>
                  <dd className="flex items-center gap-1">
                    {row.negative ? <span className="text-sm text-[#5b606c]">−</span> : null}
                    <Amount
                      value={row.value}
                      size="sm"
                      className="text-sm font-semibold leading-[1.2] text-[#2c3342]"
                    />
                  </dd>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-[#f3f3f3] pt-4">
                <dt className="text-base font-medium leading-[1.2] text-[#151c2d]">
                  {t(doc.summary.totalLabelKey)}
                </dt>
                <dd>
                  <Amount
                    value={doc.summary.total}
                    size="lg"
                    className="text-[22px] font-semibold leading-[1.2] text-[#151c2d]"
                  />
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <SectionCard step={2} title={t('tradeCreate.whatsBeingOrdered')}>
          <LinesTable lines={doc.lines} totals={doc.totals} />
        </SectionCard>

        <SectionCard step={3} title={t('tradeCreate.howDelivered')}>
          <ChoiceCards
            options={deliveryOptions}
            value={deliveryOption}
            onChange={setDeliveryOption}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field
              label={t(doc.delivery.dueLabelKey)}
              required
              value={doc.delivery.due}
              suffix="calendar"
            />
            <Field
              label={t('tradeCreate.deliverTo')}
              required
              value={doc.delivery.deliverTo}
              suffix="chevron"
            />
            <Field
              label={t(sales ? 'tradeCreate.dispatchFrom' : 'tradeCreate.receivingHours')}
              value={doc.delivery.dispatchFrom}
              suffix={sales ? 'chevron' : undefined}
            />
          </div>
        </SectionCard>

        <SectionCard step={4} title={t('tradeCreate.orderDetails')}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label={t('tradeCreate.orderNumber')}
              required
              value={doc.details.orderNumber}
              highlighted
            />
            <Field
              label={t('tradeCreate.orderDate')}
              required
              value={doc.details.orderDate}
              suffix="calendar"
            />
            <Field
              label={t(sales ? 'tradeCreate.theirPoReference' : 'tradeCreate.theirQuoteRef')}
              hint={sales ? t('tradeCreate.sales.theirPoHint') : undefined}
              value={doc.details.theirPo}
            />
            <Field
              label={t('tradeCreate.paymentTerms')}
              required
              value={doc.details.paymentTerms}
              suffix="chevron"
            />
            <Field
              label={t('tradeCreate.currency')}
              required
              value={doc.details.currency}
              suffix="chevron"
            />
            <Field
              label={t('tradeCreate.branch')}
              required
              value={doc.details.branch}
              suffix="chevron"
            />
          </div>
        </SectionCard>

        <NotesAndAttachments
          step={5}
          noteToCustomer={doc.noteToCustomer}
          internalNote={doc.internalNote}
          uploadIcon={uploadIcon}
        />
      </div>

      <FormFooter>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-5 text-base font-medium text-[#3a3a3a]"
        >
          <img src={eyeIcon} alt="" className="size-5" />
          {t('tradeCreate.preview')}
        </button>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-white px-5 text-base font-medium text-[#3a3a3a]"
        >
          <img src={noteTextIcon} alt="" className="size-5" />
          {t('tradeCreate.saveDraft')}
        </button>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-[#2c4eb7] px-6 text-base font-semibold text-white"
        >
          {t(sales ? 'tradeCreate.sales.confirm' : 'tradeCreate.purchase.confirm')}
          <img src={arrowNextIcon} alt="" className="size-5 brightness-0 invert rtl:rotate-180" />
        </button>
      </FormFooter>
    </AppShell>
  )
}

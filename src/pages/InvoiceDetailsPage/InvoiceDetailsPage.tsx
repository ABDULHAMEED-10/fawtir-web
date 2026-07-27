import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import { INVOICE_DETAIL } from '../../lib/invoiceDetails'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import sendIcon from '../../assets/invoice-details/send.svg'
import creditNoteIcon from '../../assets/invoice-details/credit-note.svg'
import periodicIcon from '../../assets/invoice-details/periodic.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import menuIcon from '../../assets/invoice-details/menu.svg'
import clockIcon from '../../assets/invoice-details/clock.svg'
import peppolCheckIcon from '../../assets/invoice-details/peppol-check.svg'
import peppolBadgeIcon from '../../assets/invoice-details/peppol-badge.svg'
import customerLogo from '../../assets/invoice-details/customer-logo.svg'
import chevronIcon from '../../assets/invoice-details/chevron.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import jpgIcon from '../../assets/invoice-details/jpg.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import deleteIcon from '../../assets/invoice-details/delete.svg'
import timelineCheckIcon from '../../assets/invoice-details/timeline-check.svg'
import invoicePreview from '../../assets/invoice-details/invoice-preview.png'
import plusIcon from '../../assets/invoices/plus.svg'

function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mb-3 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
    </div>
  )
}

function GhostButton({
  icon,
  label,
  iconOnly,
}: {
  icon: string
  label: string
  iconOnly?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={[
        'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white',
        iconOnly ? 'justify-center px-4' : 'px-4',
      ].join(' ')}
    >
      <img src={icon} alt="" className="size-6 shrink-0" />
      {iconOnly ? null : label}
    </button>
  )
}

export function InvoiceDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const invoice = INVOICE_DETAIL
  const invoiceId = id ?? invoice.id

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/invoices"
                className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary"
              >
                {t('invoiceDetails.breadcrumbIncome')}
                <img src={backIcon} alt="" className="size-6 rotate-180" />
              </Link>
              <Link
                to="/invoices"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary"
              >
                {t('invoiceDetails.breadcrumbInvoices')}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
                {t('invoiceDetails.title', { id: invoiceId })}
              </h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] bg-warning-100 px-3 text-sm font-semibold text-[#6d5a39]">
                <span className="size-1.5 rounded-full bg-[#6d5a39]" />
                {t('invoicesPage.status.partial')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              <span className="font-medium text-text-quaternary">{t('invoiceDetails.issued')}</span>
              <span className="font-semibold text-text-primary">{invoice.issued}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">{invoice.channel}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">{t('invoiceDetails.to')}</span>
              <span className="font-semibold text-text-primary">{invoice.customer.name}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={sendIcon} alt="" className="size-6" />
              {t('invoiceDetails.actions.send')}
            </button>
            <GhostButton icon={creditNoteIcon} label={t('invoiceDetails.actions.creditNote')} />
            <GhostButton icon={periodicIcon} label={t('invoiceDetails.actions.periodic')} />
            <GhostButton icon={copyIcon} label={t('invoiceDetails.actions.duplicate')} />
            <GhostButton icon={menuIcon} label={t('invoiceDetails.actions.more')} iconOnly />
          </div>
        </div>

        {/* Balance + Bill to + PDF */}
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t('invoiceDetails.outstandingBalance')}
                </h2>
                <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] bg-warning-100 py-1 ps-1 pe-3 text-sm font-semibold text-[#6d5a39]">
                  <img src={clockIcon} alt="" className="size-5" />
                  {invoice.dueBadge}
                </span>
              </div>
              <div className="mb-3 h-px w-full bg-border-subtle" />

              <OmAmount
                size="lg"
                amount={invoice.outstanding}
                amountClassName="text-[32px] font-semibold leading-none text-text-primary/90"
                className="mb-2"
              />
              <div className="mb-3 h-3 overflow-hidden rounded-[5px] bg-surface-background">
                <div
                  className="h-full rounded-[5px] bg-primary-700"
                  style={{ width: `${invoice.paidPercent}%` }}
                />
              </div>
              <div className="mb-3 h-px w-full bg-border-subtle" />

              <div className="mb-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {t('invoiceDetails.invoiceTotal')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={invoice.total}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-primary"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">{t('invoiceDetails.paid')}</p>
                  <OmAmount
                    size="sm"
                    amount={invoice.paid}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-success-700"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {t('invoiceDetails.outstanding')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={invoice.outstanding}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-primary"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-sm border border-primary-50 bg-primary-25 p-2">
                <img src={peppolCheckIcon} alt="" className="size-4 shrink-0" />
                <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                  {invoice.peppolDelivery}
                </p>
              </div>
            </section>

            <SectionCard
              title={t('invoiceDetails.billTo')}
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-base font-semibold text-primary-800"
                >
                  {t('invoiceDetails.viewCustomer')}
                  <img src={chevronIcon} alt="" className="size-5 rotate-180" />
                </button>
              }
            >
              <div className="mb-4 flex items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img
                    src={customerLogo}
                    alt=""
                    className="size-12 shrink-0 rounded-sm object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {invoice.customer.name}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {invoice.customer.vat}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                  <img src={peppolBadgeIcon} alt="" className="size-4" />
                  {t('invoiceDetails.onPeppol')}
                </span>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <MetaField label={t('invoiceDetails.fields.issueDate')} value={invoice.fields.issueDate} />
                  <MetaField label={t('invoiceDetails.fields.dueDate')} value={invoice.fields.dueDate} />
                  <MetaField
                    label={t('invoiceDetails.fields.deliveryDate')}
                    value={invoice.fields.deliveryDate}
                  />
                </div>
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <MetaField
                    label={t('invoiceDetails.fields.paymentTerms')}
                    value={invoice.fields.paymentTerms}
                  />
                  <MetaField label={t('invoiceDetails.fields.currency')} value={invoice.fields.currency} />
                  <MetaField label={t('invoiceDetails.fields.vatRate')} value={invoice.fields.vatRate} />
                </div>
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <MetaField label={t('invoiceDetails.fields.branch')} value={invoice.fields.branch} />
                  <MetaField label={t('invoiceDetails.fields.project')} value={invoice.fields.project} />
                  <MetaField
                    label={t('invoiceDetails.fields.poReference')}
                    value={invoice.fields.poReference}
                  />
                </div>
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <div className="flex w-full max-w-[346px] flex-col gap-0.5">
                    <p className="text-xs font-medium text-[#727579]">
                      {t('invoiceDetails.fields.subject')}
                    </p>
                    <p className="text-sm font-medium text-text-primary">{invoice.fields.subject}</p>
                  </div>
                  <MetaField
                    label={t('invoiceDetails.fields.paymentMethod')}
                    value={invoice.fields.paymentMethod}
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          {/* PDF preview */}
          <aside className="flex h-[654px] w-full shrink-0 flex-col overflow-hidden rounded-sm border border-border-subtle bg-surface-background xl:w-[448px]">
            <div className="flex items-center justify-between bg-surface-card px-3.5 py-4">
              <div className="flex items-center gap-1.5">
                <img src={pdfIcon} alt="" className="size-6" />
                <p className="text-sm font-medium text-text-secondary">
                  {t('invoiceDetails.pdfTitle')}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={t('invoiceDetails.zoomOut')}>
                    <img src={zoomOutIcon} alt="" className="size-6" />
                  </button>
                  <span className="text-xs font-medium text-text-tertiary">100%</span>
                  <button type="button" aria-label={t('invoiceDetails.zoomIn')}>
                    <img src={zoomInIcon} alt="" className="size-6" />
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  <button type="button" aria-label={t('invoiceDetails.download')}>
                    <img src={downloadIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('invoiceDetails.print')}>
                    <img src={printIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('invoiceDetails.fullscreen')}>
                    <img src={fullscreenIcon} alt="" className="size-6" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto p-6 pt-4">
              <img
                src={invoicePreview}
                alt={t('invoiceDetails.pdfAlt', { id: invoiceId })}
                className="w-full max-w-[386px] rounded-sm shadow-card"
              />
            </div>
          </aside>
        </div>

        {/* Items */}
        <SectionCard title={t('invoiceDetails.items')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-start">
              <thead>
                <tr className="border-b border-surface-background text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.description')}</th>
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.unitPrice')}</th>
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.vat')}</th>
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.qty')}</th>
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.unit')}</th>
                  <th className="py-2 font-semibold">{t('invoiceDetails.col.disc')}</th>
                  <th className="py-2 text-end font-semibold">{t('invoiceDetails.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-surface-background">
                    <td className="py-3 pe-4">
                      <p className="text-base font-medium text-text-primary">{item.description}</p>
                      <p className="text-sm font-medium text-text-quaternary">{item.catalog}</p>
                    </td>
                    <td className="py-3 text-sm font-medium text-text-secondary">{item.unitPrice}</td>
                    <td className="py-3 text-sm font-medium text-text-secondary">{item.vat}</td>
                    <td className="py-3 text-base font-medium text-text-secondary">{item.qty}</td>
                    <td className="py-3 text-base font-medium text-text-secondary">{item.unit}</td>
                    <td className="py-3 text-sm font-medium text-text-secondary">{item.discount}</td>
                    <td className="py-3 text-end text-xl font-semibold text-text-primary/90">
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 ms-auto flex w-full max-w-[328px] flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-text-tertiary">
                {t('invoiceDetails.totals.subtotal')}
              </span>
              <OmAmount
                size="xs"
                amount={invoice.totals.subtotal}
                amountClassName="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-text-tertiary">
                {t('invoiceDetails.totals.discount')}
              </span>
              <span className="inline-flex items-center gap-1 text-base font-semibold text-success-700">
                −
                <OmAmount
                  size="xs"
                  amount={invoice.totals.discount}
                  amountClassName="text-base font-semibold text-success-700"
                />
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-text-tertiary">
                {t('invoiceDetails.totals.net')}
              </span>
              <OmAmount
                size="xs"
                amount={invoice.totals.net}
                amountClassName="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-text-tertiary">
                {t('invoiceDetails.totals.vat')}
              </span>
              <OmAmount
                size="xs"
                amount={invoice.totals.vat}
                amountClassName="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="my-1 h-px w-full bg-border-subtle" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-text-primary">
                {t('invoiceDetails.totals.total')}
              </span>
              <OmAmount
                size="sm"
                amount={invoice.totals.total}
                amountClassName="text-xl font-semibold text-text-primary"
              />
            </div>
          </div>
        </SectionCard>

        {/* Notes */}
        <SectionCard title={t('invoiceDetails.notes.title')}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary">
                  {t('invoiceDetails.notes.customer')}
                </p>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('invoiceDetails.notes.onInvoice')}
                </span>
              </div>
              <div className="rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-secondary">
                {invoice.notes.customer}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary">
                  {t('invoiceDetails.notes.internal')}
                </p>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('invoiceDetails.notes.private')}
                </span>
              </div>
              <div className="rounded-sm border border-border-subtle bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-secondary">
                {invoice.notes.internal}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Attachments */}
        <SectionCard title={t('invoiceDetails.attachments.title')}>
          <div className="flex flex-col gap-3">
            {invoice.attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img
                    src={file.type === 'pdf' ? pdfIcon : jpgIcon}
                    alt=""
                    className="size-9 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-text-primary">{file.name}</p>
                    <p className="truncate text-sm font-medium text-text-quaternary">{file.meta}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button type="button" aria-label={t('invoiceDetails.download')}>
                    <img src={downloadIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('invoiceDetails.delete')}>
                    <img src={deleteIcon} alt="" className="size-6" />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-center gap-2 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-4 text-base font-medium text-text-secondary"
            >
              <img src={uploadIcon} alt="" className="size-6" />
              <span>{t('invoiceDetails.attachments.drop')}</span>
              <span className="text-sm font-medium text-text-quaternary">
                {t('invoiceDetails.attachments.hint')}
              </span>
            </button>
          </div>
        </SectionCard>

        {/* Payments */}
        <SectionCard
          title={t('invoiceDetails.payments.title')}
          action={
            <button
              type="button"
              className="inline-flex items-center gap-2 text-base font-semibold text-primary-800"
            >
              <img src={plusIcon} alt="" className="size-6" />
              {t('invoiceDetails.payments.add')}
            </button>
          }
        >
          <div className="flex flex-col gap-3">
            {invoice.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <img src={pdfIcon} alt="" className="size-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-text-primary">
                      {payment.method}
                    </p>
                    <p className="truncate text-sm font-medium text-text-quaternary">
                      {payment.meta}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button type="button" aria-label={t('invoiceDetails.download')}>
                    <img src={downloadIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('invoiceDetails.delete')}>
                    <img src={deleteIcon} alt="" className="size-6" />
                  </button>
                </div>
              </div>
            ))}
            <div className="h-px w-full bg-border-subtle" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-base font-medium">
              <p className="inline-flex flex-wrap items-center gap-1 text-text-secondary">
                <span>{t('invoiceDetails.payments.paidPrefix')}</span>
                <OmAmount
                  size="xs"
                  amount={invoice.paid}
                  amountClassName="text-base font-medium text-text-secondary"
                />
                <span>{t('invoiceDetails.payments.of')}</span>
                <OmAmount
                  size="xs"
                  amount={invoice.total}
                  amountClassName="text-base font-medium text-text-secondary"
                />
              </p>
              <p className="inline-flex items-center gap-1 font-semibold text-text-primary">
                <span>{t('invoiceDetails.outstanding')}</span>
                <OmAmount
                  size="xs"
                  amount={invoice.outstanding}
                  amountClassName="text-base font-semibold text-text-primary"
                />
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Timeline */}
        <SectionCard title={t('invoiceDetails.timeline.title')}>
          <ol className="flex flex-col">
            {invoice.timeline.map((event, index) => {
              const isLast = index === invoice.timeline.length - 1
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex w-8 flex-col items-center">
                    <img src={timelineCheckIcon} alt="" className="size-[27px] shrink-0" />
                    {isLast ? null : <span className="my-1 w-px flex-1 bg-primary-200" />}
                  </div>
                  <div className={['min-w-0 pb-6', isLast ? 'pb-0' : ''].join(' ')}>
                    <p className="text-base font-medium text-text-primary">{event.title}</p>
                    <p className="mt-1 text-sm font-medium text-text-quaternary">{event.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </SectionCard>
      </div>
    </AppShell>
  )
}

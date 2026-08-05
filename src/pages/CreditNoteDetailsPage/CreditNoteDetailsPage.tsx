import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import { CREDIT_NOTE_DETAIL } from '../../lib/creditNoteDetail'
import backIcon from '../../assets/invoice-details/back.svg'
import menuIcon from '../../assets/invoices/menu.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import customerLogo from '../../assets/invoice-details/customer-logo.svg'
import peppolBadgeIcon from '../../assets/invoice-details/peppol-badge.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
// Green timeline, unlike the blue one on the invoice page.
import timelineCheckIcon from '../../assets/credit-note-detail/timeline-check.svg'
import saveDraftIcon from '../../assets/credit-note-detail/save-draft.svg'
import issueIcon from '../../assets/credit-note-detail/issue.svg'
import arrowUpLeftIcon from '../../assets/credit-note-detail/arrow-up-left.svg'
import minusIcon from '../../assets/credit-note-detail/minus.svg'
import warningIcon from '../../assets/credit-note-detail/warning.svg'
import returnIcon from '../../assets/credit-note-detail/return.svg'
import cardIcon from '../../assets/credit-note-detail/card.svg'
import creditPreview from '../../assets/credit-note-detail/credit-preview.png'

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
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mb-3 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function MetaField({
  label,
  value,
  valueClassName = 'text-text-primary',
}: {
  label: string
  value: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <div className={['text-sm font-medium leading-[1.2]', valueClassName].join(' ')}>{value}</div>
    </div>
  )
}

function NegativeOm({
  amount,
  size = 'xs',
  amountClassName = 'text-base font-semibold text-danger-700',
}: {
  amount: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  amountClassName?: string
}) {
  return (
    <span className="inline-flex items-center gap-1 text-danger-700">
      <span className="font-semibold">−</span>
      <OmAmount size={size} amount={amount} amountClassName={amountClassName} />
    </span>
  )
}

export function CreditNoteDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const note = CREDIT_NOTE_DETAIL
  const noteId = id ?? note.id

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/income/credit-notes"
                className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary"
              >
                {t('creditNoteDetails.breadcrumbIncome')}
                <img src={backIcon} alt="" className="size-6 rotate-180" />
              </Link>
              <span className="text-2xl font-medium leading-[1.2] text-text-quaternary">
                {t('creditNoteDetails.breadcrumb')}
              </span>
            </div>

            {/* Figma titles this page with the credit note number, not a generic label. */}
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{note.id}</h1>

            <div className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              <span className="font-medium text-text-quaternary">
                {t('creditNoteDetails.reversing')}
              </span>
              <Link
                to={`/invoices/${note.reversingId}`}
                className="font-semibold text-text-primary hover:text-primary-800"
              >
                {note.reversingId}
              </Link>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">{t('creditNoteDetails.for')}</span>
              <span className="font-semibold text-text-primary">{note.customer.name}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              <img src={saveDraftIcon} alt="" className="size-6 rotate-180" />
              {t('creditNoteDetails.saveDraft')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={issueIcon} alt="" className="size-6" />
              {t('creditNoteDetails.issue')}
            </button>
            <button
              type="button"
              aria-label={t('creditNoteDetails.more')}
              className="inline-flex size-[46px] items-center justify-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] transition-colors hover:bg-white"
            >
              <img src={menuIcon} alt="" className="size-6" />
            </button>
          </div>
        </div>

        {/* Amount + PDF */}
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-medium text-text-primary">
                  {t('creditNoteDetails.amountToCredit')}
                </h2>
                <span className="inline-flex h-[31px] items-center gap-2 rounded-full bg-danger-100 px-3 text-sm font-medium text-danger-700">
                  <img src={arrowUpLeftIcon} alt="" className="size-[18px]" />
                  {t('creditNoteDetails.reducesRevenue')}
                </span>
              </div>

              <div className="mb-4 flex items-center gap-2.5">
                <img src={minusIcon} alt="" className="size-7 shrink-0" />
                <OmAmount
                  size="lg"
                  amount={note.amount}
                  amountClassName="text-[37px] font-semibold leading-[1.2] text-text-primary/90"
                />
              </div>

              <div className="mb-4 h-px w-full bg-border-subtle" />

              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {t('creditNoteDetails.creditTotal')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={note.creditTotal}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-danger-700"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {t('creditNoteDetails.appliedTo', { id: note.reversingId })}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={note.applied}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-secondary"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {t('creditNoteDetails.refundDue')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={note.refundDue}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-success-700"
                  />
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-[#b7c4bd] bg-success-100 px-2.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-base font-medium text-[#3d5648]">
                    {t('creditNoteDetails.refundBannerTitle', { customer: note.customer.name })}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-text-tertiary">
                    {t('creditNoteDetails.refundBannerHint', { id: note.reversingId })}
                  </p>
                </div>
                <OmAmount
                  size="sm"
                  amount={note.refundDue}
                  amountClassName="text-xl font-semibold text-[#3d5648]"
                />
              </div>

              <div className="flex items-center gap-1 rounded-sm bg-[#f7f1e6] px-3 py-2">
                <img src={warningIcon} alt="" className="size-[17px] shrink-0" />
                <p className="text-sm font-medium leading-[1.2]">
                  <span className="text-text-primary">{t('creditNoteDetails.notSent')}</span>{' '}
                  <span className="text-text-tertiary">
                    {t('creditNoteDetails.notSentHint', { customer: note.customer.name })}
                  </span>
                </p>
              </div>
            </section>

            <SectionCard
              title={t('creditNoteDetails.details')}
              action={
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-base font-semibold text-primary-800"
                >
                  {t('creditNoteDetails.viewCustomer')}
                  <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
                </button>
              }
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-[#f3f4f5] px-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">
                      {t('creditNoteDetails.reverses', { id: note.original.id })}
                    </p>
                    <span className="inline-flex h-[25px] items-center gap-1.5 rounded-full border border-[#dbe2de] bg-success-100 px-3 text-sm font-semibold text-success-700">
                      <span className="size-1.5 rounded-full bg-success-700" />
                      {t('creditNoteDetails.settled')}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-text-quaternary">
                    {t('creditNoteDetails.originalMeta', {
                      amount: note.original.total,
                      date: note.original.issued,
                    })}
                  </p>
                </div>
                <Link
                  to={`/invoices/${note.original.id}`}
                  className="inline-flex items-center rounded-sm border border-border-subtle bg-white px-2.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-background"
                >
                  {t('creditNoteDetails.openInvoice')}
                </Link>
              </div>

              <div className="mb-6 flex items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img
                    src={customerLogo}
                    alt=""
                    className="size-12 shrink-0 rounded-sm object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {note.customer.name}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {note.customer.vat}
                    </p>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                  <img src={peppolBadgeIcon} alt="" className="size-4" />
                  {t('creditNoteDetails.onPeppol')}
                </span>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <MetaField
                    label={t('creditNoteDetails.fields.number')}
                    value={noteId === note.id ? note.fields.number : noteId}
                  />
                  <MetaField
                    label={t('creditNoteDetails.fields.issueDate')}
                    value={note.fields.issueDate}
                  />
                  <MetaField
                    label={t('creditNoteDetails.fields.currency')}
                    value={note.fields.currency}
                  />
                </div>
                <div className="flex flex-wrap gap-6 lg:gap-20">
                  <MetaField
                    label={t('creditNoteDetails.fields.concerning')}
                    value={
                      <Link
                        to={`/invoices/${note.fields.concerning}`}
                        className="text-primary-800 hover:underline"
                      >
                        {note.fields.concerning}
                      </Link>
                    }
                  />
                  <MetaField
                    label={t('creditNoteDetails.fields.po')}
                    value={note.fields.poReference}
                  />
                  <MetaField
                    label={t('creditNoteDetails.fields.tax')}
                    value={note.fields.taxCategory}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-[#727579]">
                    {t('creditNoteDetails.fields.reason')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] bg-[#f7f1e6] px-3 text-sm font-semibold text-[#6d5a39]">
                      <img src={returnIcon} alt="" className="size-5 rotate-180 -scale-y-100" />
                      {note.fields.reason}
                    </span>
                    <span className="text-sm font-medium text-text-primary">{note.fields.rma}</span>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          <aside className="flex h-[623px] w-full shrink-0 flex-col overflow-hidden rounded-sm border border-border-subtle bg-surface-background xl:w-[448px]">
            <div className="flex items-center justify-between bg-surface-card px-3.5 py-4">
              <div className="flex items-center gap-1.5">
                <img src={pdfIcon} alt="" className="size-6" />
                <p className="text-sm font-medium text-text-secondary">
                  {t('creditNoteDetails.pdfTitle')}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label={t('creditNoteDetails.zoomOut')}>
                    <img src={zoomOutIcon} alt="" className="size-6" />
                  </button>
                  <span className="text-xs font-medium text-text-tertiary">100%</span>
                  <button type="button" aria-label={t('creditNoteDetails.zoomIn')}>
                    <img src={zoomInIcon} alt="" className="size-6" />
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  <button type="button" aria-label={t('creditNoteDetails.download')}>
                    <img src={downloadIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('creditNoteDetails.print')}>
                    <img src={printIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('creditNoteDetails.fullscreen')}>
                    <img src={fullscreenIcon} alt="" className="size-6" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-auto p-6 pt-4">
              <img
                src={creditPreview}
                alt={t('creditNoteDetails.pdfAlt', { id: noteId })}
                className="w-full max-w-[413px] rounded-sm shadow-card"
              />
            </div>
          </aside>
        </div>

        {/* Items */}
        <SectionCard title={t('creditNoteDetails.items')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-start">
              <thead>
                <tr className="border-b border-surface-background text-xs font-semibold uppercase tracking-[1.44px] text-text-quaternary">
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.description')}</th>
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.unitPrice')}</th>
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.vat')}</th>
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.qty')}</th>
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.unit')}</th>
                  <th className="py-2 font-semibold">{t('creditNoteDetails.col.disc')}</th>
                  <th className="py-2 text-end font-semibold">{t('creditNoteDetails.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {note.items.map((item) => (
                  <tr key={item.id} className="border-b border-surface-background">
                    <td className="py-3 pe-4">
                      <p className="text-base font-medium text-text-primary">{item.description}</p>
                      <p className="text-sm font-medium text-text-quaternary">{item.note}</p>
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
                {t('creditNoteDetails.totals.net')}
              </span>
              <NegativeOm amount={note.totals.net} />
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-text-tertiary">
                {t('creditNoteDetails.totals.vat')}
              </span>
              <NegativeOm amount={note.totals.vat} />
            </div>
            <div className="my-1 h-px w-full bg-border-subtle" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-text-primary">
                {t('creditNoteDetails.totals.total')}
              </span>
              <NegativeOm
                amount={note.totals.total}
                size="sm"
                amountClassName="text-xl font-semibold text-danger-700"
              />
            </div>
          </div>
        </SectionCard>

        {/* Notes & attachments */}
        <SectionCard title={t('creditNoteDetails.notesTitle')}>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary">
                  {t('creditNoteDetails.noteCustomer')}
                </p>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('creditNoteDetails.onCreditNote')}
                </span>
              </div>
              <div className="rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-primary">
                {note.notes.customer}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-sm font-medium text-text-primary">
                  {t('creditNoteDetails.noteInternal')}
                </p>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('creditNoteDetails.private')}
                </span>
              </div>
              <div className="rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.2] text-text-primary">
                {note.notes.internal}
              </div>
            </div>
          </div>

          <p className="mb-2 text-sm font-medium text-text-primary">
            {t('creditNoteDetails.supportingDocs')}
          </p>
          <button
            type="button"
            className="flex w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-[#a1a4ab] bg-primary-25 px-4 py-8 text-center"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            <span className="text-base font-medium text-text-secondary">
              {t('creditNoteDetails.dropFiles')}
            </span>
            <span className="text-sm font-medium text-[#737781]">
              {t('creditNoteDetails.dropHint')}
            </span>
          </button>
        </SectionCard>

        {/* Refunds + Activity */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title={t('creditNoteDetails.refunds')}
            action={
              <button
                type="button"
                className="inline-flex items-center gap-2 text-base font-semibold text-primary-700"
              >
                <img src={plusIcon} alt="" className="size-6" />
                {t('creditNoteDetails.recordRefund')}
              </button>
            }
          >
            <div className="mx-auto flex max-w-[400px] flex-col items-center gap-4 py-2 text-center">
              <div className="flex size-[60px] items-center justify-center rounded-[30px] bg-[#f3f4f5]">
                <img src={cardIcon} alt="" className="size-[25px]" />
              </div>
              <div>
                <p className="inline-flex flex-wrap items-center justify-center gap-1 text-xl font-medium text-text-secondary">
                  <OmAmount
                    size="sm"
                    amount={note.refundDue}
                    amountClassName="text-xl font-medium text-text-secondary"
                  />
                  <span>{t('creditNoteDetails.refundPending')}</span>
                </p>
                <p className="mt-2 text-sm font-medium text-text-quaternary">
                  {t('creditNoteDetails.refundPendingHint', { id: note.reversingId })}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-[45px] items-center justify-center rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('creditNoteDetails.recordRefund')}
              </button>
            </div>
          </SectionCard>

          <SectionCard title={t('creditNoteDetails.activity')}>
            <ol className="flex flex-col">
              {note.activity.map((event, index) => {
                const isLast = index === note.activity.length - 1
                return (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex w-[52px] flex-col items-center">
                      {event.pending ? (
                        <span className="flex size-[27px] shrink-0 items-center justify-center rounded-full bg-success-700">
                          <span className="size-3.5 rounded-full bg-white" />
                        </span>
                      ) : (
                        <img src={timelineCheckIcon} alt="" className="size-[27px] shrink-0" />
                      )}
                      {isLast ? null : <span className="my-1 w-0.5 flex-1 bg-success-700" />}
                    </div>
                    <div className={['min-w-0 pb-6', isLast ? 'pb-0' : ''].join(' ')}>
                      <p className="text-base font-medium text-text-secondary">{event.title}</p>
                      <p className="mt-1.5 text-sm font-medium text-text-tertiary">{event.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </SectionCard>
        </div>
      </div>
    </AppShell>
  )
}

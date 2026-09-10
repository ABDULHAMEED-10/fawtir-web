import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { useDocumentPreview } from '../../components/invoice/useDocumentPreview'
import { DEBIT_NOTE_DETAIL } from '../../lib/debitNoteDetail'
import downloadIcon from '../../assets/self-bill-detail/download.svg'
import recordPaymentIcon from '../../assets/debit-note-create/issue.svg'
import trendUpIcon from '../../assets/debit-note-create/trend-up.svg'
import peppolIcon from '../../assets/debit-note-create/peppol.svg'
import invoiceTileIcon from '../../assets/debit-note-create/invoice-tile.svg'
import filePdfIcon from '../../assets/debit-note-detail/file-pdf.svg'
import zoomOutIcon from '../../assets/debit-note-detail/zoom-out.svg'
import zoomInIcon from '../../assets/debit-note-detail/zoom-in.svg'
import pdfDownloadIcon from '../../assets/debit-note-detail/download.svg'
import printIcon from '../../assets/debit-note-detail/print.svg'
import fullScreenIcon from '../../assets/debit-note-detail/full-screen.svg'
import debitPreview from '../../assets/debit-note-detail/debit-preview.png'
import timelineDoneIcon from '../../assets/credit-note-detail/timeline-check.svg'
import timelineOpenIcon from '../../assets/self-bill-detail/timeline-open.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import plusIcon from '../../assets/periodic/plus.svg'
import clockIcon from '../../assets/periodic/clock.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import { RialMark, RowsView, withRial } from '../../components/ui'

/** Green "+ ﷼ amount" — a debit note only ever adds to the balance. */
function PlusAmount({ value, size = 'sm' }: { value: string; size?: 'sm' | 'md' | 'lg' }) {
  const text = {
    sm: 'text-sm font-semibold',
    md: 'text-[19px] font-semibold',
    lg: 'text-2xl font-semibold',
  }[size]
  const mark = { sm: 'w-4', md: 'w-5', lg: 'w-6' }[size]
  return (
    <span className="inline-flex items-center gap-1 text-success-700">
      <span className={text}>+</span>
      <RialMark className={['shrink-0 text-success-700', mark].join(' ')} />
      <span className={text}>{value}</span>
    </span>
  )
}

/** The sign takes the figure's colour (`className`, or the text around it). */
function Amount({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={['inline-flex items-center gap-1', className].join(' ')}>
      <RialMark className="w-5 shrink-0" />
      {value}
    </span>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="mt-2 text-xl font-semibold leading-[1.2] text-text-secondary">{children}</p>
    </div>
  )
}

function DetailField({ label, value, brand }: { label: string; value: string; brand?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p
        className={[
          'mt-1.5 text-sm font-medium leading-[1.2]',
          brand ? 'text-primary-800' : 'text-text-primary',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

export function DebitNoteDetailPage() {
  const { t } = useTranslation()
  const preview = useDocumentPreview()
  const doc = DEBIT_NOTE_DETAIL

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                to="/invoices"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('debitNoteDetail.breadcrumbIncome')}
              </Link>
              <img
                src={backIcon}
                alt=""
                aria-hidden="true"
                className="size-6 rotate-180 rtl:rotate-0"
              />
              <Link
                to="/income/debit-notes"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('debitNoteDetail.breadcrumbDebitNotes')}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{doc.id}</h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-semibold text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-700" />
                {t(doc.statusKey)}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2] text-text-quaternary">
              <span>{t('debitNoteDetail.reversing')}</span>
              <span className="font-semibold text-text-primary">{doc.reversing}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span>{t('debitNoteDetail.for')}</span>
              <span className="font-semibold text-text-primary">{doc.customer}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t('debitNoteDetail.download')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              {t('debitNoteDetail.sendReminder')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={recordPaymentIcon} alt="" className="size-6" />
              {t('debitNoteDetail.recordPayment')}
            </button>
          </div>
        </div>

        {/* Amount charged + Details | PDF preview */}
        <div className="grid gap-4 xl:grid-cols-[680fr_448px]">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('debitNoteDetail.amountCharged')}
                </h2>
                <span className="inline-flex items-center gap-2 rounded-sm bg-success-100 px-3 py-1.5 text-sm font-medium text-success-700">
                  <img src={trendUpIcon} alt="" className="size-[18px]" />
                  {t('debitNoteDetail.increasesRevenue')}
                </span>
              </div>

              <p className="mt-5 inline-flex items-center gap-2 text-[40px] font-semibold leading-[1.2] text-success-700">
                +
                <RialMark className="w-9 shrink-0 text-success-700" />
                {doc.amount.total}
              </p>

              <div className="mt-7 grid gap-6 sm:grid-cols-3">
                <Stat label={t('debitNoteDetail.stats.debitTotal')}>
                  <Amount value={doc.amount.debitTotal} className="text-success-700" />
                </Stat>
                <Stat label={t('debitNoteDetail.stats.addedTo', { invoice: doc.reversing })}>
                  <Amount value={doc.amount.addedTo} />
                </Stat>
                <Stat label={t('debitNoteDetail.stats.nowDue')}>
                  <Amount value={doc.amount.nowDue} />
                </Stat>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#e7e3da] bg-pending-100 p-3">
                <div className="min-w-0">
                  <p className="text-base font-medium leading-[1.2] text-pending-700">
                    {t('debitNoteDetail.awaitingFrom', { customer: doc.customerShort })}
                  </p>
                  <p className="mt-1.5 text-[10px] font-medium leading-[1.3] text-text-tertiary">
                    {t('debitNoteDetail.awaitingHint', { invoice: doc.reversing })}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xl font-semibold text-text-secondary">
                  <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                  {doc.amount.bannerAmount}
                </span>
              </div>
            </section>

            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t('debitNoteDetail.sections.details')}
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-base font-semibold text-primary-800 hover:underline"
                >
                  {t('debitNoteDetail.viewCustomer')}
                  <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
                </button>
              </div>
              <div className="my-4 h-px bg-surface-background" />

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-medium leading-[1.2] text-text-primary">
                      {t('debitNoteDetail.adjusts', { invoice: doc.adjusts.invoice })}
                    </p>
                    <span className="inline-flex h-[25px] items-center gap-2 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-semibold text-pending-700">
                      <span className="size-1.5 rounded-full bg-pending-700" />
                      {t(doc.adjusts.chipKey)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-quaternary">
                    {withRial(doc.adjusts.meta)}
                  </p>
                </div>
                <Link
                  to={`/invoices/${doc.adjusts.invoice}`}
                  className="inline-flex h-[38px] shrink-0 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-neutral-25"
                >
                  {t('debitNoteDetail.openInvoice')}
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-75 bg-primary-25 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <img src={invoiceTileIcon} alt="" className="size-9 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-[1.2] text-text-primary">
                      {doc.customerCard.name}
                    </p>
                    <p className="mt-1.5 truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                      {doc.customerCard.vat}
                    </p>
                  </div>
                </div>
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-primary-75 bg-white px-3 text-xs font-semibold text-primary-800">
                  <img src={peppolIcon} alt="" className="size-4" />
                  {t('debitNoteDetail.onPeppol')}
                </span>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <DetailField label={t('debitNoteDetail.fields.number')} value={doc.fields.number} />
                <DetailField
                  label={t('debitNoteDetail.fields.issueDate')}
                  value={doc.fields.issueDate}
                />
                <DetailField
                  label={t('debitNoteDetail.fields.paymentDue')}
                  value={doc.fields.paymentDue}
                />
                <DetailField
                  label={t('debitNoteDetail.fields.concerningInvoice')}
                  value={doc.fields.concerningInvoice}
                  brand
                />
                <DetailField
                  label={t('debitNoteDetail.fields.poReference')}
                  value={doc.fields.poReference}
                />
                <DetailField
                  label={t('debitNoteDetail.fields.taxCategory')}
                  value={doc.fields.taxCategory}
                />
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium leading-[1.2] text-[#727579]">
                  {t('debitNoteDetail.fields.reason')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="inline-flex h-[25px] items-center gap-1.5 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-semibold text-pending-700">
                    <img src={trendUpIcon} alt="" className="size-3.5" />
                    {doc.reason.chip}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{doc.reason.detail}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* PDF preview — 448x623 panel, 62px white toolbar, 429x443 page (Figma 13:45495). */}
          <aside className="flex h-[623px] w-full shrink-0 flex-col overflow-hidden bg-[#f3f3f3] xl:w-[448px]">
            <div className="flex h-[62px] shrink-0 items-center justify-between bg-white px-3.5">
              <span className="inline-flex items-center gap-[7px]">
                <img src={filePdfIcon} alt="" className="size-6" />
                <span className="text-sm font-medium leading-[1.2] text-text-secondary">
                  {t('debitNoteDetail.pdfTitle')}
                </span>
              </span>
              <span className="flex items-center gap-[10px]">
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={t('debitNoteDetail.zoomOut')}
                    disabled={!preview.canZoomOut}
                    onClick={preview.zoomOut}
                    className="disabled:opacity-40"
                  >
                    <img src={zoomOutIcon} alt="" className="size-6" />
                  </button>
                  <span className="min-w-[38px] text-center text-xs font-medium leading-[1.2] text-[#444957] tabular-nums">
                    {preview.zoom}%
                  </span>
                  <button
                    type="button"
                    aria-label={t('debitNoteDetail.zoomIn')}
                    disabled={!preview.canZoomIn}
                    onClick={preview.zoomIn}
                    className="disabled:opacity-40"
                  >
                    <img src={zoomInIcon} alt="" className="size-6" />
                  </button>
                </span>
                <span className="flex items-center gap-2.5">
                  {/* Nothing is generated yet, so download hands over the page we are showing. */}
                  <a href={debitPreview} download aria-label={t('debitNoteDetail.download')}>
                    <img src={pdfDownloadIcon} alt="" className="size-6" />
                  </a>
                  <button
                    type="button"
                    aria-label={t('debitNoteDetail.print')}
                    onClick={preview.print}
                  >
                    <img src={printIcon} alt="" className="size-6" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('debitNoteDetail.fullScreen')}
                    aria-pressed={preview.fullscreen}
                    onClick={preview.openFullscreen}
                  >
                    <img src={fullScreenIcon} alt="" className="size-6" />
                  </button>
                </span>
              </span>
            </div>
            <div className="flex flex-1 justify-center overflow-hidden px-[10px] pt-[22px]">
              <img
                src={debitPreview}
                alt={t('debitNoteDetail.pdfTitle')}
                style={{ width: `${preview.zoom}%` }}
                className="max-w-[429px] self-start object-contain object-top transition-[width]"
              />
            </div>

            {preview.fullscreen ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t('debitNoteDetail.pdfTitle')}
                className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/70 p-6"
                onClick={preview.closeFullscreen}
              >
                <img
                  src={debitPreview}
                  alt={t('debitNoteDetail.pdfTitle')}
                  className="max-h-full rounded-sm shadow-card"
                />
                <button
                  type="button"
                  onClick={preview.closeFullscreen}
                  className="absolute end-6 top-6 rounded-sm bg-white/90 px-3 py-1.5 text-sm font-semibold text-text-secondary"
                >
                  {t('common.close')}
                </button>
              </div>
            ) : null}
          </aside>
        </div>

        {/* Items — full width */}
        <Card>
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
            {t('debitNoteDetail.sections.items')}
          </h2>
          <div className="my-4 h-px bg-surface-background" />
          <RowsView>
            <table className="w-full min-w-[900px] border-collapse text-start">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-text-quaternary">
                  <th className="pb-2 text-start font-semibold">
                    {t('debitNoteDetail.col.description')}
                  </th>
                  <th className="pb-2 text-start font-semibold">
                    {t('debitNoteDetail.col.difference')}
                  </th>
                  <th className="pb-2 text-start font-semibold">{t('debitNoteDetail.col.vat')}</th>
                  <th className="pb-2 text-start font-semibold">{t('debitNoteDetail.col.qty')}</th>
                  <th className="pb-2 text-start font-semibold">{t('debitNoteDetail.col.unit')}</th>
                  <th className="pb-2 text-start font-semibold">{t('debitNoteDetail.col.disc')}</th>
                  <th className="pb-2 text-end font-semibold">{t('debitNoteDetail.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.id} className="border-t border-surface-background">
                    <td className="py-3 pe-2">
                      <p className="text-base font-medium leading-[1.2] text-text-primary">
                        {item.description}
                      </p>
                      <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-quaternary">
                        {item.meta}
                      </p>
                    </td>
                    <td className="py-3 text-sm font-medium text-text-secondary">
                      {item.difference}
                    </td>
                    <td className="py-3 text-sm font-medium text-text-secondary">{item.vat}</td>
                    <td className="py-3 text-base font-medium text-text-secondary">{item.qty}</td>
                    <td className="py-3 text-base font-medium text-text-secondary">{item.unit}</td>
                    <td className="py-3 text-sm font-medium text-text-secondary">
                      {item.discount}
                    </td>
                    <td className="py-3 text-end text-xl font-semibold text-text-primary">
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RowsView>
          <div className="ms-auto mt-5 flex w-full max-w-[354px] flex-col gap-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('debitNoteDetail.totals.net')}
              </span>
              <span className="inline-flex items-center gap-1 text-[19px] font-semibold text-text-tertiary">
                +
                <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                {doc.totals.net}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('debitNoteDetail.totals.vat')}
              </span>
              <span className="inline-flex items-center gap-1 text-[19px] font-semibold text-text-tertiary">
                +
                <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                {doc.totals.vat}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">
                {t('debitNoteDetail.totals.total')}
              </span>
              <PlusAmount value={doc.totals.total} size="lg" />
            </div>
          </div>
        </Card>

        {/* Notes & attachments — full width */}
        <Card>
          <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
            {t('debitNoteDetail.sections.notes')}
          </h2>
          <div className="my-4 h-px bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">
                  {t('debitNoteDetail.notes.customer')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('debitNoteDetail.notes.onDebitNote')}
                </span>
              </p>
              <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary">
                {doc.notes.customer}
              </div>
            </div>
            <div>
              <p className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium leading-[1.2] text-text-primary">
                  {t('debitNoteDetail.notes.internal')}
                </span>
                <span className="text-xs font-medium text-text-quaternary">
                  {t('debitNoteDetail.notes.private')}
                </span>
              </p>
              <div className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary">
                {doc.notes.internal}
              </div>
            </div>
          </div>
        </Card>

        {/* Refunds | Activity — two 564px cards */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('debitNoteDetail.sections.refunds')}
              </h2>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-base font-semibold text-primary-700 hover:underline"
              >
                <img src={plusIcon} alt="" className="size-5" />
                {t('debitNoteDetail.refunds.record')}
              </button>
            </div>
            <div className="my-4 h-px bg-surface-background" />
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="flex size-[60px] items-center justify-center rounded-full bg-pending-100">
                <img src={clockIcon} alt="" className="size-6" />
              </span>
              <p className="flex flex-wrap items-center justify-center gap-2 text-xl font-medium text-text-secondary">
                <Amount value={doc.refund.amount} className="text-[23px] font-semibold" />
                {t(doc.refund.labelKey)}
              </p>
              <p className="max-w-[400px] text-sm font-medium leading-[1.4] text-text-quaternary">
                {withRial(doc.refund.hint)}
              </p>
              <button
                type="button"
                className="inline-flex h-[45px] items-center rounded-sm bg-primary-700 px-6 text-base font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('debitNoteDetail.recordPayment')}
              </button>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t('debitNoteDetail.sections.activity')}
            </h2>
            <div className="my-4 h-px bg-surface-background" />
            <ol className="flex flex-col">
              {doc.activity.map((event, index) => {
                const isLast = index === doc.activity.length - 1
                const open = event.tone === 'open'
                return (
                  <li key={event.id} className="flex gap-3">
                    <div className="flex w-7 shrink-0 flex-col items-center">
                      {open ? (
                        // 28px sand disc with the white clock inside.
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pending-500">
                          <img src={timelineOpenIcon} alt="" className="size-[18px]" />
                        </span>
                      ) : (
                        <img src={timelineDoneIcon} alt="" className="size-[27px] shrink-0" />
                      )}
                      {isLast ? null : (
                        <span
                          className={[
                            'my-1 w-0.5 flex-1',
                            open ? 'bg-pending-500' : 'bg-success-700',
                          ].join(' ')}
                        />
                      )}
                    </div>
                    <div className={['min-w-0 flex-1', isLast ? 'pb-0' : 'pb-5'].join(' ')}>
                      <p className="text-base font-medium leading-[1.2] text-text-secondary">
                        {event.title}
                      </p>
                      <p className="mt-1.5 text-sm font-medium leading-[1.3] text-text-tertiary">
                        {withRial(event.detail)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

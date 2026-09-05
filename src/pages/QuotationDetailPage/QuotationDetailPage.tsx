import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, RowsView, StepTracker } from '../../components/ui'
import { quotationRowActions } from '../../lib/rowActions'
import { QUOTATION_DETAIL } from '../../lib/quotationDetail'
import backIcon from '../../assets/quotation-detail/back.svg'
import downloadIcon from '../../assets/quotation-detail/download.svg'
import customerLogo from '../../assets/quotation-detail/customer-logo.svg'
import arrowRightIcon from '../../assets/quotation-detail/arrow-right.svg'
import filePdfIcon from '../../assets/quotation-detail/file-pdf.svg'
import zoomOutIcon from '../../assets/quotation-detail/zoom-out.svg'
import zoomInIcon from '../../assets/quotation-detail/zoom-in.svg'
import pdfDownloadIcon from '../../assets/quotation-detail/pdf-download.svg'
import printIcon from '../../assets/quotation-detail/print.svg'
import fullScreenIcon from '../../assets/quotation-detail/full-screen.svg'
import timelineOpenIcon from '../../assets/quotation-detail/timeline-open.svg'
import timelineDoneIcon from '../../assets/quotation-detail/timeline-done.svg'
import quotationPreview from '../../assets/quotation-detail/quotation-preview.png'
import omrIcon from '../../assets/quotations/omr-row.svg'

const STAT_TONE = {
  normal: 'text-[#151c2d] font-medium',
  warning: 'text-[#6d5a39] font-medium',
  strong: 'text-[#151c2d] font-semibold',
} as const

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  )
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{title}</h2>
      {action}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: keyof typeof STAT_TONE
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</span>
      <span className={['text-sm leading-[1.2]', STAT_TONE[tone]].join(' ')}>{value}</span>
    </div>
  )
}

function Amount({ value, size = 'md' }: { value: string; size?: 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-2xl font-semibold' : 'text-[19px] font-semibold'
  const mark = size === 'lg' ? 'w-6' : 'w-5'
  return (
    <span className="inline-flex items-center gap-0.5">
      <img src={omrIcon} alt="" className={['h-auto shrink-0', mark].join(' ')} />
      <span className={text}>{value}</span>
    </span>
  )
}

export function QuotationDetailPage() {
  const { t } = useTranslation()
  const doc = QUOTATION_DETAIL

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {/* Trade documents › Quotations — then the number, status and one-line summary. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-medium leading-[1.2] text-[#5b606c]">
                {t('quotationDetail.breadcrumbParent')}
              </span>
              <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
              <Link
                to="/trade-documents/quotations"
                className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
              >
                {t('quotationDetail.breadcrumbQuotations')}
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">{doc.id}</h1>
              <span className="inline-flex items-center rounded-full border border-[#d5dcf1] bg-[#f4f6fb] px-3 py-[5px] text-sm font-semibold text-[#2c4eb7]">
                {t(doc.statusKey)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              <span className="font-medium text-[#5b606c]">{doc.subject}</span>
              <span className="font-medium text-[#5b606c]">·</span>
              <span className="font-medium text-[#5b606c]">{t('quotationDetail.for')}</span>
              <span className="font-semibold text-[#151c2d]">{doc.customer}</span>
              <span className="font-medium text-[#5b606c]">·</span>
              <span className="font-medium text-[#5b606c]">{doc.validTo}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionMenu
              items={quotationRowActions(doc.id)}
              label={t('quotationDetail.moreActions')}
              variant="bordered"
            />
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t('quotationDetail.download')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a]"
            >
              {t('quotationDetail.sendReminder')}
            </button>
          </div>
        </div>

        {/* Trade chain strip */}
        <Card className="flex flex-wrap items-center gap-6 px-6 py-4">
          <StepTracker steps={doc.steps} size="md" />
          <p className="min-w-[280px] flex-1 text-sm font-medium leading-[1.2] text-[#444957]">
            {doc.chainNote}
          </p>
        </Card>

        {/* Decision + Details (680) | Quotation PDF (448) */}
        <div className="grid gap-4 xl:grid-cols-[680fr_448px]">
          <div className="flex flex-col gap-4">
            <Card className="border border-[#f3f3f3]">
              <h2 className="text-2xl font-medium leading-[1.2] text-[#151c2d]">
                {doc.decision.title}
              </h2>
              <p className="mt-0.5 text-sm font-medium leading-[1.2] text-[#5b606c]">
                {doc.decision.detail}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-[41px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                >
                  {t('quotationDetail.markAccepted')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-[41px] items-center rounded-sm border border-black/[0.06] bg-surface-tab-bar px-4 text-sm font-semibold text-[#3a3a3a]"
                >
                  {t('quotationDetail.markDeclined')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-[41px] items-center rounded-sm border border-black/[0.06] bg-surface-tab-bar px-4 text-sm font-semibold text-[#3a3a3a]"
                >
                  {t('quotationDetail.extendValidity')}
                </button>
                <button
                  type="button"
                  className="inline-flex h-[41px] items-center rounded-sm border border-black/[0.06] bg-surface-tab-bar px-4 text-sm font-semibold text-[#3a3a3a]"
                >
                  {t('quotationDetail.reviseResend')}
                </button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-4">
                {doc.decision.stats.map((stat) => (
                  <Stat
                    key={stat.labelKey}
                    label={t(stat.labelKey)}
                    value={stat.value}
                    tone={stat.tone}
                  />
                ))}
              </div>
            </Card>

            <Card className="pb-6">
              <SectionTitle
                title={t('quotationDetail.details')}
                action={
                  <Link
                    to="/customers"
                    className="inline-flex items-center gap-0.5 text-base font-semibold text-[#233e92]"
                  >
                    {t('quotationDetail.viewCustomer')}
                    <img src={arrowRightIcon} alt="" className="size-5 rtl:rotate-180" />
                  </Link>
                }
              />
              <div className="flex flex-wrap items-center gap-2.5 rounded-sm border border-primary-300 bg-[#f4f6fb] px-2 py-[13px]">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-sm">
                  <img src={customerLogo} alt="" className="size-[39px]" />
                </span>
                <div className="flex flex-col gap-[3px]">
                  <p className="text-sm font-medium leading-[1.2] text-[#151c2d]">
                    {doc.customerCard.name}
                  </p>
                  <p className="text-xs font-medium leading-[1.2] text-[#5b606c]">
                    {doc.customerCard.vat}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-6 sm:grid-cols-3">
                <Stat
                  label={t('quotationDetail.issueDate')}
                  value={doc.fields.issueDate}
                  tone="normal"
                />
                <Stat
                  label={t('quotationDetail.validUntil')}
                  value={doc.fields.validUntil}
                  tone="warning"
                />
                <Stat
                  label={t('quotationDetail.paymentTerms')}
                  value={doc.fields.paymentTerms}
                  tone="normal"
                />
                <Stat
                  label={t('quotationDetail.expectedDelivery')}
                  value={doc.fields.expectedDelivery}
                  tone="normal"
                />
                <Stat label={t('quotationDetail.branch')} value={doc.fields.branch} tone="normal" />
                <Stat
                  label={t('quotationDetail.taxCategory')}
                  value={doc.fields.taxCategory}
                  tone="normal"
                />
              </div>
            </Card>
          </div>

          {/* Quotation PDF — 448x500 panel, 62px toolbar, 370x421 page */}
          <aside className="flex h-[500px] w-full shrink-0 flex-col overflow-hidden rounded-sm border border-[#e8e8ea] bg-[#f3f3f3] xl:w-[448px]">
            <div className="flex h-[62px] shrink-0 items-center justify-between bg-white px-3.5">
              <span className="inline-flex items-center gap-[7px]">
                <img src={filePdfIcon} alt="" className="size-6" />
                <span className="text-sm font-medium leading-[1.2] text-[#2c3342]">
                  {t('quotationDetail.pdfTitle')}
                </span>
              </span>
              <span className="flex items-center gap-6">
                <span className="flex items-center gap-1.5">
                  <button type="button" aria-label={t('quotationDetail.zoomOut')}>
                    <img src={zoomOutIcon} alt="" className="size-6" />
                  </button>
                  <span className="text-xs font-medium leading-[1.2] text-[#444957]">100%</span>
                  <button type="button" aria-label={t('quotationDetail.zoomIn')}>
                    <img src={zoomInIcon} alt="" className="size-6" />
                  </button>
                </span>
                <span className="flex items-center gap-2.5">
                  <button type="button" aria-label={t('quotationDetail.download')}>
                    <img src={pdfDownloadIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('quotationDetail.print')}>
                    <img src={printIcon} alt="" className="size-6" />
                  </button>
                  <button type="button" aria-label={t('quotationDetail.fullScreen')}>
                    <img src={fullScreenIcon} alt="" className="size-6" />
                  </button>
                </span>
              </span>
            </div>
            <div className="flex flex-1 justify-center overflow-hidden px-[38px] pt-[6px]">
              <img
                src={quotationPreview}
                alt={t('quotationDetail.pdfTitle')}
                className="w-full max-w-[370px] self-start object-contain object-top"
              />
            </div>
          </aside>
        </div>

        {/* What was offered — full width */}
        <Card>
          <SectionTitle title={t('quotationDetail.itemsTitle')} />
          <RowsView>
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-[#f3f3f3] text-xs font-semibold leading-[1.2] text-[#5b606c]">
                  <th className="py-2 text-start">{t('quotationDetail.col.description')}</th>
                  <th className="w-[128px] py-2 text-start">
                    {t('quotationDetail.col.unitPrice')}
                  </th>
                  <th className="w-[94px] py-2 text-start">{t('quotationDetail.col.qty')}</th>
                  <th className="w-[117px] py-2 text-start">{t('quotationDetail.col.disc')}</th>
                  <th className="w-[113px] py-2 text-end">{t('quotationDetail.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">
                      <p className="text-base font-medium leading-[1.2] text-[#151c2d]">
                        {item.description}
                      </p>
                      <p className="mt-1 text-sm font-medium leading-[1.2] text-[#5b606c]">
                        {item.meta}
                      </p>
                    </td>
                    <td className="py-2 text-sm font-medium text-[#2c3342]">{item.unitPrice}</td>
                    <td className="py-2 text-base font-medium text-[#2c3342]">{item.qty}</td>
                    <td className="py-2 text-sm font-medium text-[#2c3342]">{item.discount}</td>
                    <td className="py-2 text-end text-xl font-semibold text-[#151c2d]/90">
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RowsView>
          <div className="mt-6 flex justify-end">
            <dl className="flex w-full max-w-[328px] flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('quotationDetail.subtotalExcl')}</dt>
                <dd>
                  <Amount value={doc.totals.subtotal} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('quotationDetail.discount')}</dt>
                <dd>
                  <Amount value={doc.totals.discount} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('quotationDetail.vatLine')}</dt>
                <dd>
                  <Amount value={doc.totals.vat} />
                </dd>
              </div>
              {/* Optional lines are quoted but not counted in the total until taken. */}
              <div className="flex items-center justify-between gap-3 text-[#444957]">
                <dt className="text-sm font-medium">{t('quotationDetail.optionalItems')}</dt>
                <dd>
                  <Amount value={doc.totals.optional} />
                </dd>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <dt className="text-sm font-medium text-[#151c2d]">
                  {t('quotationDetail.quotedTotal')}
                </dt>
                <dd className="text-[#2c3342]">
                  <Amount value={doc.totals.total} size="lg" />
                </dd>
              </div>
            </dl>
          </div>
        </Card>

        {/* Activity — full width */}
        <Card>
          <SectionTitle title={t('quotationDetail.activity')} />
          <ol className="flex flex-col">
            {doc.activity.map((event, i) => (
              <li key={event.id} className="flex gap-5">
                <span className="flex w-[52px] shrink-0 flex-col items-center">
                  <img
                    src={event.tone === 'open' ? timelineOpenIcon : timelineDoneIcon}
                    alt=""
                    className={event.tone === 'open' ? 'size-7' : 'size-[27px]'}
                  />
                  {i < doc.activity.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={[
                        'w-px flex-1',
                        event.tone === 'open' ? 'bg-[#887147]' : 'bg-[#4c6c5a]',
                      ].join(' ')}
                    />
                  ) : null}
                </span>
                <div className="flex flex-col gap-1.5 pb-6">
                  <p className="text-base font-medium leading-[1.2] text-[#2c3342]">
                    {event.title}
                  </p>
                  <p className="text-sm font-medium leading-[1.2] text-[#444957]">{event.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Notes & attachments — full width */}
        <Card>
          <SectionTitle title={t('quotationDetail.notesTitle')} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 flex flex-wrap items-baseline gap-1">
                <span className="text-sm font-medium leading-[1.2] text-[#151c2d]">
                  {t('quotationDetail.noteToCustomer')}
                </span>
                <span className="text-xs font-medium text-[#5b606c]">
                  {t('quotationDetail.noteToCustomerHint')}
                </span>
              </div>
              <p className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium leading-[1.2] text-[#151c2d]">
                {doc.notes.customer}
              </p>
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-baseline gap-1">
                <span className="text-sm font-medium leading-[1.2] text-[#151c2d]">
                  {t('quotationDetail.internalNote')}
                </span>
                <span className="text-xs font-medium text-[#5b606c]">
                  {t('quotationDetail.internalNoteHint')}
                </span>
              </div>
              <p className="min-h-[71px] rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium leading-[1.2] text-[#151c2d]">
                {doc.notes.internal}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

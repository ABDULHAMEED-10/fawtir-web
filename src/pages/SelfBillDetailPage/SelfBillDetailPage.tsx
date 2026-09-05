import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { SELF_BILL_DETAIL, type SelfBillTrack, type TrackTone } from '../../lib/selfBillDetail'
import peppolTrackIcon from '../../assets/self-bill-detail/track-peppol.svg'
import otaTrackIcon from '../../assets/self-bill-detail/track-ota.svg'
import supplierTrackIcon from '../../assets/self-bill-detail/track-supplier.svg'
import timelineDoneIcon from '../../assets/credit-note-detail/timeline-check.svg'
import downloadIcon from '../../assets/self-bill-detail/download.svg'
import recordPaymentIcon from '../../assets/self-bill-detail/record-payment.svg'
import arrowNextIcon from '../../assets/self-bill-detail/arrow-next.svg'
import timelineOpenIcon from '../../assets/self-bill-detail/timeline-open.svg'
import linkArrowIcon from '../../assets/self-bill-detail/link-arrow.svg'
import filePdfIcon from '../../assets/self-bill-detail/file-pdf.svg'
import fileJpgIcon from '../../assets/self-bill-detail/file-jpg.svg'
import fileDownloadIcon from '../../assets/self-bill-detail/file-download.svg'
import fileDeleteIcon from '../../assets/self-bill-detail/file-delete.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import warningIcon from '../../assets/self-bill-detail/warning.svg'
import { RowsView } from '../../components/ui'

const TRACK_ICONS: Record<string, string> = {
  peppol: peppolTrackIcon,
  ota: otaTrackIcon,
  supplier: supplierTrackIcon,
}

/** Tile tint and value colour per track outcome. */
const TRACK_TONE: Record<TrackTone, { tile: string; value: string }> = {
  success: { tile: 'bg-success-100', value: 'text-[#3d5648]' },
  pending: { tile: 'bg-pending-100', value: 'text-pending-700' },
  danger: { tile: 'bg-danger-100', value: 'text-danger-700' },
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="my-3 h-px bg-surface-background" />
      {children}
    </section>
  )
}

function TrackPanel({ track }: { track: SelfBillTrack }) {
  const { t } = useTranslation()
  const tone = TRACK_TONE[track.tone]

  return (
    <article className="rounded-sm bg-surface-card p-4">
      <div className="flex items-start gap-3.5">
        <img src={TRACK_ICONS[track.id]} alt="" className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
            {t(track.labelKey)}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={['text-xl font-medium leading-[1.2]', tone.value].join(' ')}>
              {track.value}
            </span>
            {track.code ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-25 px-3 py-1 text-sm font-medium text-primary-700">
                <span className="size-1.5 rounded-full bg-primary-700" />
                {track.code}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs font-medium leading-[1.3] text-text-tertiary">{track.note}</p>
    </article>
  )
}

function DetailField({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
      {note ? (
        <p className="mt-1.5 text-[10px] font-semibold leading-[1.2] text-pending-700">{note}</p>
      ) : null}
    </div>
  )
}

export function SelfBillDetailPage() {
  const { t } = useTranslation()
  const doc = SELF_BILL_DETAIL

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {/* Income › Self-billed — a chevron separates the two crumbs in Figma. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                to="/invoices"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('selfBillDetail.breadcrumbIncome')}
              </Link>
              <img
                src={backIcon}
                alt=""
                aria-hidden="true"
                className="size-6 rotate-180 rtl:rotate-0"
              />
              <Link
                to="/income/self-billing"
                className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t('selfBillDetail.breadcrumbSelfBilled')}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{doc.id}</h1>
              <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] bg-pending-100 px-3 text-sm font-medium text-pending-700">
                <span className="size-1.5 rounded-full bg-pending-700" />
                {t(doc.status.labelKey)}
              </span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2] text-text-quaternary">
              <span>{t('selfBillDetail.raisedFor')}</span>
              <span className="font-semibold text-text-primary">{doc.raisedFor}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span>{doc.issued}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span>{t('selfBillDetail.to')}</span>
              <span className="font-semibold text-text-primary">{doc.billedTo}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              <img src={downloadIcon} alt="" className="size-6" />
              {t('selfBillDetail.download')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
            >
              {t('selfBillDetail.sendReminder')}
            </button>
            <button
              type="button"
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={recordPaymentIcon} alt="" className="size-6" />
              {t('selfBillDetail.recordPayment')}
            </button>
          </div>
        </div>

        {/* Three independent status tracks */}
        <div className="grid gap-4 md:grid-cols-3">
          {doc.tracks.map((track) => (
            <TrackPanel key={track.id} track={track} />
          ))}
        </div>

        {/* Parties & details sits beside the Summary rail; the rest run full width. */}
        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          <SectionCard title={t('selfBillDetail.sections.parties')}>
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex-1 rounded-sm border border-border-subtle bg-surface-tab-bar p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('selfBillDetail.parties.seller')}
                </p>
                <p className="mt-1.5 text-base font-medium leading-[1.2] text-text-primary">
                  {doc.seller.name}
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t(doc.seller.noteKey)}
                </p>
              </div>
              <span className="flex shrink-0 items-center justify-center px-2">
                <img src={arrowNextIcon} alt="" className="size-6 rtl:rotate-180" />
              </span>
              <div className="flex-1 rounded-sm border border-primary-75 bg-primary-25 p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('selfBillDetail.parties.buyer')}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-medium leading-[1.2] text-text-primary">
                  {doc.buyer.name}
                  <span className="inline-flex h-[18px] items-center rounded-[2px] bg-primary-700 px-2 text-[10px] font-semibold text-white">
                    {t('selfBillDetail.parties.you')}
                  </span>
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t(doc.buyer.noteKey)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <DetailField
                label={t('selfBillDetail.fields.issueDate')}
                value={doc.fields.issueDate}
              />
              <DetailField
                label={t('selfBillDetail.fields.supplyDate')}
                value={doc.fields.supplyDate}
              />
              <DetailField
                label={t('selfBillDetail.fields.paymentDue')}
                value={doc.fields.paymentDue}
              />
              <DetailField
                label={t('selfBillDetail.fields.agreement')}
                value={doc.fields.agreement}
                note={doc.fields.agreementNote}
              />
              <DetailField
                label={t('selfBillDetail.fields.receivingBranch')}
                value={doc.fields.receivingBranch}
              />
              <DetailField
                label={t('selfBillDetail.fields.purchaseOrder')}
                value={doc.fields.purchaseOrder}
              />
            </div>
          </SectionCard>

          {/* Items supplied to you */}
          <aside>
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('selfBillDetail.summary.title')}
              </h2>
              <div className="mt-4 flex flex-col gap-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.subtotal')}
                  </span>
                  <span className="font-semibold text-text-secondary">{doc.summary.subtotal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.discount')}
                  </span>
                  <span className="font-semibold text-text-quaternary">
                    − {doc.summary.discount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.net')}
                  </span>
                  <span className="font-semibold text-text-secondary">{doc.summary.net}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-secondary">
                    {t('selfBillDetail.summary.vat')}
                  </span>
                  <span className="font-semibold text-text-secondary">{doc.summary.vat}</span>
                </div>
                <div className="h-px w-full bg-surface-background" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-text-primary">
                    {t('selfBillDetail.summary.totalDue')}
                  </span>
                  <span className="text-[22px] font-semibold leading-[1.2] text-text-primary">
                    {doc.summary.total}
                  </span>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <SectionCard title={t('selfBillDetail.sections.items')}>
          <RowsView>
            <table className="w-full min-w-[900px] border-collapse text-start">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-text-quaternary">
                  <th className="pb-2 text-start font-semibold">
                    {t('selfBillDetail.col.description')}
                  </th>
                  <th className="pb-2 text-start font-semibold">
                    {t('selfBillDetail.col.unitPrice')}
                  </th>
                  <th className="pb-2 text-start font-semibold">{t('selfBillDetail.col.vat')}</th>
                  <th className="pb-2 text-start font-semibold">{t('selfBillDetail.col.qty')}</th>
                  <th className="pb-2 text-start font-semibold">{t('selfBillDetail.col.unit')}</th>
                  <th className="pb-2 text-start font-semibold">{t('selfBillDetail.col.disc')}</th>
                  <th className="pb-2 text-end font-semibold">{t('selfBillDetail.col.total')}</th>
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
                      {item.unitPrice}
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

          <div className="ms-auto mt-4 flex w-full max-w-[334px] flex-col gap-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.subtotal')}
              </span>
              <span className="text-base font-semibold text-text-primary">
                {doc.totals.subtotal}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.discount')}
              </span>
              <span className="text-base font-semibold text-success-700">
                {doc.totals.discount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.net')}
              </span>
              <span className="text-base font-semibold text-text-primary">{doc.totals.net}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.vat')}
              </span>
              <span className="text-base font-semibold text-text-primary">{doc.totals.vat}</span>
            </div>
            <div className="h-px w-full bg-surface-background" />
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">
                {t('selfBillDetail.totals.total')}
              </span>
              <span className="text-xl font-semibold text-text-primary">{doc.totals.total}</span>
            </div>
          </div>
        </SectionCard>

        {/* History */}

        <SectionCard
          title={t('selfBillDetail.sections.history')}
          action={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"
            >
              {t('selfBillDetail.viewValidationReport')}
              <img src={linkArrowIcon} alt="" className="size-[18px] rtl:rotate-180" />
            </button>
          }
        >
          <ol className="flex flex-col">
            {doc.timeline.map((event, index) => {
              const isLast = index === doc.timeline.length - 1
              const current = event.tone === 'current'
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    {current ? (
                      // 28px #887147 disc with the white clock inside, per Figma.
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
                          current ? 'bg-pending-500' : 'bg-success-700',
                        ].join(' ')}
                      />
                    )}
                  </div>
                  <div className={['min-w-0 flex-1', isLast ? 'pb-0' : 'pb-6'].join(' ')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-base font-medium leading-[1.2] text-text-primary">
                        {event.title}
                      </p>
                      <span className="shrink-0 text-sm font-medium leading-[1.2] text-text-tertiary">
                        {event.timestamp}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                      {event.detail}
                    </p>
                    {event.callout ? (
                      <div className="mt-2.5 flex items-start gap-2 rounded-sm border border-border-brand-subtle bg-primary-25 p-2.5">
                        <img src={warningIcon} alt="" className="mt-0.5 size-[18px] shrink-0" />
                        <p className="text-xs font-medium leading-[1.4] text-text-secondary">
                          {event.callout}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </SectionCard>

        {/* Attachments */}
        <SectionCard title={t('selfBillDetail.sections.attachments')}>
          <div className="flex flex-col gap-3">
            {doc.attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-sm border border-border-subtle p-2.5"
              >
                <img
                  src={file.kind === 'pdf' ? filePdfIcon : fileJpgIcon}
                  alt=""
                  className="size-9 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium leading-[1.2] text-text-primary">
                    {file.name}
                  </p>
                  <p className="mt-1.5 truncate text-sm font-medium leading-[1.2] text-text-tertiary">
                    {file.meta}
                  </p>
                </div>
                {/* Figma gives each file a 32px download and delete button. */}
                <button
                  type="button"
                  aria-label={t('selfBillDetail.attachments.download')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle transition-colors hover:bg-neutral-25"
                >
                  <img src={fileDownloadIcon} alt="" className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t('selfBillDetail.attachments.delete')}
                  className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle transition-colors hover:bg-danger-100"
                >
                  <img src={fileDeleteIcon} alt="" className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar py-8">
              <img src={uploadIcon} alt="" className="size-8" />
              <p className="text-base font-medium text-text-secondary">
                {t('selfBillDetail.attachments.drop')}
              </p>
              <p className="text-sm font-medium text-text-muted">
                {t('selfBillDetail.attachments.hint')}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  )
}

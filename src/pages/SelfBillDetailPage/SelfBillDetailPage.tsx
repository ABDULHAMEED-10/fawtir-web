import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  downloadAttachment,
  invoicePath,
  loadAttachments,
  loadHistory,
  loadInvoice,
  loadPayments,
  loadReceivable,
  removeAttachment,
  uploadAttachment,
  type InvoiceAttachmentDto,
  type InvoiceDetailDto,
  type InvoiceHistoryDto,
  type InvoicePaymentDto,
  type InvoiceReceivableDto,
} from '../../api/invoices/detail'
import { loadCustomer, type CustomerDto } from '../../api/customers/customers'
import { recordBillPayment } from '../../api/expenditure/bills'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useBranchName } from '../../components/branch/useBranchName'
import {
  AGREEMENTS_PATH,
  loadAgreements,
  type AgreementDto,
} from '../../api/selfBilling/agreements'
import { attachmentRows, attachmentsEditable, isDraft } from '../../lib/invoiceDetail'
import {
  agreementNote,
  selfBillItems,
  selfBillOwed,
  selfBillStatus,
  selfBillTimeline,
  selfBillTracks,
  type SelfBillStatusTone,
  type SelfBillTrack,
  type TrackTone,
} from '../../lib/selfBillDetail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { fileSize } from '../../lib/supplierRecord'
import { muscatToday } from '../../lib/invoiceIssue'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import { FileDropzone, OmAmount, RowsView } from '../../components/ui'
import { RecordPaymentModal } from '../InvoiceDetailsPage/RecordPaymentModal'
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
import creditNoteIcon from '../../assets/invoice-details/credit-note.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'

/** What the attachment route takes: the invoice composer's list and limit. */
const ATTACHMENT_TYPES = '.pdf,.jpg,.jpeg,.png,.xlsx'
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const DROP_ZONE =
  'flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-3.5 transition-colors hover:bg-primary-25'

const TRACK_ICONS: Record<SelfBillTrack['id'], string> = {
  peppol: peppolTrackIcon,
  ota: otaTrackIcon,
  supplier: supplierTrackIcon,
}

/** Value colour per track outcome. */
const TRACK_TONE: Record<TrackTone, string> = {
  success: 'text-[#3d5648]',
  pending: 'text-pending-700',
  danger: 'text-danger-700',
  muted: 'text-text-quaternary',
}

const STATUS_PILL: Record<SelfBillStatusTone, { pill: string; dot: string }> = {
  muted: { pill: 'bg-neutral-25 text-text-quaternary', dot: 'bg-text-quaternary' },
  info: { pill: 'bg-primary-25 text-primary-900', dot: 'bg-primary-900' },
  pending: { pill: 'bg-pending-100 text-pending-700', dot: 'bg-pending-700' },
  success: { pill: 'bg-success-100 text-success-700', dot: 'bg-success-700' },
}

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
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
  return (
    <article className="rounded-sm bg-surface-card p-4">
      <div className="flex items-start gap-3.5">
        <img src={TRACK_ICONS[track.id]} alt="" className="size-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.6px] text-text-quaternary">
            {t(track.labelKey)}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={['text-xl font-medium leading-[1.2]', TRACK_TONE[track.tone]].join(' ')}
            >
              {t(track.valueKey, track.values)}
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
      <p className="mt-3 text-xs font-medium leading-[1.3] text-text-tertiary">
        {t(track.noteKey, track.noteValues)}
      </p>
    </article>
  )
}

function DetailField({
  label,
  value,
  note,
  noteTone = 'pending',
  to,
}: {
  label: string
  value: string
  note?: string | null
  noteTone?: 'pending' | 'danger'
  /** Makes the value a link, e.g. a credit note's original invoice. */
  to?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      {to ? (
        <Link
          to={to}
          className="mt-1.5 block text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
        >
          {value}
        </Link>
      ) : (
        <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
      )}
      {note ? (
        <p
          className={[
            'mt-1.5 text-[10px] font-semibold leading-[1.2]',
            noteTone === 'danger' ? 'text-danger-700' : 'text-pending-700',
          ].join(' ')}
        >
          {note}
        </p>
      ) : null}
    </div>
  )
}

function Money({ amount, className }: { amount: number; className: string }) {
  const { i18n } = useTranslation()
  return (
    <OmAmount
      size="xs"
      amount={formatAmount(amount, 'OMR', i18n.language)}
      amountClassName={className}
    />
  )
}

/**
 * Income › Self-billed › one document (Figma 154:167694), read from the same authored-invoice
 * endpoints as any other document and drawn in the design's own structure: the number and its
 * status, the three tracks, the seller and buyer cards with the document's details beside a
 * summary rail, the items supplied, the history and the attachments.
 *
 * The tenant is the BUYER here: the document records what it owes the supplier, which is why the
 * seller card names the customer record and the buyer card names this company.
 */
/**
 * What the bill payment route refuses, in this page's words: the debt is "the supplier bill for
 * this document", not the document.
 */
const SUPPLIER_BILL_PAYMENT_REFUSALS: NonNullable<
  Parameters<typeof RecordPaymentModal>[0]['refusals']
> = {
  BILL_NOT_READY_FOR_PAYMENT: { field: null, key: 'selfBillDetail.pay.notApproved' },
  BILL_PAYMENT_ON_HOLD: { field: null, key: 'selfBillDetail.pay.onHold' },
  // The payment run's own sentence for the same refusal, word for word (owner's answer 2, 2 Oct).
  BILL_PAYMENT_MISMATCHED: { field: null, key: 'paymentRuns.refused.mismatched' },
  BILL_PAYMENT_IN_PAYMENT_RUN: {
    field: null,
    key: 'selfBillDetail.pay.inRun',
    values: (problem) => ({ run: String(problem.paymentRunReference ?? '') }),
  },
  // With the figure when the server names what is still owed, without it when it does not.
  BILL_PAYMENT_EXCEEDS_OUTSTANDING: {
    field: 'amount',
    key: 'selfBillDetail.pay.tooMuch',
    keyWithOwed: 'selfBillDetail.pay.tooMuchMost',
  },
}

export function SelfBillDetailPage() {
  return (
    <AppShell>
      <SelfBillScreen />
    </AppShell>
  )
}

function Breadcrumb() {
  const { t } = useTranslation()
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <Link
        to="/expenditure/bills"
        className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
      >
        {t('selfBillDetail.breadcrumbExpenditure')}
      </Link>
      <img src={backIcon} alt="" aria-hidden="true" className="size-6 rotate-180 rtl:rotate-0" />
      <Link
        to="/expenditure/self-billing"
        className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
      >
        {t('selfBillDetail.breadcrumbSelfBilled')}
      </Link>
    </div>
  )
}

function SelfBillScreen() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // A new self-billed credit note needs a plan with self-billing (PL-8).
  const selfBillingIncluded = usePlanIncludes('selfBilling')
  const { id = '' } = useParams()
  const today = muscatToday()

  const invoice = useApiRead<InvoiceDetailDto>(invoicePath(id), () => loadInvoice(id))
  const document = invoice.read.status === 'ready' ? invoice.read.data : null

  // The same five reads the invoice page asks for, each only once the document exists.
  const receivable = useApiRead<InvoiceReceivableDto>(
    document ? `${invoicePath(id)}/receivable` : null,
    () => loadReceivable(id),
  )
  const payments = useApiRead<InvoicePaymentDto[]>(
    document && !isDraft(document) ? `${invoicePath(id)}/payments` : null,
    () => loadPayments(id),
  )
  const attachments = useApiRead<InvoiceAttachmentDto[]>(
    document ? `${invoicePath(id)}/attachments` : null,
    () => loadAttachments(id),
  )
  const history = useApiRead<InvoiceHistoryDto>(
    document ? `${invoicePath(id)}/history` : null,
    () => loadHistory(id),
  )
  // The seller: `customerId` names the supplier on a self-billed document.
  const customer = useApiRead<CustomerDto>(
    document && can(session, 'customer.read') ? `/v1/customers/${document.customerId}` : null,
    () => loadCustomer(document!.customerId),
  )
  const branches = useApiRead<BranchDto[]>(document ? BRANCHES_PATH : null, loadBranches)
  const { label: branchLabel } = useBranchName()
  // A self-billed credit note names the invoice it corrects (IBR-032-OM); read it for its number.
  const originalId = document?.correctionOfInvoiceId ?? null
  const original = useApiRead<InvoiceDetailDto>(originalId ? invoicePath(originalId) : null, () =>
    loadInvoice(originalId!),
  )
  // The agreement the document was raised under, for the note beneath the Agreement field.
  const agreements = useApiRead<AgreementDto[]>(
    document && can(session, 'selfbilling.agreement.manage') ? AGREEMENTS_PATH : null,
    loadAgreements,
  )

  const [notice, setNotice] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  if (invoice.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <Breadcrumb />
        {invoice.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={invoice.read.error} retry={invoice.retry} />
        )}
      </div>
    )
  }

  const data = invoice.read.data
  const draft = isDraft(data)
  // The debt is the Expenditure payable (D2) when the document answers one; see selfBillOwed.
  const payable = data.payable ?? null
  const owed = selfBillOwed(
    payable,
    receivable.read.status === 'ready' ? receivable.read.data : null,
  )
  const supplier =
    customer.read.status === 'ready'
      ? customer.read.data.displayName
      : t('selfBillDetail.supplierUnknown')
  const buyer = session?.tenantName ?? t('selfBillDetail.yourCompany')
  const status = selfBillStatus(data, owed)
  const pill = STATUS_PILL[status.tone]
  const tracks = selfBillTracks(data, {
    supplier,
    today,
    deliveredAt: data.deliveredAt ? formatInstant(data.deliveredAt, language) : null,
  })
  const agreement =
    agreements.read.status === 'ready'
      ? (agreements.read.data.find(
          (row) =>
            row.agreementReference === data.details?.contractReference ||
            (row.customerId === data.customerId && row.status !== 'WITHDRAWN'),
        ) ?? null)
      : null
  const agreementLeft = agreementNote(agreement, today)
  const receivingBranch =
    branches.read.status === 'ready'
      ? branches.read.data.find((branch) => branch.id === data.branchId)
      : undefined
  const branchName = receivingBranch ? branchLabel(receivingBranch) : data.branchId
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const items = selfBillItems(data)
  const totals = data.totals
  const paid = owed?.paymentState === 'PAID'
  const timeline =
    history.read.status === 'ready'
      ? selfBillTimeline(data, history.read.data, {
          userId: session?.userId ?? null,
          supplier,
          today,
          paid,
        })
      : []
  const files =
    attachments.read.status === 'ready'
      ? attachmentRows(attachments.read.data, (bytes) => fileSize(bytes, language))
      : []
  // Paying needs an issued document with something owed on its payable and the right to settle it
  // (`bill.settle`, as a bill: the payable is paid on the bill's own route).
  // Otherwise the action is not offered at all, as on the invoice and bill pages (owner decisions
  // 2026-10-01: hidden, not disabled; no greyed button on a draft or a paid document either).
  const canPay =
    payable !== null &&
    can(session, 'bill.settle') &&
    data.authoringState === 'ISSUED' &&
    owed !== null &&
    owed.paymentState !== 'NOT_APPLICABLE' &&
    owed.paymentState !== 'PAID'

  // A self-billed credit note (261) corrects an ISSUED self-billed invoice only (decision D6: the
  // credit-note composer, as the invoice page opens it). The create route asks selfbilling.create.
  const canCredit =
    data.type === 'SELF_BILLED_INVOICE' &&
    data.authoringState === 'ISSUED' &&
    can(session, 'selfbilling.create') &&
    selfBillingIncluded

  const failureText = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }

  // The draft attachment routes the invoice pages use; the API takes and removes files on a draft only.
  const canManageAttachments = attachmentsEditable(data, (permission) => can(session, permission))

  const uploadFiles = async (picked: File[]) => {
    setNotice(null)
    setUploading(true)
    try {
      for (const file of picked) {
        await uploadAttachment(id, file)
      }
    } catch (error) {
      setNotice(failureText(error))
    } finally {
      attachments.retry()
      setUploading(false)
    }
  }

  const removeFile = async (file: InvoiceAttachmentDto) => {
    setNotice(null)
    setRemovingId(file.id)
    try {
      await removeAttachment(id, file.id)
      attachments.retry()
    } catch (error) {
      setNotice(failureText(error))
    } finally {
      setRemovingId(null)
    }
  }

  const download = async (file: InvoiceAttachmentDto) => {
    setNotice(null)
    try {
      const saved = await downloadAttachment(id, file.id)
      const url = URL.createObjectURL(saved.blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = saved.filename ?? file.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice(failureText(error))
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Breadcrumb />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {data.invoiceNumber ?? t('selfBillDetail.unnumbered')}
            </h1>
            <span
              className={[
                'inline-flex h-[31px] items-center gap-2 rounded-full border border-[#e7e3da] px-3 text-sm font-medium',
                pill.pill,
              ].join(' ')}
            >
              <span className={['size-1.5 rounded-full', pill.dot].join(' ')} />
              {t(status.key)}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2] text-text-quaternary">
            <span>{t('selfBillDetail.raisedFor')}</span>
            <span className="font-semibold text-text-primary">{supplier}</span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span>
              {data.issueDate
                ? t('selfBillDetail.issuedOn', { date: day(data.issueDate) })
                : t('selfBillDetail.notIssued')}
            </span>
            <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            <span>{t('selfBillDetail.to')}</span>
            <span className="font-semibold text-text-primary">{buyer}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* TODO(backend): no PDF of the document is answered, so Download says so. */}
          <button
            type="button"
            onClick={() => setNotice(t('selfBillDetail.downloadUnavailable'))}
            className={OUTLINE_BUTTON}
          >
            <img src={downloadIcon} alt="" className="size-6" />
            {t('selfBillDetail.download')}
          </button>
          {/* TODO(backend): nothing asks a supplier to confirm, so the reminder says so. */}
          <button
            type="button"
            onClick={() => setNotice(t('selfBillDetail.reminderUnavailable'))}
            className={OUTLINE_BUTTON}
          >
            {t('selfBillDetail.sendReminder')}
          </button>
          {canCredit ? (
            <Link
              to={`/expenditure/self-billing/credit-notes/new?invoice=${encodeURIComponent(data.id)}`}
              className={OUTLINE_BUTTON}
            >
              <img src={creditNoteIcon} alt="" className="size-5" />
              {t('selfBillDetail.creditNote')}
            </Link>
          ) : null}
          {canPay ? (
            <button
              type="button"
              onClick={() => setPaying(true)}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={recordPaymentIcon} alt="" className="size-6" />
              {t('selfBillDetail.recordPayment')}
            </button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {/* Three independent status tracks */}
      <div className="grid gap-4 md:grid-cols-3">
        {tracks.map((track) => (
          <TrackPanel key={track.id} track={track} />
        ))}
      </div>

      {/* Parties & details beside the Summary rail; the rest run full width. */}
      <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
        <SectionCard title={t('selfBillDetail.sections.parties')}>
          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            <div className="flex-1 rounded-sm border border-border-subtle bg-surface-tab-bar p-3.5">
              <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.6px] text-text-quaternary">
                {t('selfBillDetail.parties.seller')}
              </p>
              <p className="mt-1.5 text-base font-medium leading-[1.2] text-text-primary">
                {supplier}
              </p>
              <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('selfBillDetail.parties.sellerNote')}
              </p>
            </div>
            <span className="flex shrink-0 items-center justify-center px-2">
              <img src={arrowNextIcon} alt="" className="size-6 rtl:rotate-180" />
            </span>
            <div className="flex-1 rounded-sm border border-primary-75 bg-primary-25 p-3.5">
              <p className="text-xs font-semibold uppercase leading-[1.2] tracking-[0.6px] text-text-quaternary">
                {t('selfBillDetail.parties.buyer')}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-medium leading-[1.2] text-text-primary">
                {buyer}
                <span className="inline-flex h-[18px] items-center rounded-[2px] bg-primary-700 px-2 text-[10px] font-semibold text-white">
                  {t('selfBillDetail.parties.you')}
                </span>
              </p>
              <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('selfBillDetail.parties.buyerNote')}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {data.correctionOfInvoiceId ? (
              <DetailField
                label={t('salesNote.credit.corrects')}
                value={
                  original.read.status === 'ready' ? (original.read.data.invoiceNumber ?? '—') : '—'
                }
                to={`/expenditure/self-billing/${data.correctionOfInvoiceId}`}
              />
            ) : null}
            <DetailField label={t('selfBillDetail.fields.issueDate')} value={day(data.issueDate)} />
            <DetailField
              label={t('selfBillDetail.fields.supplyDate')}
              value={day(data.details?.deliveryDate ?? null)}
            />
            <DetailField label={t('selfBillDetail.fields.paymentDue')} value={day(data.dueDate)} />
            <DetailField
              label={t('selfBillDetail.fields.agreement')}
              value={data.details?.contractReference ?? agreement?.agreementReference ?? '—'}
              note={agreementLeft ? t(agreementLeft.key, agreementLeft.values) : null}
              noteTone={agreementLeft?.tone}
            />
            <DetailField label={t('selfBillDetail.fields.receivingBranch')} value={branchName} />
            <DetailField
              label={t('selfBillDetail.fields.purchaseOrder')}
              value={data.details?.purchaseOrderReference ?? '—'}
            />
          </div>
        </SectionCard>

        <aside>
          <section className="rounded-sm bg-surface-card p-4">
            <h2 className="text-base font-medium leading-[1.2] text-text-primary">
              {t('selfBillDetail.summary.title')}
            </h2>
            {totals ? (
              <div className="mt-4 flex flex-col gap-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.subtotal')}
                  </span>
                  <Money amount={totals.subtotal} className="font-semibold text-text-secondary" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.discount')}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-text-quaternary">
                    −
                    <OmAmount
                      size="xs"
                      amount={formatAmount(totals.totalDiscount, 'OMR', language)}
                      amountClassName="font-semibold text-text-quaternary"
                      iconClassName="text-text-quaternary"
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('selfBillDetail.summary.net')}
                  </span>
                  <Money
                    amount={totals.taxableAmount}
                    className="font-semibold text-text-secondary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-secondary">
                    {t('selfBillDetail.summary.vat')}
                  </span>
                  <Money amount={totals.vatAmount} className="font-semibold text-text-secondary" />
                </div>
                {owed && owed.paidAmount + owed.creditedAmount > 0 ? (
                  // Total due is what is still owed, so what has already been settled is shown
                  // above it and the column adds up.
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-secondary">
                      {t('selfBillDetail.summary.settled')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary">
                      −
                      <OmAmount
                        size="xs"
                        amount={formatAmount(
                          owed.paidAmount + owed.creditedAmount,
                          'OMR',
                          language,
                        )}
                        amountClassName="font-semibold text-text-secondary"
                      />
                    </span>
                  </div>
                ) : null}
                <div className="h-px w-full bg-surface-background" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-text-primary">
                    {t('selfBillDetail.summary.totalDue')}
                  </span>
                  <OmAmount
                    size="md"
                    amount={formatAmount(
                      owed?.outstandingAmount ?? totals.totalAmount,
                      'OMR',
                      language,
                    )}
                    amountClassName="text-[22px] font-semibold leading-[1.2] text-text-primary"
                  />
                </div>
              </div>
            ) : (
              // A draft is priced only when it is issued.
              <p className="mt-4 text-sm font-medium leading-[1.4] text-text-quaternary">
                {t('selfBillDetail.summary.draft')}
              </p>
            )}
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
              {items.map((item) => (
                <tr key={item.lineNumber} className="border-t border-surface-background">
                  <td className="py-3 pe-2">
                    <p className="text-base font-medium leading-[1.2] text-text-primary">
                      {item.description}
                    </p>
                    <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-quaternary">
                      {item.productCode
                        ? t('selfBillDetail.itemMeta', { unit: item.unit, code: item.productCode })
                        : item.unit}
                    </p>
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {formatAmount(item.unitPrice, 'OMR', language)}
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {item.vatRate === null ? '—' : `${item.vatRate}%`}
                  </td>
                  <td className="py-3 text-base font-medium text-text-secondary">
                    {item.quantity}
                  </td>
                  <td className="py-3 text-base font-medium text-text-secondary">{item.unit}</td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {item.discountLabel}
                  </td>
                  <td className="py-3 text-end text-xl font-semibold text-text-primary">
                    {formatAmount(item.total, 'OMR', language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>

        {totals ? (
          <div className="ms-auto mt-4 flex w-full max-w-[334px] flex-col gap-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.subtotal')}
              </span>
              <Money
                amount={totals.subtotal}
                className="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.discount')}
              </span>
              <span className="inline-flex items-center gap-1 text-base font-semibold text-success-700">
                −
                <OmAmount
                  size="xs"
                  amount={formatAmount(totals.totalDiscount, 'OMR', language)}
                  amountClassName="text-base font-semibold text-success-700"
                />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.net')}
              </span>
              <Money
                amount={totals.taxableAmount}
                className="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-tertiary">
                {t('selfBillDetail.totals.vat')}
              </span>
              <Money
                amount={totals.vatAmount}
                className="text-base font-semibold text-text-primary"
              />
            </div>
            <div className="h-px w-full bg-surface-background" />
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">
                {t('selfBillDetail.totals.total')}
              </span>
              <OmAmount
                size="sm"
                amount={formatAmount(totals.totalAmount, 'OMR', language)}
                amountClassName="text-xl font-semibold text-text-primary"
              />
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* History */}
      <SectionCard
        title={t('selfBillDetail.sections.history')}
        action={
          // TODO(backend): no validation report is answered for a document.
          <button
            type="button"
            onClick={() => setNotice(t('selfBillDetail.validationReportUnavailable'))}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"
          >
            {t('selfBillDetail.viewValidationReport')}
            <img src={linkArrowIcon} alt="" className="size-[18px] rtl:rotate-180" />
          </button>
        }
      >
        {history.read.status === 'failed' ? (
          <ApiReadFailure error={history.read.error} retry={history.retry} />
        ) : timeline.length === 0 ? (
          <p className="text-sm font-medium text-text-quaternary">
            {history.read.status === 'ready'
              ? t('selfBillDetail.history.none')
              : t('appAccess.loading')}
          </p>
        ) : (
          <ol className="flex flex-col">
            {timeline.map((event, index) => {
              const isLast = index === timeline.length - 1
              const current = event.tone === 'current'
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex w-7 shrink-0 flex-col items-center">
                    {current ? (
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
                        {t(event.titleKey, event.titleValues)}
                      </p>
                      <span className="shrink-0 text-sm font-medium leading-[1.2] text-text-tertiary">
                        {event.at
                          ? formatInstant(event.at, language)
                          : t('selfBillDetail.history.openFor', { count: event.openForDays ?? 0 })}
                      </span>
                    </div>
                    {event.detailKey ? (
                      <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
                        {t(event.detailKey, event.detailValues)}
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </SectionCard>

      {/* Attachments */}
      <SectionCard title={t('selfBillDetail.sections.attachments')}>
        <div className="flex flex-col gap-3">
          {attachments.read.status === 'failed' ? (
            <ApiReadFailure error={attachments.read.error} retry={attachments.retry} />
          ) : null}
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-sm border border-border-subtle p-2.5"
            >
              <img
                src={file.contentType === 'application/pdf' ? filePdfIcon : fileJpgIcon}
                alt=""
                className="size-9 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium leading-[1.2] text-text-primary">
                  {file.filename}
                </p>
                <p className="mt-1.5 truncate text-sm font-medium leading-[1.2] text-text-tertiary">
                  {t('selfBillDetail.attachments.meta', {
                    size: file.sizeLabel,
                    date: formatDate(file.attachedAt.slice(0, 10), language),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void download(file)}
                aria-label={t('selfBillDetail.attachments.download')}
                className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle transition-colors hover:bg-neutral-25"
              >
                <img src={fileDownloadIcon} alt="" className="size-4" />
              </button>
              <button
                type="button"
                disabled={!canManageAttachments || removingId === file.id}
                onClick={canManageAttachments ? () => void removeFile(file) : undefined}
                title={
                  canManageAttachments
                    ? t('selfBillDetail.attachments.delete')
                    : t(
                        draft
                          ? 'selfBillDetail.attachments.removeUnavailable'
                          : 'selfBillDetail.attachments.issued',
                      )
                }
                aria-label={t('selfBillDetail.attachments.delete')}
                className={[
                  'flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle',
                  canManageAttachments ? 'transition-colors hover:bg-neutral-25' : 'opacity-60',
                ].join(' ')}
              >
                <img src={fileDeleteIcon} alt="" className="size-4" />
              </button>
            </div>
          ))}
          {attachments.read.status === 'ready' && files.length === 0 ? (
            <p className="text-sm font-medium text-text-quaternary">
              {t('selfBillDetail.attachments.none')}
            </p>
          ) : null}
          {canManageAttachments ? (
            <FileDropzone
              accept={ATTACHMENT_TYPES}
              multiple
              maxBytes={ATTACHMENT_MAX_BYTES}
              onFiles={(picked) => void uploadFiles(picked)}
              onReject={(reason, file) =>
                setNotice(
                  t(
                    reason === 'size'
                      ? 'selfBillDetail.attachments.tooLarge'
                      : 'selfBillDetail.attachments.wrongType',
                    { name: file.name },
                  ),
                )
              }
              className={DROP_ZONE}
            >
              {() => (
                <>
                  <img src={uploadIcon} alt="" className="size-5" />
                  <span className="text-sm font-medium text-text-secondary">
                    {uploading
                      ? t('selfBillDetail.attachments.uploading')
                      : t('selfBillDetail.attachments.drop')}
                  </span>
                  <span className="text-xs font-medium text-text-muted">
                    {t('selfBillDetail.attachments.hint')}
                  </span>
                </>
              )}
            </FileDropzone>
          ) : (
            <button
              type="button"
              onClick={() =>
                setNotice(
                  t(
                    draft
                      ? 'selfBillDetail.attachments.uploadUnavailable'
                      : 'selfBillDetail.attachments.issued',
                  ),
                )
              }
              className={DROP_ZONE}
            >
              <img src={uploadIcon} alt="" className="size-5" />
              <span className="text-sm font-medium text-text-secondary">
                {t('selfBillDetail.attachments.drop')}
              </span>
              <span className="text-xs font-medium text-text-muted">
                {t('selfBillDetail.attachments.hint')}
              </span>
            </button>
          )}
        </div>
      </SectionCard>

      {paying && payable ? (
        <RecordPaymentModal
          invoiceId={id}
          invoiceNumber={data.invoiceNumber}
          currency={payable.currency}
          outstanding={payable.outstandingAmount}
          issueDate={data.issueDate}
          today={today}
          // Recorded against the supplier's bill: the document's own route refuses a self-billed
          // document (PAYMENT_REQUIRES_RECEIVABLE).
          record={(key, payment) =>
            recordBillPayment(payable.billId, key, { ...payment, currency: payable.currency })
          }
          refusals={SUPPLIER_BILL_PAYMENT_REFUSALS}
          labelKeys={{ amount: 'selfBillDetail.pay.amount', date: 'selfBillDetail.pay.date' }}
          onClose={() => setPaying(false)}
          onRecorded={() => {
            setPaying(false)
            setNotice(t('invoiceDetails.done.recorded'))
            // The payable is read with the document, so the document is read again.
            invoice.retry()
            receivable.retry()
            payments.retry()
            history.retry()
          }}
        />
      ) : null}
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FileDropzone,
  Modal,
  OmAmount,
  RialMark,
  RowsView,
  type ActionMenuItem,
} from '../../components/ui'
import { ChatBubbleIcon, MailIcon } from '../../components/ui/icons'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead, usePendingRefresh } from '../../hooks'
import { useReferenceData } from '../../lib/reference/referenceData'
import { InvoiceRemindersCard } from '../../components/invoice/InvoiceRemindersCard'
import { ApiError } from '../../api'
import {
  cancelInvoice,
  downloadAttachment,
  uploadAttachment,
  removeAttachment,
  newPaymentKey,
  reversePayment,
  invoicePath,
  loadAttachments,
  loadHistory,
  loadInternalNote,
  loadDispatch,
  releaseBuyerEmail,
  loadInvoice,
  loadPayments,
  loadReceivable,
  type InvoiceAttachmentDto,
  type InvoiceDetailDto,
  type InvoiceDispatchDto,
  type InvoiceLineWarningDto,
  type InvoiceHistoryDto,
  type InvoicePaymentDto,
  type InvoiceReceivableDto,
  type InvoiceSendResultDto,
} from '../../api/invoices/detail'
import { stockLineWarningTexts } from '../../lib/stockLineWarnings'
import { loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { useBranchName } from '../../components/branch/useBranchName'
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import {
  REMINDER_SCHEDULE_PATH,
  loadReminderPreview,
  loadReminderSchedule,
  reminderPreviewPath,
  sendReminderNow,
  type ReminderPreviewDto,
  type ReminderScheduleDto,
} from '../../api/invoices/reminders'
import type { Page } from '../../api'
import { NOTE_ROUTES, unitLabel } from '../../lib/salesNote'
import { loadCustomer, type CustomerDto } from '../../api/customers/customers'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import { buyerParty, sellerParty, type DocumentParty } from '../../lib/documentParties'
import { paymentMethodLabel, paymentTermLabel } from '../../lib/reference/referenceData'
import { RecordPaymentModal } from './RecordPaymentModal'
import { IssueInvoiceModal } from '../../components/invoice/IssueInvoiceModal'
import { DraftApprovalCard, useSalesApproval } from '../../components/invoice/DraftApprovalCard'
import { editWaitsOnApproval, issueWaitsOnApproval } from '../../lib/salesApproval'
import { SendInvoiceModal } from '../../components/invoice/SendInvoiceModal'
import {
  RELEASE_REFUSALS,
  buyerDeliveryNote,
  dispatchIsPending,
  dispatchNotes,
  dispatchSucceeded,
  transportNotes,
  sendResultNote,
  type DispatchNote,
} from '../../lib/invoiceDispatch'
import { activityListPath } from '../../api/compliance/activity'
import {
  REPORT_CANDIDATES,
  REPORT_UNAVAILABLE,
  findIssuedReport,
  issuedReportNotes,
  recentEnoughToWatch,
  refreshIssuedReport,
  tddReportIsPending,
  transportMessageIds,
  type ReportLookup,
} from '../../lib/taxAuthorityReport'
import { dueDateFor, muscatToday } from '../../lib/invoiceIssue'
import {
  PAYMENT_REFUSALS,
  attachmentsEditable,
  dueNote,
  isDraft,
  isSelfBilled,
  lineTotals,
  paidPercent,
  counterpartyKeys,
  paymentRows,
  statusOf,
  timelineOf,
  type Note as ViewNote,
} from '../../lib/invoiceDetail'
import {
  VERDICT_NOTE,
  canSendByHand,
  reminderLadder,
  reminderRefusalNote,
  rungToday,
} from '../../lib/paymentReminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant, initialsOf } from '../../lib/format'
import { formatFileSize } from '../../lib/files'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import backIcon from '../../assets/invoice-details/back.svg'
import creditNoteIcon from '../../assets/invoice-details/credit-note.svg'
import clockIcon from '../../assets/invoice-details/clock.svg'
import chevronIcon from '../../assets/invoice-details/chevron.svg'
import copyIcon from '../../assets/invoice-details/copy.svg'
import periodicIcon from '../../assets/invoice-details/periodic.svg'
import sendIcon from '../../assets/invoice-details/send.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import peppolBadgeIcon from '../../assets/invoice-details/peppol-badge.svg'
import filePdfIcon from '../../assets/self-bill-detail/file-pdf.svg'
import fileJpgIcon from '../../assets/self-bill-detail/file-jpg.svg'
import fileDownloadIcon from '../../assets/self-bill-detail/file-download.svg'
import fileDeleteIcon from '../../assets/self-bill-detail/file-delete.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import editIcon from '../../assets/actions/edit.svg'
import debitNoteIcon from '../../assets/actions/invoice.svg'
import deleteIcon from '../../assets/actions/delete.svg'

type Tone = ReturnType<typeof statusOf>['tone']

/** The same palette the invoices list uses for its chips, so one document reads the same twice. */
const STATUS_TONES: Record<Tone, string> = {
  draft: 'border-black/[0.06] bg-neutral-25 text-text-quaternary',
  issued: 'border-primary-75 bg-primary-25 text-primary-800',
  cancelled: 'border-black/[0.06] bg-neutral-25 text-text-muted',
  awaiting: 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
  partial: 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
  overdue: 'border-danger-100 bg-danger-100 text-danger-700',
  paid: 'border-success-100 bg-success-100 text-success-700',
}

const ZOOMS = [0.75, 1, 1.25]

type Translate = (key: string, values?: Record<string, unknown>) => string

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
      <div className="mb-4 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
    </div>
  )
}

const GHOST_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
/** The 32px bordered icon buttons beside a file or a payment (Figma 154:163406). */
const ICON_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-sm border border-border-subtle transition-colors hover:bg-neutral-25 disabled:cursor-not-allowed disabled:opacity-40'

export function InvoiceDetailsPage() {
  const { id = '' } = useParams()
  // Keyed by id: `/invoices/:id` keeps this page mounted when the reader opens another invoice (the
  // header search links straight to one), and the screen's own state (the last dispatch answer and
  // its `sendable`, the notice, an open Send confirmation with its Idempotency-Key) was carried onto
  // the next invoice (audit A4, D3; review of #249). A fresh screen per id starts clean, and an
  // answer that lands for the one left behind goes to an unmounted screen and is dropped.
  return (
    <AppShell>
      <InvoiceScreen key={id} />
    </AppShell>
  )
}

function InvoiceScreen() {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const language = i18n.language
  const session = useSession()
  // Issuing stops while the subscription is read-only (ST-2): the action is hidden, not greyed.
  const mayIssue = useSubscriptionAllows('ISSUE_DOCUMENTS')
  // Making a periodic series from this invoice needs a plan with periodic invoices (PL-8).
  const periodicIncluded = usePlanIncludes('recurringInvoices')
  // Nothing is shared while the subscription is read-only (owner, 23 Oct; ST-2, CA-3).
  const mayShare = useSubscriptionAllows('SEND_DOCUMENTS')
  const navigate = useNavigate()
  const location = useLocation()
  const { id = '' } = useParams()

  const invoice = useApiRead<InvoiceDetailDto>(invoicePath(id), () => loadInvoice(id))
  const document = invoice.read.status === 'ready' ? invoice.read.data : null

  // Five reads behind three permissions: each is asked for only when this reader may have it, and
  // only when the document it belongs to exists.
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
  // Approval before issue (RL-6): read only for a draft. Unread or switched off, nothing changes.
  const salesApproval = useSalesApproval(id, document !== null && isDraft(document))
  // The design shows the internal note in its box (Figma 154:163406), so it is read with the page.
  // TODO(backend): reading it writes an audit event, so every visit now records a "note read";
  // please stop auditing the read, or answer the note on the detail itself.
  const internalNote = useApiRead<{ internalNote: string | null }>(
    document && can(session, 'invoice.internal-note.read')
      ? `${invoicePath(id)}/internal-note`
      : null,
    () => loadInternalNote(id),
  )
  // The read is the audit event, so the timeline is refreshed once it has happened, not before.
  const noteRead = internalNote.read.status === 'ready'
  useEffect(() => {
    if (noteRead) history.retry()
    // Armed by the read landing only: `retry` is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteRead])
  const customer = useApiRead<CustomerDto>(
    document && can(session, 'customer.read') ? `/v1/customers/${document.customerId}` : null,
    () => loadCustomer(document!.customerId),
  )
  const branches = useApiRead<BranchDto[]>(document ? '/v1/branches' : null, loadBranches)
  const branchLabel = useBranchName()
  // The live profile stands in for the seller only where the document carries no issued snapshot
  // (a draft, or a server older than the snapshot), and only for a reader the profile admits.
  const companyProfile = useApiRead<CompanyProfileDto>(
    document && !document.seller && can(session, 'admin.settings.manage')
      ? COMPANY_PROFILE_PATH
      : null,
    loadCompanyProfile,
  )
  // A draft owes nothing to the network, so only an issued (or since-cancelled) document asks.
  const dispatchRead = useApiRead<InvoiceDispatchDto>(
    document && !isDraft(document) ? `${invoicePath(id)}/dispatch` : null,
    () => loadDispatch(id),
  )
  // A Send's answer, or a newer read while the server was mid-step. Kept apart from the read so a
  // refresh does not blank the line with a loader every few seconds.
  const [dispatchLatest, setDispatchLatest] = useState<InvoiceDispatchDto | null>(null)
  const dispatch =
    dispatchLatest ?? (dispatchRead.read.status === 'ready' ? dispatchRead.read.data : null)
  // Bumped by every action that changes the dispatch (Send, release, cancel). A quiet re-read that
  // set out before the action may answer after it, with the state from before it; it is dropped
  // rather than painted over the action's newer answer.
  const dispatchEpoch = useRef(0)
  const adoptDispatch = (next: InvoiceDispatchDto | null) => {
    dispatchEpoch.current += 1
    setDispatchLatest(next)
  }
  // Without this the AS4 receipt and the MLS outcome reached the page only on a reload: the earlier
  // poll watched PROCESSING and an active transmission only.
  usePendingRefresh(id, dispatchIsPending(dispatch), (live) => {
    const epoch = dispatchEpoch.current
    return loadDispatch(id).then((next) => {
      if (live() && epoch === dispatchEpoch.current) setDispatchLatest(next)
    })
  })
  // C5's answer to the TDD is on the compliance record only, not on the dispatch, whose Tax
  // Authority leg ends at the AS4 receipt (audit A1, F-10). Looked up once a transport row exists,
  // since that row is what proves which record is this invoice's (findIssuedReport).
  // Read only where the delivery bar says it (a receivable that applies, not a manual delivery),
  // so a document whose bar is not drawn spends no requests on it.
  const messageIds = transportMessageIds(dispatch)
  const deliveryBarShown =
    receivable.read.status === 'ready' &&
    receivable.read.data.paymentState !== 'NOT_APPLICABLE' &&
    document?.deliveryState !== 'SENT_MANUALLY'
  const reportNumber =
    document && !isDraft(document) && deliveryBarShown ? document.invoiceNumber : null
  const reportRead = useApiRead<ReportLookup>(
    reportNumber && messageIds.length > 0
      ? activityListPath({ direction: 'ISSUED', invoiceNumber: reportNumber }, 0, REPORT_CANDIDATES)
      : null,
    () => findIssuedReport(reportNumber!, messageIds),
  )
  const [reportLatest, setReportLatest] = useState<ReportLookup | null>(null)
  const report = reportLatest ?? (reportRead.read.status === 'ready' ? reportRead.read.data : null)
  // An unproven lookup is asked once more, a few seconds on: the read is keyed by the number, so a
  // transport row the dispatch poll reports later, or a ledger row that lands just after the first
  // read, would otherwise leave "not available" until a reload (review of #250, L2). Once only, and
  // after the read settles, so a number that genuinely matches nothing costs one extra round.
  // The ref makes it one request whatever the timing: the spell's next timer can fire before the
  // re-render that ends the spell has happened.
  const [lookupRetried, setLookupRetried] = useState(false)
  const lookupSpent = useRef(false)
  usePendingRefresh(
    reportNumber ? `${id}:report-lookup` : null,
    report?.kind === 'unproven' && !lookupRetried,
    (live) => {
      if (lookupSpent.current) return Promise.resolve()
      lookupSpent.current = true
      return findIssuedReport(reportNumber!, messageIds)
        .then((next) => {
          if (live()) setReportLatest(next)
        })
        .finally(() => setLookupRetried(true))
    },
  )
  // Watched until C5 answers or Fawtir stops the report; the dispatch poll above ends at the AS4
  // receipt, which said nothing of C5's answer. Only the proven record is re-read, and only for a
  // document recent enough that an answer may still arrive while the page is open.
  usePendingRefresh(
    report?.kind === 'found' ? report.invoiceUuid : null,
    report?.kind === 'found' &&
      tddReportIsPending(report.item.tdd_leg) &&
      recentEnoughToWatch(report.item),
    (live) =>
      report?.kind === 'found'
        ? refreshIssuedReport(report.invoiceUuid, messageIds).then((next) => {
            if (live()) setReportLatest(next)
          })
        : Promise.resolve(),
  )
  const [sending, setSending] = useState(false)
  // The credit and debit notes that correct this invoice (I-10/I-11), listed on the invoice so a
  // reader sees why its balance moved and can open each note.
  const notesPath =
    document &&
    document.type === 'INVOICE' &&
    document.authoringState !== 'DRAFT' &&
    document.authoringState !== 'DISCARDED'
      ? invoiceListPath({
          state: null,
          payment: null,
          type: null,
          from: null,
          to: null,
          search: '',
          correctionOf: id,
          sort: 'ISSUED_NEWEST',
          page: 0,
          size: 50,
        })
      : null
  const notes = useApiRead<Page<InvoiceRowDto>>(notesPath, () => loadInvoicePage(notesPath!))

  // The reminder banner (Figma 154:163981): what would go out for an issued, unsettled invoice.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
  const owed = receivable.read.status === 'ready' ? receivable.read.data : null
  const chaseable =
    document !== null &&
    document.authoringState === 'ISSUED' &&
    document.type !== 'CREDIT_NOTE' &&
    owed !== null &&
    (owed.paymentState === 'UNPAID' || owed.paymentState === 'PARTIALLY_PAID')
  const previewPath = chaseable ? reminderPreviewPath(id, rungToday(today, document.dueDate)) : null
  const reminder = useApiRead<ReminderPreviewDto>(previewPath, () =>
    loadReminderPreview(previewPath!),
  )
  // The ladder, so the banner can say "Reminder 2 of 4" and when the next one goes out.
  const schedule = useApiRead<ReminderScheduleDto>(
    chaseable ? REMINDER_SCHEDULE_PATH : null,
    loadReminderSchedule,
  )
  const [remindersOpen, setRemindersOpen] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)

  // Arriving from the composer's issue: the number it was given, said once, with any of the
  // composer's marks ("Mark as paid", "Mark as sent manually") the server refused after issue.
  const arrival = location.state as {
    issuedNumber?: string | null
    marksFailed?: ('paid' | 'sent')[]
    stockWarnings?: InvoiceLineWarningDto[]
  } | null
  const issuedNumber = arrival?.issuedNumber
  const [notice, setNotice] = useState<
    { key: string; values?: Record<string, string> } | { body: string } | null
  >(() =>
    issuedNumber
      ? {
          body: [
            t('invoiceIssue.done', { number: issuedNumber }),
            ...(arrival?.marksFailed ?? []).map((mark) => t(`invoiceIssue.markFailed.${mark}`)),
            ...stockLineWarningTexts(t, arrival?.stockWarnings),
          ].join(' '),
        }
      : null,
  )
  const [issuing, setIssuing] = useState(false)
  // Said once: a reload of this page is not another issue.
  useEffect(() => {
    if (issuedNumber) navigate(location.pathname, { replace: true, state: null })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [paying, setPaying] = useState(false)
  // The payment being reversed, and the key minted when its confirmation opened: confirming twice
  // is one reversal, not two refusals.
  const [reversing, setReversing] = useState<{ id: string; amount: number; key: string } | null>(
    null,
  )
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)

  if (invoice.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <Breadcrumb />
        {invoice.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={invoice.read.error} retry={invoice.retry} notFoundOn400 />
        )}
      </div>
    )
  }

  const data = invoice.read.data
  // A self-billed document is a purchase: its page is under Expenditure › Self-billing (owner
  // decision, 6 Oct 2026), so an old /invoices link to one lands there.
  if (data.type === 'SELF_BILLED_INVOICE' || data.type === 'SELF_BILLED_CREDIT_NOTE') {
    return <Navigate to={`/expenditure/self-billing/${encodeURIComponent(data.id)}`} replace />
  }
  const draft = isDraft(data)
  const noteType = data.type === 'CREDIT_NOTE' || data.type === 'DEBIT_NOTE' ? data.type : null
  // Self-billing inverts the parties: the tenant is the buyer and customerId names the seller,
  // so every counterparty label on this page flips with the document type.
  const party = counterpartyKeys(data.type)
  const status = statusOf(data, owed, today)
  const totals = lineTotals(data)
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatAmount(value, data.currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const issuingBranch =
    branches.read.status === 'ready'
      ? branches.read.data.find((branch) => branch.id === data.branchId)
      : undefined
  const branchName = issuingBranch ? branchLabel.label(issuingBranch) : undefined
  const customerName =
    customer.read.status === 'ready' ? customer.read.data.displayName : t(party.unknown)
  const onPeppol =
    customer.read.status === 'ready' && customer.read.data.peppolDelivery === 'ACTIVE'
  const due = dueNote(owed, today)
  const vatRates = [
    ...new Set(data.lines.map((line) => `${line.en16931Category}:${line.taxRate ?? 0}`)),
  ]
  // One category word for the header and the totals line: the totals hard-coded "Standard" and
  // read "VAT · Standard 0%" on a zero-rated invoice (TEST verification 2026-10-29).
  const vatCategory = data.lines[0]
    ? t(`invoiceDetails.category.${data.lines[0].en16931Category}`, {
        defaultValue: data.lines[0].taxCategoryCode,
      })
    : ''
  const vatTreatment =
    data.lines.length === 0
      ? '—'
      : vatRates.length > 1
        ? t('invoiceDetails.vat.mixed')
        : t('invoiceDetails.vat.rate', {
            category: vatCategory,
            rate: data.lines[0].taxRate ?? 0,
          })
  const sentAt =
    history.read.status === 'ready'
      ? history.read.data.entries.find((entry) => entry.eventType === 'MARKED_SENT_MANUALLY')
          ?.occurredAt
      : undefined
  // A self-bill's own page (Figma) heads with the number alone; the document word is in the type pill.
  const title = noteType
    ? t(`invoiceDetails.titleNote.${noteType}`, { id: data.invoiceNumber ?? '' })
    : isSelfBilled(data.type)
      ? (data.invoiceNumber ?? '')
      : t('invoiceDetails.title', { id: data.invoiceNumber ?? '' })
  const shownReminder = reminder.read.status === 'ready' ? reminder.read.data : null
  const ladder = reminderLadder(
    schedule.read.status === 'ready' ? schedule.read.data.offsets : null,
    data.dueDate,
    today,
    shownReminder?.verdict === 'SEND',
  )
  const canRemind =
    chaseable &&
    can(session, 'invoice.payment.manage') &&
    shownReminder !== null &&
    canSendByHand(shownReminder.verdict)

  const cancel = async () => {
    const text = reason.trim()
    if (text === '') return
    setBusy(true)
    setNotice(null)
    try {
      await cancelInvoice(id, data.version, text)
      setCancelling(false)
      setReason('')
      setNotice({
        key: noteType ? `salesNote.detail.cancelled.${noteType}` : 'invoiceDetails.done.cancelled',
      })
      invoice.retry()
      history.retry()
      // Cancelling closes what was owed to the network, so the line under the title changes too.
      adoptDispatch(null)
      dispatchRead.retry()
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    } finally {
      setBusy(false)
    }
  }

  const releaseHeldEmail = async () => {
    setNotice(null)
    try {
      adoptDispatch(await releaseBuyerEmail(id))
      setNotice({ key: 'invoiceDispatch.release.done' })
      history.retry()
    } catch (error) {
      const refusal =
        error instanceof ApiError && error.code && Object.hasOwn(RELEASE_REFUSALS, error.code) ? RELEASE_REFUSALS[error.code] : undefined
      setNotice(refusal ? { key: refusal } : { body: refusalText(t, error) })
    }
  }

  const sent = (result: InvoiceSendResultDto) => {
    setSending(false)
    adoptDispatch(result.dispatch)
    setNotice(sendResultNote(result))
    history.retry()
  }

  // What a payment changes: the ledger, what is owed, and the trail.
  const afterPayment = () => {
    payments.retry()
    receivable.retry()
    history.retry()
  }

  const reverse = async () => {
    if (!reversing) return
    setBusy(true)
    setNotice(null)
    try {
      await reversePayment(id, reversing.id, reversing.key)
      setReversing(null)
      setNotice({ key: 'invoiceDetails.done.reversed' })
      afterPayment()
    } catch (error) {
      setReversing(null)
      const refusal =
        error instanceof ApiError && error.code && Object.hasOwn(PAYMENT_REFUSALS, error.code) ? PAYMENT_REFUSALS[error.code] : undefined
      setNotice(refusal ? { key: refusal.key } : { body: refusalText(t, error) })
      afterPayment()
    } finally {
      setBusy(false)
    }
  }

  const sendReminder = async () => {
    if (!shownReminder) return
    setSendingReminder(true)
    setNotice(null)
    try {
      const sent = await sendReminderNow(id, shownReminder.rung)
      setNotice({ body: t('paymentReminders.invoice.sent', { recipient: sent.recipient ?? '' }) })
    } catch (error) {
      const refusal = reminderRefusalNote(error, shownReminder.rung, null)
      setNotice({ body: refusal ? t(refusal) : refusalText(t, error) })
    } finally {
      // A refusal can mean the rung is now spent, so what the banner shows is re-read either way.
      reminder.retry()
      setSendingReminder(false)
    }
  }

  const canPay =
    data.authoringState === 'ISSUED' &&
    can(session, 'invoice.payment.manage') &&
    (owed?.paymentState === 'UNPAID' || owed?.paymentState === 'PARTIALLY_PAID')
  const canReverse = data.authoringState === 'ISSUED' && can(session, 'invoice.payment.manage')
  const issuedInvoice = !draft && data.type === 'INVOICE' && data.authoringState === 'ISSUED'
  // The server says whether this document may be sent now; the permission is the one issue needs.
  // The design draws Send on every issued invoice. When the dispatch could not be read, it stays
  // and the server answers the press (the modal shows its refusal); only a dispatch the server
  // reports as not sendable takes it away.
  // Sending stops with issuing while the subscription is read-only (plan v4 §8): hidden, not greyed.
  const canSend =
    data.authoringState === 'ISSUED' &&
    can(session, 'invoice.issue') &&
    mayIssue &&
    (dispatch ? dispatch.sendable : dispatchRead.read.status === 'failed')
  const dispatchLine = dispatch ? dispatchNotes(dispatch) : null
  const buyerLine = buyerDeliveryNote(dispatch)
  const transportLines = transportNotes(dispatch, (instant) => formatInstant(instant, language))
  // A record that cannot be read or tied to this invoice is said to be unavailable, never left
  // out: a silent gap after "transmitted, receipt received" read as a finished report.
  const reportLines: DispatchNote[] =
    report?.kind === 'found'
      ? issuedReportNotes(report.item)
      : report?.kind === 'unproven' || reportRead.read.status === 'failed'
        ? [REPORT_UNAVAILABLE]
        : []
  const canManageAttachments = attachmentsEditable(data, (permission) => can(session, permission))

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
      setNotice({ body: refusalText(t, error) })
    }
  }

  const uploadFiles = async (files: File[]) => {
    setNotice(null)
    setUploadingAttachment(true)
    try {
      for (const file of files) {
        await uploadAttachment(id, file)
      }
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    } finally {
      attachments.retry()
      setUploadingAttachment(false)
    }
  }

  const removeFile = async (file: InvoiceAttachmentDto) => {
    setNotice(null)
    setRemovingAttachmentId(file.id)
    try {
      await removeAttachment(id, file.id)
      attachments.retry()
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    } finally {
      setRemovingAttachmentId(null)
    }
  }

  // The header's overflow menu (the design's "⋮"): what is not one of the four named buttons.
  const moreActions: ActionMenuItem[] = []
  // A credit or debit note is a new document: not offered while the subscription is read-only.
  if (issuedInvoice && mayIssue && can(session, 'debitnote.create')) {
    moreActions.push({
      id: 'debitNote',
      labelKey: 'salesNote.debit.action',
      icon: debitNoteIcon,
      to: `/income/debit-notes/new?invoice=${data.id}`,
    })
  }
  // Only offered when the server says a held buyer e-mail may go now; turning delivery on never
  // sends it by itself (Q4).
  if (dispatch?.buyerEmailReleasable && mayIssue && can(session, 'invoice.issue')) {
    moreActions.push({
      id: 'releaseBuyerEmail',
      labelKey: 'invoiceDispatch.release.action',
      icon: sendIcon,
      onSelect: () => void releaseHeldEmail(),
    })
  }
  if (data.authoringState === 'ISSUED' && can(session, 'invoice.cancel')) {
    moreActions.push({
      id: 'cancel',
      labelKey: noteType
        ? `salesNote.detail.cancelAction.${noteType}`
        : 'invoiceDetails.actions.cancel',
      icon: deleteIcon,
      danger: true,
      onSelect: () => setCancelling(true),
    })
  }

  const preview = (
    <DocumentPreview
      data={data}
      status={t(status.key, status.values)}
      seller={sellerParty(
        data.seller,
        companyProfile.read.status === 'ready' ? companyProfile.read.data : null,
        t,
        language,
      )}
      buyer={buyerParty(
        data.buyer,
        customer.read.status === 'ready' ? customer.read.data : null,
        t,
        language,
      )}
      paymentTerms={paymentTermLabel(t, data.details?.paymentTerms) ?? '—'}
      branch={branchName}
      lineTotals={totals}
      money={money}
      day={day}
    />
  )

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Breadcrumb type={data.type} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {data.invoiceNumber ? title : t('invoiceDetails.draftTitle')}
          </h1>
          <span
            className={[
              'inline-flex h-[31px] items-center gap-2 rounded-full border px-3 text-sm font-semibold',
              STATUS_TONES[status.tone],
            ].join(' ')}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {t(status.key, status.values)}
          </span>
          {/* A till sale's invoice or a till refund's credit note; absent from older servers. */}
          {data.source === 'TILL' ? (
            <span className="inline-flex items-center rounded-sm bg-neutral-25 px-2 py-0.5 text-xs font-semibold text-text-secondary">
              {data.till?.name?.trim() || data.till?.code
                ? t('invoicesPage.fromTillNamed', {
                    till: data.till?.name?.trim() || data.till?.code,
                  })
                : t('invoicesPage.fromTill')}
            </span>
          ) : null}

          <div className="ms-auto flex flex-wrap items-center gap-3">
            {moreActions.length > 0 ? (
              <ActionMenu
                items={moreActions}
                label={t('invoiceDetails.actions.more')}
                variant="bordered"
              />
            ) : null}
            {draft && can(session, 'invoice.draft') && !editWaitsOnApproval(salesApproval.approval) ? (
              <Link
                to={
                  data.type === 'CREDIT_NOTE' || data.type === 'DEBIT_NOTE'
                    ? `${NOTE_ROUTES[data.type]}/${data.id}/edit`
                    : `/invoices/${data.id}/edit`
                }
                className={GHOST_BUTTON}
              >
                <img src={editIcon} alt="" className="size-5" />
                {t('invoiceDetails.actions.edit')}
              </Link>
            ) : null}
            {draft &&
            can(session, 'invoice.issue') &&
            mayIssue &&
            !issueWaitsOnApproval(salesApproval.approval) ? (
              <button type="button" onClick={() => setIssuing(true)} className={PRIMARY_BUTTON}>
                {t(
                  noteType === 'CREDIT_NOTE'
                    ? 'invoiceIssue.creditNote.submit'
                    : noteType === 'DEBIT_NOTE'
                      ? 'invoiceIssue.debitNote.submit'
                      : 'invoiceIssue.action',
                )}
              </button>
            ) : null}
            {/* Duplicate and periodic start new drafts: not while read-only (ST-2, CA-3). */}
            {!draft &&
            data.authoringState === 'ISSUED' &&
            mayIssue &&
            can(session, 'invoice.draft') ? (
              // An invoice opens the composer filled from it (nothing is saved until the reader
              // saves); the notes and self-billed documents have their own composers.
              data.type === 'INVOICE' ? (
                <Link to={`/invoices/new?duplicate=${data.id}`} className={GHOST_BUTTON}>
                  <img src={copyIcon} alt="" className="size-5" />
                  {t('invoiceDetails.actions.duplicate')}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setNotice({ key: 'invoiceDetails.duplicateUnavailable' })}
                  className={GHOST_BUTTON}
                >
                  <img src={copyIcon} alt="" className="size-5" />
                  {t('invoiceDetails.actions.duplicate')}
                </button>
              )
            ) : null}
            {issuedInvoice && mayIssue && can(session, 'invoice.draft') && periodicIncluded ? (
              <Link to={`/income/periodic/new?template=${data.id}`} className={GHOST_BUTTON}>
                <img src={periodicIcon} alt="" className="h-3 w-[26px]" />
                {t('invoiceDetails.actions.periodic')}
              </Link>
            ) : null}
            {issuedInvoice && mayIssue && can(session, 'creditnote.create') ? (
              <button
                type="button"
                onClick={() => navigate(`/income/credit-notes/new?invoice=${data.id}`)}
                className={GHOST_BUTTON}
              >
                <img src={creditNoteIcon} alt="" className="size-5" />
                {t('invoiceDetails.actions.creditNote')}
              </button>
            ) : null}
            {/* A document not yet on its way is sent before its buyer is reminded of it. */}
            {canSend ? (
              <button type="button" onClick={() => setSending(true)} className={PRIMARY_BUTTON}>
                <img src={sendIcon} alt="" className="size-5 brightness-0 invert" />
                {t('invoiceDetails.actions.send')}
              </button>
            ) : !draft && data.authoringState === 'ISSUED' && canRemind ? (
              <button
                type="button"
                onClick={() => void sendReminder()}
                disabled={sendingReminder}
                className={PRIMARY_BUTTON}
              >
                <img src={sendIcon} alt="" className="size-5 brightness-0 invert" />
                {t(
                  sendingReminder
                    ? 'paymentReminders.invoice.sending'
                    : 'invoiceDetails.actions.sendReminder',
                )}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
          {data.issueDate ? (
            <>
              <span className="font-medium text-text-quaternary">{t('invoiceDetails.issued')}</span>
              <span className="font-semibold text-text-primary">{day(data.issueDate)}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            </>
          ) : null}
          {!draft ? (
            <>
              <span className="font-medium text-text-quaternary">
                {data.deliveryState === 'SENT_MANUALLY'
                  ? t('invoiceDetails.sentManually')
                  : dispatchLine?.state
                    ? t(dispatchLine.state.key)
                    : t('invoiceDetails.notSentYet')}
              </span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            </>
          ) : null}
          <span className="font-medium text-text-quaternary">{t(party.preposition)}</span>
          <span className="font-semibold text-text-primary">{customerName}</span>
        </div>
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {draft ? (
        <section className="rounded-sm border border-primary-300 bg-primary-25 p-4">
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('invoiceDetails.draftNotice')}
          </p>
        </section>
      ) : null}

      {draft ? (
        <DraftApprovalCard
          invoiceId={data.id}
          type={data.type}
          approval={salesApproval.approval}
          onRefused={salesApproval.retry}
          onChanged={() => {
            salesApproval.retry()
            invoice.retry()
            history.retry()
          }}
          onApproveAndIssue={
            can(session, 'invoice.issue') && mayIssue ? () => setIssuing(true) : undefined
          }
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {chaseable ? (
            <section className="rounded-sm border border-primary-300 bg-primary-25 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <BellIcon />
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.3] text-text-secondary max-md:basis-[calc(100%-32px)]">
                  <span className="font-semibold text-text-primary">
                    {ladder
                      ? t('invoiceDetails.reminder.ofLadder', {
                          n: ladder.number,
                          total: ladder.total,
                        })
                      : t('invoiceDetails.reminder.title')}
                  </span>{' '}
                  {ladder?.next ? (
                    <span className="text-text-quaternary">
                      {t(ladder.next.key, ladder.next.values)}
                    </span>
                  ) : shownReminder ? (
                    <span className="text-text-quaternary">
                      {t(VERDICT_NOTE[shownReminder.verdict])}
                    </span>
                  ) : (
                    '…'
                  )}
                </p>
                <div className="flex items-center gap-2 max-md:w-full max-md:justify-end">
                  {/* TODO(backend): reminders pause per tenant only (the ladder's switch), never per invoice; the design's Pause says so when pressed. */}
                  <button
                    type="button"
                    onClick={() => setNotice({ key: 'invoiceDetails.reminder.pauseUnavailable' })}
                    className="inline-flex h-9 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
                  >
                    {t('invoiceDetails.reminder.pause')}
                  </button>
                  {canRemind ? (
                    <button
                      type="button"
                      onClick={() => void sendReminder()}
                      disabled={sendingReminder}
                      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
                    >
                      <img src={sendIcon} alt="" className="size-4 brightness-0 opacity-70" />
                      {t(
                        sendingReminder
                          ? 'paymentReminders.invoice.sending'
                          : 'invoiceDetails.reminder.sendNow',
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRemindersOpen((open) => !open)}
                    aria-expanded={remindersOpen}
                    aria-label={t('invoiceDetails.reminder.details')}
                    className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white"
                  >
                    <img
                      src={chevronIcon}
                      alt=""
                      className={[
                        'size-5 transition-transform',
                        remindersOpen ? 'rotate-90' : '-rotate-90',
                      ].join(' ')}
                    />
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          {chaseable && remindersOpen ? (
            <InvoiceRemindersCard invoiceId={id} dueDate={data.dueDate} />
          ) : null}

          {!draft && owed && owed.paymentState !== 'NOT_APPLICABLE' ? (
            <section className="rounded-sm bg-surface-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t('invoiceDetails.outstandingBalance')}
                </h2>
                {due ? (
                  <span
                    className={[
                      'inline-flex h-[31px] items-center gap-2 rounded-full border py-1 ps-2 pe-3 text-sm font-semibold',
                      due.key === 'invoiceDetails.due.late'
                        ? 'border-danger-100 bg-danger-100 text-danger-700'
                        : 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
                    ].join(' ')}
                  >
                    <img src={clockIcon} alt="" className="size-5" />
                    {t(due.key, due.values)}
                    {owed.dueDate ? ` · ${day(owed.dueDate)}` : ''}
                  </span>
                ) : null}
              </div>
              <div className="mb-4 h-px w-full bg-border-subtle" />

              <OmAmount
                size="lg"
                amount={money(owed.outstandingAmount)}
                amountClassName="text-[32px] font-semibold leading-none text-text-primary/90"
                className="mb-3"
              />
              <div className="mb-4 h-3 overflow-hidden rounded-[5px] bg-surface-background">
                <div
                  className="h-full rounded-[5px] bg-primary-700"
                  style={{ width: `${paidPercent(owed)}%` }}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {noteType
                      ? t(`salesNote.detail.documentTotal.${noteType}`)
                      : t('invoiceDetails.invoiceTotal')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={money(owed.documentTotal)}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-primary"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">{t('invoiceDetails.paid')}</p>
                  <OmAmount
                    size="sm"
                    amount={money(owed.paidAmount)}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-success-700"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#727579]">
                    {owed.creditedAmount > 0
                      ? t('invoiceDetails.credited')
                      : t('invoiceDetails.outstanding')}
                  </p>
                  <OmAmount
                    size="sm"
                    amount={money(
                      owed.creditedAmount > 0 ? owed.creditedAmount : owed.outstandingAmount,
                    )}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-primary"
                  />
                </div>
              </div>

              {/* `peppolResponse` and `deliveredAt` are TODO(backend) and never answered, so nothing here reads them: a delivery is claimed only from the dispatch the server reports, never from a field whose meaning the API has not defined. */}
              <div className="mt-4 flex items-center gap-2 rounded-sm bg-surface-background px-3 py-2.5">
                <DeliveryIcon
                  sent={data.deliveryState === 'SENT_MANUALLY' || dispatchSucceeded(dispatch)}
                />
                <p className="text-xs font-medium leading-[1.3] text-text-tertiary">
                  {data.deliveryState === 'SENT_MANUALLY'
                    ? t('invoiceDetails.delivered.sentManually', {
                        customer: customerName,
                        when: sentAt ? formatInstant(sentAt, language) : day(data.issueDate),
                      })
                    : dispatchLine?.state && dispatch?.state !== 'NOT_SENT'
                      ? [
                          t(dispatchLine.state.key),
                          dispatchLine.reason
                            ? t(dispatchLine.reason.key, dispatchLine.reason.values)
                            : null,
                          buyerLine ? t(buyerLine.key) : null,
                          ...transportLines.map((line) =>
                            t(line.legKey, { state: t(line.state.key, line.state.values) }),
                          ),
                          ...reportLines.map((line) => t(line.key, line.values)),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : // A reader who may not see the customer gets the fact without a placeholder name.
                        customer.read.status === 'ready'
                        ? t('invoiceDetails.delivered.notSent', { customer: customerName })
                        : t('invoiceDetails.notSentYet')}
                </p>
              </div>
            </section>
          ) : null}

          <SectionCard
            title={t(party.section)}
            action={
              can(session, 'customer.read') && customer.read.status === 'ready' ? (
                <Link
                  to={`/customers/${data.customerId}/edit`}
                  className="inline-flex items-center gap-0.5 text-base font-semibold text-primary-800"
                >
                  {t(party.view)}
                  <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
                </Link>
              ) : undefined
            }
          >
            {customer.read.status === 'ready' ? (
              <div className="mb-4 flex items-center gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-primary-800">
                  {initialsOf(customer.read.data.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {customer.read.data.displayName}
                  </p>
                  <p className="truncate text-xs font-medium text-text-quaternary">
                    {[
                      customer.read.data.profile.details?.vatRegistrationNumber
                        ? t('invoiceDetails.vatNumber', {
                            number: customer.read.data.profile.details.vatRegistrationNumber,
                          })
                        : t('invoiceDetails.noVat'),
                      customer.read.data.profile.details?.peppolParticipantId
                        ? `${customer.read.data.profile.details.peppolParticipantId.scheme}:${customer.read.data.profile.details.peppolParticipantId.value}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {onPeppol ? (
                  <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-primary-300 bg-white px-2 text-xs font-semibold text-primary-800">
                    <img src={peppolBadgeIcon} alt="" className="size-4" />
                    {t('invoiceDetails.onPeppol')}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
              <MetaField label={t('invoiceDetails.fields.issueDate')} value={day(data.issueDate)} />
              {/* A credit note is not collected: its due date is only the issue date the API requires. */}
              {data.type === 'CREDIT_NOTE' ? null : (
                <MetaField label={t('invoiceDetails.fields.dueDate')} value={day(data.dueDate)} />
              )}
              <MetaField
                label={t('invoiceDetails.fields.deliveryDate')}
                value={day(data.details?.deliveryDate ?? null)}
              />
              <MetaField
                label={t('invoiceDetails.fields.paymentTerms')}
                value={paymentTermLabel(t, data.details?.paymentTerms) ?? '—'}
              />
              <MetaField
                label={t('invoiceDetails.fields.currency')}
                value={data.currency === 'OMR' ? t('invoiceDetails.currencyOmr') : data.currency}
              />
              <MetaField label={t('invoiceDetails.fields.vatTreatment')} value={vatTreatment} />
              <MetaField label={t('invoiceDetails.fields.branch')} value={branchName ?? '—'} />
              <MetaField
                label={t('invoiceDetails.fields.poReference')}
                value={data.details?.purchaseOrderReference ?? '—'}
              />
              <MetaField
                label={t('invoiceDetails.fields.subject')}
                value={data.details?.subject ?? '—'}
              />
              <MetaField
                label={t('invoiceDetails.fields.paymentMethod')}
                value={paymentMethodLabel(t, data.details?.paymentMethod) ?? '—'}
              />
            </div>
          </SectionCard>
        </div>

        <aside className="min-w-0">
          <section className="rounded-sm bg-surface-card p-4 xl:sticky xl:top-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-base font-medium leading-[1.2] text-text-secondary">
                <img src={pdfIcon} alt="" className="size-6" />
                {t('invoiceDetails.pdf.title')}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
                  disabled={zoom === ZOOMS[0]}
                  aria-label={t('invoiceDetails.zoomOut')}
                  className="rounded-sm p-0.5 hover:bg-neutral-25 disabled:opacity-40"
                >
                  <img src={zoomOutIcon} alt="" className="size-5" />
                </button>
                <span className="min-w-[38px] text-center text-xs font-medium text-text-quaternary tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])
                  }
                  disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                  aria-label={t('invoiceDetails.zoomIn')}
                  className="rounded-sm p-0.5 hover:bg-neutral-25 disabled:opacity-40"
                >
                  <img src={zoomInIcon} alt="" className="size-5" />
                </button>
                {/* TODO(backend): no PDF is rendered for a document yet; download and print wait for it. */}
                <button
                  type="button"
                  disabled
                  title={t('invoiceDetails.pdf.unavailable')}
                  aria-label={t('invoiceDetails.pdf.download')}
                  className="ms-1 rounded-sm p-0.5 disabled:opacity-40"
                >
                  <img src={downloadIcon} alt="" className="size-5" />
                </button>
                <button
                  type="button"
                  disabled
                  title={t('invoiceDetails.pdf.unavailable')}
                  aria-label={t('invoiceDetails.print')}
                  className="rounded-sm p-0.5 disabled:opacity-40"
                >
                  <img src={printIcon} alt="" className="size-5" />
                </button>
                {/* TODO(backend): sharing a copy of the invoice waits for the rendered PDF and the
                    share calls (INCOME.md rows SH.1 to SH.3). When live, hide both on a deemed
                    supply too (no buyer copy). Hidden while read-only (owner, 23 Oct). */}
                {mayShare ? (
                  <>
                    <button
                      type="button"
                      disabled
                      title={t('invoiceDetails.share.unavailable')}
                      aria-label={t('invoiceDetails.share.email')}
                      className="rounded-sm p-0.5 text-text-tertiary disabled:opacity-40"
                    >
                      <MailIcon />
                    </button>
                    <button
                      type="button"
                      disabled
                      title={t('invoiceDetails.share.unavailable')}
                      aria-label={t('invoiceDetails.share.whatsapp')}
                      className="rounded-sm p-0.5 text-text-tertiary disabled:opacity-40"
                    >
                      <ChatBubbleIcon />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  aria-label={t('invoiceDetails.fullscreen')}
                  className="rounded-sm p-0.5 hover:bg-neutral-25"
                >
                  <img src={fullscreenIcon} alt="" className="size-5" />
                </button>
              </div>
            </div>
            <div className="mb-3 h-px w-full bg-border-subtle" />
            <div
              title={t('invoiceDetails.pdf.previewNote')}
              className="max-h-[560px] overflow-auto rounded-sm bg-surface-background p-3"
            >
              <div style={{ zoom }}>{preview}</div>
            </div>
          </section>
        </aside>
      </div>

      <SectionCard title={t('invoiceDetails.items')}>
        <RowsView>
          <table className="w-full min-w-[720px] border-collapse text-start">
            <thead>
              <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                <th className="py-2 text-start font-semibold">
                  {t('invoiceDetails.col.description')}
                </th>
                <th className="py-2 text-start font-semibold">
                  {t('invoiceDetails.col.unitPrice')}
                </th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.vat')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.qty')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.unit')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.disc')}</th>
                <th className="py-2 text-end font-semibold">{t('invoiceDetails.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.lineNumber} className="border-b border-surface-background">
                  <td className="py-3 pe-4">
                    <p className="text-base font-medium text-text-primary">{line.description}</p>
                    <p className="mt-1 text-sm font-medium text-text-quaternary">
                      {[
                        unitLabel(line.unitCode, t),
                        line.productCode
                          ? t('invoiceDetails.catalogRef', { code: line.productCode })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {money(line.unitPrice)}
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {line.taxRate === null
                      ? t(`invoiceDetails.category.${line.en16931Category}`, {
                          defaultValue: line.taxCategoryCode,
                        })
                      : `${line.taxRate}%`}
                  </td>
                  <td className="py-3 text-base font-medium text-text-secondary">
                    {line.quantity}
                  </td>
                  <td className="py-3 text-base font-medium text-text-secondary">
                    {unitLabel(line.unitCode, t)}
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {line.discountValue === 0
                      ? '0'
                      : line.discountType === 'PERCENTAGE'
                        ? `${line.discountValue}%`
                        : money(line.discountValue)}
                  </td>
                  <td className="py-3 text-end text-xl font-semibold text-text-primary/90">
                    {money(totals.get(line.lineNumber))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>

        {data.totals ? (
          <div className="mt-4 ms-auto flex w-full max-w-[328px] flex-col gap-2.5">
            {[
              ['invoiceDetails.totals.subtotal', money(data.totals.subtotal), 'text-text-primary'],
              [
                'invoiceDetails.totals.discount',
                `− ${money(data.totals.totalDiscount)}`,
                'text-success-700',
              ],
              ['invoiceDetails.totals.net', money(data.totals.taxableAmount), 'text-text-primary'],
              [
                vatRates.length === 1 && data.lines[0]
                  ? t('invoiceDetails.totals.vatRate', {
                      // Its own words: Arabic needs the definite, agreeing form after "الضريبة"
                      // ("الضريبة · القياسية"), which the header's "نسبة قياسية" does not take.
                      category: t(`invoiceDetails.totals.category.${data.lines[0].en16931Category}`, {
                        defaultValue: vatCategory,
                      }),
                      rate: data.lines[0].taxRate ?? 0,
                    })
                  : t('invoiceDetails.totals.vatOnly'),
                money(data.totals.vatAmount),
                'text-text-primary',
              ],
            ].map(([key, value, tone]) => (
              <div key={key} className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-text-tertiary">
                  {key.startsWith('invoiceDetails.') ? t(key) : key}
                </span>
                <OmAmount
                  size="xs"
                  amount={value}
                  amountClassName={`text-base font-semibold ${tone}`}
                />
              </div>
            ))}
            <div className="my-1 h-px w-full bg-border-subtle" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-text-primary">
                {t('invoiceDetails.totals.total')}
              </span>
              <OmAmount
                size="sm"
                amount={money(data.totals.totalAmount)}
                amountClassName="text-xl font-semibold text-text-primary"
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm font-medium text-text-quaternary">
            {t('invoiceDetails.totals.atIssue')}
          </p>
        )}
      </SectionCard>

      <SectionCard title={t('invoiceDetails.notes.title')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">
              {t(party.note)}{' '}
              <span className="text-xs text-text-quaternary">
                {noteType ? t('salesNote.detail.onNote') : t('invoiceDetails.notes.onInvoice')}
              </span>
            </p>
            <div className="min-h-[64px] rounded-sm border border-border-subtle bg-surface-tab-bar px-3 py-2.5">
              <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                {data.details?.customerVisibleNote ?? '—'}
              </p>
            </div>
          </div>
          {can(session, 'invoice.internal-note.read') ? (
            <div>
              <p className="mb-2 text-sm font-medium text-text-primary">
                {t('invoiceDetails.notes.internal')}{' '}
                <span className="text-xs text-text-quaternary">
                  {t('invoiceDetails.notes.private')}
                </span>
              </p>
              <div className="min-h-[64px] rounded-sm border border-border-subtle bg-surface-tab-bar px-3 py-2.5">
                <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                  {internalNote.read.status === 'ready'
                    ? (internalNote.read.data.internalNote ?? '—')
                    : internalNote.read.status === 'failed'
                      ? t('invoiceDetails.notes.unavailable')
                      : '…'}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t('invoiceDetails.attachments.title')}>
        <div className="flex flex-col gap-3">
          {attachments.read.status === 'ready' && attachments.read.data.length > 0
            ? attachments.read.data.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 rounded-sm border border-border-subtle p-2.5"
                >
                  <img
                    src={file.contentType.startsWith('image/') ? fileJpgIcon : filePdfIcon}
                    alt=""
                    className="size-9 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium leading-[1.2] text-text-primary">
                      {file.filename}
                    </p>
                    {/* TODO(backend): the design names the document kind; the file type stands in for it. */}
                    <p className="mt-1.5 truncate text-sm font-medium leading-[1.2] text-text-tertiary">
                      {t(
                        file.attachedByName
                          ? 'invoiceDetails.attachments.metaBy'
                          : 'invoiceDetails.attachments.meta',
                        {
                          kind: fileKind(file),
                          size: formatFileSize(file.byteSize),
                          date: formatDate(file.attachedAt.slice(0, 10), language),
                          name: file.attachedByName ?? '',
                        },
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => download(file)}
                    aria-label={t('invoiceDetails.download')}
                    className={ICON_BUTTON}
                  >
                    <img src={fileDownloadIcon} alt="" className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!canManageAttachments || removingAttachmentId === file.id}
                    onClick={canManageAttachments ? () => void removeFile(file) : undefined}
                    title={
                      canManageAttachments
                        ? t('invoiceDetails.delete')
                        : t(
                            draft
                              ? 'invoiceDetails.attachments.removeUnavailable'
                              : 'invoiceDetails.attachments.issuedNote',
                          )
                    }
                    aria-label={t('invoiceDetails.delete')}
                    className={ICON_BUTTON}
                  >
                    <img src={fileDeleteIcon} alt="" className="size-4" />
                  </button>
                </div>
              ))
            : null}
          {attachments.read.status === 'ready' && attachments.read.data.length === 0 ? (
            <p className="text-sm font-medium text-text-quaternary">
              {noteType
                ? t('salesNote.detail.attachmentsNone')
                : t('invoiceDetails.attachments.none')}
            </p>
          ) : null}
          {canManageAttachments ? (
            <FileDropzone
              accept=".pdf,.jpg,.jpeg,.xlsx"
              multiple
              maxBytes={10 * 1024 * 1024}
              onFiles={(files) => void uploadFiles(files)}
              onReject={(reason, file) =>
                setNotice({
                  key: `invoiceDetails.attachments.${reason === 'size' ? 'tooLarge' : 'wrongType'}`,
                  values: { name: file.name },
                })
              }
              className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-3.5 transition-colors hover:bg-primary-25"
            >
              {() => (
                <>
                  <img src={uploadIcon} alt="" className="size-5" />
                  <span className="text-sm font-medium text-text-secondary">
                    {uploadingAttachment
                      ? t('invoiceDetails.attachments.uploading')
                      : t('invoiceDetails.attachments.drop')}
                  </span>
                  <span className="text-xs font-medium text-text-muted">
                    {t('invoiceDetails.attachments.hint')}
                  </span>
                </>
              )}
            </FileDropzone>
          ) : (
            <button
              type="button"
              onClick={() =>
                setNotice({
                  key: draft
                    ? 'invoiceDetails.attachments.uploadUnavailable'
                    : noteType
                      ? 'salesNote.detail.attachmentsIssued'
                      : 'invoiceDetails.attachments.issuedNote',
                })
              }
              className="flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar px-4 py-3.5 transition-colors hover:bg-primary-25"
            >
              <img src={uploadIcon} alt="" className="size-5" />
              <span className="text-sm font-medium text-text-secondary">
                {t('invoiceDetails.attachments.drop')}
              </span>
              <span className="text-xs font-medium text-text-muted">
                {t('invoiceDetails.attachments.hint')}
              </span>
            </button>
          )}
        </div>
      </SectionCard>

      {/* Nothing is paid on a credit note; it lowers the invoice's balance instead. */}
      {!draft && data.type !== 'CREDIT_NOTE' ? (
        <SectionCard
          title={t('invoiceDetails.payments.title')}
          action={
            canPay ? (
              <button
                type="button"
                onClick={() => setPaying(true)}
                className="inline-flex items-center gap-1 text-base font-semibold text-primary-800 hover:text-primary-700"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  +
                </span>
                {t('invoiceDetails.payments.add')}
              </button>
            ) : undefined
          }
        >
          {payments.read.status === 'ready' && paymentRows(payments.read.data).length > 0 ? (
            <ul className="flex flex-col gap-3">
              {paymentRows(payments.read.data).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-sm border border-border-subtle p-2.5"
                >
                  <img src={filePdfIcon} alt="" className="size-9 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'truncate text-base font-medium leading-[1.2]',
                        row.reversed ? 'text-text-quaternary line-through' : 'text-text-primary',
                      ].join(' ')}
                    >
                      {row.methodCode
                        ? t(`invoiceDetails.pay.means.${row.methodCode}`, {
                            defaultValue: row.methodCode,
                          })
                        : t('invoiceDetails.payments.title')}
                    </p>
                    {/* The design's second line: date · reference · a note. The amount takes the note's place. */}
                    <p className="mt-1.5 flex flex-wrap items-center gap-1 text-sm font-medium leading-[1.2] text-text-tertiary">
                      <span>{day(row.paymentDate)}</span>
                      {row.reference ? (
                        <span>
                          {' · '}
                          {t('invoiceDetails.payments.ref', { reference: row.reference })}
                        </span>
                      ) : null}
                      <span>{' · '}</span>
                      <OmAmount
                        size="xs"
                        amount={money(row.amount)}
                        amountClassName={
                          row.reversed
                            ? 'font-semibold text-text-quaternary line-through'
                            : 'font-semibold text-text-primary'
                        }
                      />
                    </p>
                  </div>
                  {row.reversed ? (
                    <span className="shrink-0 rounded-full bg-neutral-25 px-3 py-1 text-xs font-semibold text-text-quaternary">
                      {t('invoiceDetails.payments.reversed')}
                    </span>
                  ) : (
                    <>
                      {/* TODO(backend): no receipt is rendered for a payment; the design's download waits for it. */}
                      <button
                        type="button"
                        disabled
                        title={t('invoiceDetails.payments.receiptUnavailable')}
                        aria-label={t('invoiceDetails.download')}
                        className={ICON_BUTTON}
                      >
                        <img src={fileDownloadIcon} alt="" className="size-4" />
                      </button>
                      {canReverse ? (
                        <button
                          type="button"
                          onClick={() =>
                            setReversing({ id: row.id, amount: row.amount, key: newPaymentKey() })
                          }
                          aria-label={t('invoiceDetails.pay.reverse')}
                          title={t('invoiceDetails.pay.reverse')}
                          className={[ICON_BUTTON, 'hover:bg-danger-100'].join(' ')}
                        >
                          <img src={fileDeleteIcon} alt="" className="size-4" />
                        </button>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-text-quaternary">
              {t('invoiceDetails.payments.none')}
            </p>
          )}
          {owed && owed.paymentState !== 'NOT_APPLICABLE' ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-text-secondary">
              <span className="inline-flex items-center gap-1">
                {t('invoiceDetails.payments.paid')}{' '}
                <OmAmount
                  size="xs"
                  amount={money(owed.paidAmount)}
                  amountClassName="font-semibold text-text-primary"
                />{' '}
                {t('invoiceDetails.payments.of')}{' '}
                <OmAmount
                  size="xs"
                  amount={money(owed.documentTotal)}
                  amountClassName="font-semibold text-text-primary"
                />
                {/* Without the credit, "Paid 0.000 of 52.500, Outstanding 42.000" did not add up. */}
                {owed.creditedAmount > 0 ? (
                  <>
                    {' · '}
                    {t('invoiceDetails.credited')}{' '}
                    <OmAmount
                      size="xs"
                      amount={money(owed.creditedAmount)}
                      amountClassName="font-semibold text-text-primary"
                    />
                  </>
                ) : null}
              </span>
              <span className="inline-flex items-center gap-1">
                {t('invoiceDetails.outstanding')}{' '}
                <OmAmount
                  size="xs"
                  amount={money(owed.outstandingAmount)}
                  amountClassName="font-semibold text-text-primary"
                />
              </span>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {notes.read.status === 'ready' && notes.read.data.items.length > 0 ? (
        <SectionCard title={t('salesNote.onInvoice.title')}>
          <ul className="flex flex-col">
            {notes.read.data.items.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-center gap-3 border-b border-surface-background py-3 last:border-0"
              >
                <Link
                  to={`${NOTE_ROUTES[note.type === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE']}/${note.id}`}
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {note.invoiceNumber ?? t('invoiceDetails.draftTitle')}
                </Link>
                <span className="text-xs font-medium text-text-quaternary">
                  {t(`invoicesPage.docType.${note.type}`)}
                  {note.issueDate ? ` · ${formatDate(note.issueDate, language)}` : ''}
                  {note.authoringState !== 'ISSUED'
                    ? ` · ${t(`salesNote.state.${note.authoringState}`)}`
                    : ''}
                </span>
                <span className="ms-auto">
                  {note.totals ? (
                    <OmAmount
                      size="xs"
                      amount={formatAmount(note.totals.totalAmount, note.currency, language)}
                      amountClassName="text-sm font-semibold text-text-primary tabular-nums"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-text-primary">—</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title={t('invoiceDetails.timeline.title')}>
        {history.read.status === 'ready' ? (
          <ol className="flex flex-col">
            {/* The design heads the trail with where the balance stands now (Figma 154:163406). */}
            {owed && owed.paymentState !== 'NOT_APPLICABLE' && !draft ? (
              <li className="flex gap-3">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-700">
                    <CheckIcon />
                  </span>
                  <span className="my-1 w-0.5 flex-1 bg-success-700" />
                </div>
                <div className="pb-5">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {t(status.key, status.values)}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1 text-sm font-medium leading-[1.2] text-text-tertiary">
                    {t('invoiceDetails.outstanding')}{' '}
                    <OmAmount
                      size="xs"
                      amount={money(owed.outstandingAmount)}
                      amountClassName="font-semibold text-text-primary"
                    />
                    {due ? <span>{` · ${t(due.key, due.values).toLowerCase()}`}</span> : null}
                  </p>
                </div>
              </li>
            ) : null}
            {timelineOf(history.read.data, session?.userId ?? null).map((event, index, all) => (
              <li key={`${event.key}-${event.at}-${index}`} className="flex gap-3">
                <div className="flex w-7 shrink-0 flex-col items-center">
                  <span
                    className={[
                      'flex size-7 shrink-0 items-center justify-center rounded-full',
                      index === 0 && (!owed || owed.paymentState === 'NOT_APPLICABLE' || draft)
                        ? 'bg-primary-700'
                        : 'bg-success-700',
                    ].join(' ')}
                  >
                    <CheckIcon />
                  </span>
                  {index < all.length - 1 ? (
                    <span className="my-1 w-0.5 flex-1 bg-success-700" />
                  ) : null}
                </div>
                <div className={index < all.length - 1 ? 'pb-5' : ''}>
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {t(event.key)}
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-[1.2] text-text-tertiary">
                    {[
                      event.byYou ? t('invoiceDetails.you') : null,
                      formatInstant(event.at, language),
                      event.outcome,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </li>
            ))}
            {history.read.data.truncated ? (
              <li className="text-sm font-medium text-text-quaternary">
                {t('invoiceDetails.timeline.truncated', { count: history.read.data.limit })}
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-sm font-medium text-text-quaternary">…</p>
        )}
      </SectionCard>

      <Modal
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        title={t('invoiceDetails.pdf.title')}
        width={880}
      >
        <div className="rounded-sm bg-surface-background p-4">{preview}</div>
      </Modal>

      {issuing ? (
        <IssueInvoiceModal
          invoiceId={data.id}
          version={data.version}
          initialIssueDate={muscatToday()}
          initialDueDate={dueDateFor(reference, muscatToday(), data.details?.paymentTerms?.code)}
          kind={noteType ?? 'INVOICE'}
          customerId={data.customerId}
          onClose={() => setIssuing(false)}
          onIssued={(issued) => {
            setIssuing(false)
            // The lines that moved no stock are said with the number (STOCK-CONTRACT section 6).
            const stock = stockLineWarningTexts(t, issued.warnings)
            setNotice(
              stock.length > 0
                ? {
                    body: [
                      t('invoiceIssue.done', { number: issued.invoiceNumber ?? '' }),
                      ...stock,
                    ].join(' '),
                  }
                : { key: 'invoiceIssue.done', values: { number: issued.invoiceNumber ?? '' } },
            )
            // Payments load on their own once the reread says the invoice is issued.
            invoice.retry()
            receivable.retry()
            history.retry()
          }}
        />
      ) : null}

      {sending ? (
        <SendInvoiceModal
          invoiceId={data.id}
          invoiceNumber={data.invoiceNumber}
          onClose={() => setSending(false)}
          onSent={sent}
        />
      ) : null}

      {paying && owed ? (
        <RecordPaymentModal
          invoiceId={data.id}
          invoiceNumber={data.invoiceNumber}
          currency={data.currency}
          outstanding={owed.outstandingAmount}
          issueDate={data.issueDate}
          today={today}
          onClose={() => setPaying(false)}
          onRecorded={() => {
            setPaying(false)
            setNotice({ key: 'invoiceDetails.done.recorded' })
            afterPayment()
          }}
        />
      ) : null}

      <Modal
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title={t('invoiceDetails.pay.reverseTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReversing(null)} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={reverse}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t('invoiceDetails.pay.reverseConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('invoiceDetails.pay.reverseBody', {
            amount: reversing ? money(reversing.amount) : '',
          })}
        </p>
      </Modal>

      <Modal
        open={cancelling}
        onClose={() => {
          setCancelling(false)
          setReason('')
        }}
        title={
          noteType
            ? t(`salesNote.detail.cancelTitle.${noteType}`)
            : t('invoiceDetails.cancel.title')
        }
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCancelling(false)
                setReason('')
              }}
              className={GHOST_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy || reason.trim() === ''}
              className="inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {noteType
                ? t(`salesNote.detail.cancelConfirm.${noteType}`)
                : t('invoiceDetails.cancel.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {noteType
            ? t(`salesNote.detail.cancelBody.${noteType}`)
            : t('invoiceDetails.cancel.body')}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('invoiceDetails.cancel.reason')}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>
    </div>
  )
}

/**
 * The "Invoice PDF" pane, drawn from the document itself.
 *
 * TODO(backend): no PDF is rendered for a document today (decision of 2026-09-16), so the pane
 * shows the same facts laid out as the paper would be; the real file replaces it when it exists.
 */
function DocumentPreview({
  data,
  status,
  seller,
  buyer,
  paymentTerms,
  branch,
  lineTotals: totals,
  money,
  day,
}: {
  data: InvoiceDetailDto
  status: string
  seller: DocumentParty | null
  buyer: DocumentParty | null
  paymentTerms: string
  branch: string | undefined
  lineTotals: Map<number, number>
  money: (value: number | null | undefined) => string
  day: (value: string | null) => string
}) {
  const { t } = useTranslation()
  const kind =
    data.type === 'CREDIT_NOTE'
      ? 'creditNote'
      : data.type === 'DEBIT_NOTE'
        ? 'debitNote'
        : 'taxInvoice'
  // Without a seller (a reader the company profile does not admit, on a document with no issued
  // snapshot) the branch is all the page knows, which is what it showed before.
  const masthead = seller?.name ?? branch
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-[3px] bg-white p-5 text-[9px] leading-[1.35] text-text-secondary shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-sm bg-primary-700 text-[11px] font-bold text-white">
            {initialsOf(masthead ?? 'F')}
          </span>
          <div>
            <p className="text-[11px] font-semibold text-text-primary">{masthead ?? '—'}</p>
            {seller && branch ? <p className="text-text-quaternary">{branch}</p> : null}
          </div>
        </div>
        <div className="text-end">
          <p className="text-[11px] font-bold text-primary-800">
            {t(`invoiceDetails.preview.${kind}`)}
          </p>
          <p className="text-text-quaternary">
            {data.invoiceNumber ?? t('invoiceDetails.draftTitle')}
          </p>
          <span className="mt-1 inline-flex rounded-full bg-warning-100 px-1.5 py-px text-[7px] font-semibold text-[#6d5a39]">
            {status}
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[7px] font-semibold uppercase tracking-wide text-text-quaternary">
            {t('invoiceDetails.preview.from')}
          </p>
          {seller ? (
            <PartyLines party={seller} />
          ) : (
            <p className="font-semibold text-text-primary">{branch ?? '—'}</p>
          )}
          {seller && branch ? <p>{branch}</p> : null}
        </div>
        <div>
          <p className="text-[7px] font-semibold uppercase tracking-wide text-text-quaternary">
            {t(counterpartyKeys(data.type).section)}
          </p>
          {buyer ? (
            <PartyLines party={buyer} />
          ) : (
            <p className="font-semibold text-text-primary">—</p>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ['invoiceDetails.fields.issueDate', day(data.issueDate)],
          // A credit note is not collected, so its paper names no due date either.
          ...(data.type === 'CREDIT_NOTE'
            ? []
            : [['invoiceDetails.fields.dueDate', day(data.dueDate)]]),
          ['invoiceDetails.fields.poReference', data.details?.purchaseOrderReference ?? '—'],
          ['invoiceDetails.fields.paymentTerms', paymentTerms],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[7px] font-semibold uppercase tracking-wide text-text-quaternary">
              {t(label)}
            </p>
            <p className="font-medium text-text-primary">{value}</p>
          </div>
        ))}
      </div>
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="bg-primary-700 text-[7px] font-semibold uppercase text-white">
            <th className="px-1.5 py-1 text-start">{t('invoiceDetails.col.description')}</th>
            <th className="px-1.5 py-1 text-end">{t('invoiceDetails.col.unitPrice')}</th>
            <th className="px-1.5 py-1 text-end">{t('invoiceDetails.col.qty')}</th>
            <th className="px-1.5 py-1 text-end">{t('invoiceDetails.col.vat')}</th>
            <th className="px-1.5 py-1 text-end">{t('invoiceDetails.col.total')}</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => (
            <tr key={line.lineNumber} className="border-b border-surface-background">
              <td className="px-1.5 py-1 text-text-primary">{line.description}</td>
              <td className="px-1.5 py-1 text-end">{money(line.unitPrice)}</td>
              <td className="px-1.5 py-1 text-end">{line.quantity}</td>
              <td className="px-1.5 py-1 text-end">
                {line.taxRate === null ? '—' : `${line.taxRate}%`}
              </td>
              <td className="px-1.5 py-1 text-end font-semibold text-text-primary">
                {money(totals.get(line.lineNumber))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.totals ? (
        <div className="ms-auto mt-2 w-[58%]">
          {[
            [t('invoiceDetails.totals.subtotal'), money(data.totals.subtotal)],
            [t('invoiceDetails.totals.discount'), `− ${money(data.totals.totalDiscount)}`],
            [t('invoiceDetails.totals.net'), money(data.totals.taxableAmount)],
            [t('invoiceDetails.totals.vatOnly'), money(data.totals.vatAmount)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2 py-0.5">
              <span className="text-text-quaternary">{label}</span>
              <span className="inline-flex items-center gap-0.5 text-text-primary">
                <RialMark className="w-2 text-text-secondary" />
                {value}
              </span>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-2 border-t border-border-subtle pt-1 text-[10px] font-bold text-text-primary">
            <span>{t('invoiceDetails.preview.totalDue')}</span>
            <span className="inline-flex items-center gap-0.5">
              <RialMark className="w-2.5 text-text-primary" />
              {money(data.totals.totalAmount)}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-text-quaternary">{t('invoiceDetails.totals.atIssue')}</p>
      )}
      {data.details?.customerVisibleNote ? (
        <p className="mt-4 text-[8px] text-text-quaternary">{data.details.customerVisibleNote}</p>
      ) : null}
    </div>
  )
}

function PartyLines({ party }: { party: DocumentParty }) {
  const { t } = useTranslation()
  return (
    <>
      <p className="font-semibold text-text-primary">{party.name}</p>
      {party.vat ? <p>{t('invoiceDetails.vatNumber', { number: party.vat })}</p> : null}
      {party.addressLines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 5"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeliveryIcon({ sent }: { sent: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={['size-5 shrink-0', sent ? 'text-success-700' : 'text-text-muted'].join(' ')}
    >
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {sent ? (
        <path
          d="M6.5 10.5 9 13 13.5 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M10 6v4.5l2.5 1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 shrink-0 text-primary-800">
      <path
        d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v2.6c0 .6-.2 1.2-.6 1.7l-1.1 1.5a.7.7 0 0 0 .6 1.1h11.2a.7.7 0 0 0 .6-1.1l-1.1-1.5a2.8 2.8 0 0 1-.6-1.7V7A4.5 4.5 0 0 0 10 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 16a2 2 0 0 0 4 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Breadcrumb({ type }: { type?: InvoiceDetailDto['type'] }) {
  const { t } = useTranslation()
  const note = type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE' ? type : null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/invoices"
        className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
      >
        {t('invoiceDetails.breadcrumbIncome')}
        <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
      </Link>
      <Link
        to={note ? NOTE_ROUTES[note] : '/invoices'}
        className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
      >
        {note
          ? t(note === 'CREDIT_NOTE' ? 'salesNote.credit.list' : 'salesNote.debit.list')
          : t('invoiceDetails.breadcrumbInvoices')}
      </Link>
    </div>
  )
}

/** The design's "Purchase order · 248 KB": the file's type stands in for a kind the API lacks. */
function fileKind(file: InvoiceAttachmentDto): string {
  const extension = file.filename.split('.').pop()
  if (extension && extension.length <= 5 && extension !== file.filename)
    return extension.toUpperCase()
  return file.contentType.split('/').pop()?.toUpperCase() ?? ''
}

function refusalText(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION')
    return t('invoiceDetails.refused.stale')
  if (error instanceof ApiError && error.code === 'INVOICE_NOT_CANCELLABLE')
    return t('invoiceDetails.refused.notCancellable')
  if (error instanceof ApiError && error.code === 'DELIVERED_INVOICE_CANCELLATION_NOT_APPROVED') {
    return t('invoiceDetails.refused.delivered')
  }
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

export type { ViewNote }

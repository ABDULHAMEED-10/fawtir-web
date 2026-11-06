import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { stockLineWarningTexts } from '../../lib/stockLineWarnings'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FileDropzone,
  Modal,
  OmAmount,
  RowsView,
  withRial,
  type ActionMenuItem,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { InvoiceRemindersCard } from '../../components/invoice/InvoiceRemindersCard'
import { DraftApprovalCard, useSalesApproval } from '../../components/invoice/DraftApprovalCard'
import { editWaitsOnApproval, issueWaitsOnApproval } from '../../lib/salesApproval'
import { DocumentPreview, type PreviewDocument } from '../../components/invoice/DocumentPreview'
import { useDocumentPreview } from '../../components/invoice/useDocumentPreview'
import { ApiError } from '../../api'
import {
  cancelInvoice,
  downloadAttachment,
  invoicePath,
  loadAttachments,
  loadHistory,
  loadInternalNote,
  loadInvoice,
  loadPayments,
  loadReceivable,
  newPaymentKey,
  reversePayment,
  type InvoiceAttachmentDto,
  type InvoiceDetailDto,
  type InvoiceHistoryDto,
  type InvoicePaymentDto,
  type InvoiceReceivableDto,
  type InvoiceLineWarningDto,
  deliveryBlockerKey,
} from '../../api/invoices/detail'
import type { NoteKind } from '../../api/invoices/drafts'
import { loadCustomer, type CustomerDto } from '../../api/customers/customers'
import {
  COMPANY_PROFILE_PATH,
  loadCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import { buyerParty, sellerParty } from '../../lib/documentParties'
import { RecordPaymentModal } from '../InvoiceDetailsPage/RecordPaymentModal'
import {
  ISSUED_DEBIT_NOTE_LOCKED,
  PAYMENT_REFUSALS,
  isDraft,
  lineTotals,
  noteCancelRefusalKey,
  paymentRows,
  refundedOnNote,
  timelineOf,
} from '../../lib/invoiceDetail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant, initialsOf } from '../../lib/format'
import { formatFileSize } from '../../lib/files'
import { muscatToday } from '../../lib/invoiceIssue'
import {
  NOTE_ROUTES,
  daysBetween,
  reasonLabelKey,
  participantIdText,
  unitLabel,
  type NoteListStatus,
} from '../../lib/salesNote'
import { can, useSession } from '../../lib/session/session'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import backIcon from '../../assets/invoice-details/back.svg'
import chevronIcon from '../../assets/invoice-details/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import printIcon from '../../assets/invoice-details/print.svg'
import zoomInIcon from '../../assets/invoice-details/zoom-in.svg'
import zoomOutIcon from '../../assets/invoice-details/zoom-out.svg'
import fullscreenIcon from '../../assets/invoice-details/fullscreen.svg'
import pdfIcon from '../../assets/invoice-details/pdf.svg'
import peppolCheckIcon from '../../assets/invoice-details/peppol-check.svg'
import customerLogo from '../../assets/invoice-details/customer-logo.svg'
import timelineCheckIcon from '../../assets/invoice-details/timeline-check.svg'
import cardIcon from '../../assets/credit-note-detail/card.svg'
import reducesIcon from '../../assets/credit-note-detail/arrow-up-left.svg'
import returnIcon from '../../assets/credit-note-detail/return.svg'
import warningIcon from '../../assets/credit-note-detail/warning.svg'
import increasesIcon from '../../assets/debit-note-create/trend-up.svg'
import clockIcon from '../../assets/invoice-details/clock.svg'
import editIcon from '../../assets/actions/edit.svg'
import invoiceActionIcon from '../../assets/actions/invoice.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'

type Chip = { bg: string; text: string }
const STATUS_STYLES: Record<NoteListStatus, Chip> = {
  draft: { bg: 'bg-neutral-25', text: 'text-text-quaternary' },
  toSend: { bg: 'bg-primary-25', text: 'text-primary-800' },
  refundDue: { bg: 'bg-warning-100', text: 'text-[#6d5a39]' },
  applied: { bg: 'bg-success-100', text: 'text-success-700' },
  refunded: { bg: 'bg-success-100', text: 'text-success-700' },
  awaiting: { bg: 'bg-warning-100', text: 'text-[#6d5a39]' },
  overdue: { bg: 'bg-danger-100', text: 'text-danger-700' },
  paid: { bg: 'bg-success-100', text: 'text-success-700' },
  cancelled: { bg: 'bg-neutral-25', text: 'text-text-muted' },
}

const GHOST_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** The EN 16931 category behind a line, in the words the design prints ("Standard rate · 5%"). */
const CATEGORY_WORDS: Record<string, string> = {
  S: 'standard',
  Z: 'zero',
  E: 'exempt',
  O: 'outOfScope',
  AE: 'reverseCharge',
  G: 'export',
}

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mb-3 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function MetaField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
    </div>
  )
}

/**
 * Income › a credit or debit note, opened: the "Credit notes details" and "Credit note detail"
 * (which is the debit note, DBN-0043) frames. The note, what it did to its invoice, its lines and
 * notes, the money that moved, its trail — and beside them the document as it prints.
 */
export function SalesNoteDetailPage({ kind }: { kind: NoteKind }) {
  return (
    <AppShell>
      <NoteScreen kind={kind} />
    </AppShell>
  )
}

function NoteScreen({ kind }: { kind: NoteKind }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  // Issuing stops while the subscription is read-only (ST-2): the action is hidden, not greyed.
  const mayIssue = useSubscriptionAllows('ISSUE_DOCUMENTS')
  const navigate = useNavigate()
  const location = useLocation()
  const { id = '' } = useParams()
  const credit = kind === 'CREDIT_NOTE'
  const kindKey = credit ? 'credit' : 'debit'
  const base = NOTE_ROUTES[kind]

  const note = useApiRead<InvoiceDetailDto>(invoicePath(id), () => loadInvoice(id))
  const document = note.read.status === 'ready' ? note.read.data : null
  const originalId = document?.correctionOfInvoiceId ?? null

  // The reads behind their permissions, each asked for only once the document exists.
  const receivable = useApiRead<InvoiceReceivableDto>(
    document ? `${invoicePath(id)}/receivable` : null,
    () => loadReceivable(id),
  )
  const payments = useApiRead<InvoicePaymentDto[]>(
    document && !credit && !isDraft(document) ? `${invoicePath(id)}/payments` : null,
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
  // The frame prints the internal note with the page; reading it is an audited event, so the
  // activity is re-read once it lands.
  const internalNote = useApiRead<{ internalNote: string | null }>(
    document && can(session, 'invoice.internal-note.read')
      ? `${invoicePath(id)}/internal-note`
      : null,
    () => loadInternalNote(id),
  )
  const noteRead = internalNote.read.status === 'ready'
  useEffect(() => {
    if (noteRead) history.retry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteRead])
  const customer = useApiRead<CustomerDto>(
    document && can(session, 'customer.read') ? `/v1/customers/${document.customerId}` : null,
    () => loadCustomer(document!.customerId),
  )
  // As on the invoice: the live profile stands in for the seller only without an issued snapshot.
  const companyProfile = useApiRead<CompanyProfileDto>(
    document && !document.seller && can(session, 'admin.settings.manage')
      ? COMPANY_PROFILE_PATH
      : null,
    loadCompanyProfile,
  )
  // The invoice this note corrects, and what it still owes, for "Reverses INV-2044" and the effect.
  const original = useApiRead<InvoiceDetailDto>(originalId ? invoicePath(originalId) : null, () =>
    loadInvoice(originalId!),
  )
  // The refunds on the credited invoice, read only where Cancel would be offered on an issued
  // credit note: a refunded note may not be cancelled (DA-2), and nothing the page already reads
  // says whether it was refunded.
  const refundsPath =
    credit && document?.authoringState === 'ISSUED' && originalId && can(session, 'invoice.cancel')
      ? `${invoicePath(originalId)}/payments`
      : null
  const originalPayments = useApiRead<InvoicePaymentDto[]>(refundsPath, () =>
    loadPayments(originalId!),
  )
  const originalOwed = useApiRead<InvoiceReceivableDto>(
    originalId ? `${invoicePath(originalId)}/receivable` : null,
    () => loadReceivable(originalId!),
  )

  const arrival = location.state as {
    issuedNumber?: string | null
    stockWarnings?: InvoiceLineWarningDto[]
  } | null
  const issuedNumber = arrival?.issuedNumber
  const [notice, setNotice] = useState<string | null>(
    issuedNumber
      ? [
          t(`salesNote.issued.${kindKey}`, { number: issuedNumber }),
          ...stockLineWarningTexts(t, arrival?.stockWarnings),
        ].join(' ')
      : null,
  )
  useEffect(() => {
    if (issuedNumber) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [paying, setPaying] = useState(false)
  // Set by a payment refusal that says the balance moved (DA-12): the page re-reads on close,
  // since a re-read while the dialog is open would unmount it.
  const balanceStale = useRef(false)
  const [reversing, setReversing] = useState<{ id: string; amount: number; key: string } | null>(
    null,
  )
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const preview = useDocumentPreview()

  const breadcrumb = (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        to="/invoices"
        className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
      >
        {t('salesNote.compose.breadcrumbIncome')}
        <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
      </Link>
      <Link
        to={base}
        className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary"
      >
        {t(`salesNote.${kindKey}.list`)}
      </Link>
    </div>
  )

  if (note.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {breadcrumb}
        {note.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={note.read.error} retry={note.retry} notFoundOn400 />
        )}
      </div>
    )
  }

  const data = note.read.data
  const draft = isDraft(data)
  const owed = receivable.read.status === 'ready' ? receivable.read.data : null
  const orig = original.read.status === 'ready' ? original.read.data : null
  const origOwed = originalOwed.read.status === 'ready' ? originalOwed.read.data : null
  // The note's own customerName and correctionOfInvoiceNumber (C-5, backend #824) stand in while
  // the customer or the original invoice is unread or refused; a server before #824 sends null.
  const customerName =
    customer.read.status === 'ready'
      ? customer.read.data.displayName
      : (data.customerName ?? t('salesNote.compose.customerUnknown'))
  // A placeholder while the original invoice is still being read: the raw UUID fallback flashed
  // into every "Reverses ..." sentence before the number arrived (TEST verification 2026-10-29).
  // A failed read keeps the id, the only handle left on the invoice.
  const invoiceNumber =
    orig?.invoiceNumber ??
    data.correctionOfInvoiceNumber ??
    (originalId && original.read.status === 'loading' ? '…' : (originalId ?? '—'))
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatAmount(value, data.currency, language)
  const day = (value: string | null | undefined) => (value ? formatDate(value, language) : '—')
  const today = muscatToday()
  const perLine = lineTotals(data)
  const total = data.totals?.totalAmount ?? null

  // What the note did to its invoice. The API keeps the invoice's receivable as a whole, so the
  // invoice's overpayment is this note's refund only when this is its sole credit note (the
  // invoice's credited amount is this note's total). With several credit notes nobody knows which
  // one refunds what, so refund and applied both read "not available yet" (owner, 2026-09-29;
  // counting the whole note as applied showed 35.910 applied to an invoice that owed 28.590).
  // TODO(backend): INCOME.md 4.19, a per-note refund state and amount (and 4.2).
  const soleCredit =
    credit &&
    total !== null &&
    origOwed !== null &&
    origOwed !== undefined &&
    Math.abs(origOwed.creditedAmount - total) < 0.0005
  const overpaid =
    soleCredit && origOwed && origOwed.documentTotal !== null
      ? Math.max(
          0,
          Math.round(
            (origOwed.paidAmount + origOwed.creditedAmount - origOwed.documentTotal) * 1000,
          ) / 1000,
        )
      : 0
  // A note whose whole amount is recorded as paid back (a till refund) is settled, whichever else
  // the invoice carries: nothing is due and nothing was applied.
  const refunded =
    credit && originalPayments.read.status === 'ready'
      ? refundedOnNote(data.id, originalPayments.read.data)
      : 0
  const refundedInFull = credit && total !== null && refunded > 0 && refunded >= total - 0.0005
  const refund: number | null = !credit
    ? 0
    : refundedInFull
      ? 0
      : soleCredit && total !== null
        ? Math.min(total, overpaid)
        : null
  const applied: number | null =
    refundedInFull
      ? 0
      : credit && total !== null && refund !== null
        ? Math.round((total - refund) * 1000) / 1000
        : null
  const refunding = refund !== null && refund > 0
  // A debit note is its own receivable, linked to the invoice it corrects; the invoice's balance
  // never takes it in (D-24, owner 6 Nov 2026). What is due here is the note's own outstanding
  // amount, never the invoice's added to it.
  const nowDue = !credit && total !== null ? (owed?.outstandingAmount ?? total) : null

  const blockerKey = deliveryBlockerKey(data.deliveryBlocker)
  // Manual delivery only: a detail page never reads `peppolResponse` (api/invoices/detail.ts).
  const status: NoteListStatus = draft
    ? 'draft'
    : data.authoringState !== 'ISSUED'
      ? 'cancelled'
      : data.deliveryState !== 'SENT_MANUALLY'
        ? 'toSend'
        : credit
          ? refundedInFull
            ? 'refunded'
            : refunding
              ? 'refundDue'
              : 'applied'
          : owed?.overdue
            ? 'overdue'
            : owed?.paymentState === 'PAID'
              ? 'paid'
              : 'awaiting'
  const dueDays = owed?.dueDate ? daysBetween(today, owed.dueDate) : null
  const sign = credit ? '−' : '+'
  const toneClass = credit ? 'text-danger-700' : 'text-success-700'
  const rates = new Set(data.lines.map((line) => line.taxRate ?? 0))
  const firstLine = data.lines[0]
  // Lines at different rates have no one rate to name.
  const vatLabel =
    rates.size > 1
      ? t(`salesNote.detail.totals.vatMixed.${kindKey}`)
      : t(`salesNote.detail.totals.vat.${kindKey}`, { rate: firstLine?.taxRate ?? 0 })
  const taxCategory = firstLine
    ? `${t(`salesNote.detail.category.${Object.hasOwn(CATEGORY_WORDS, firstLine.en16931Category) ? CATEGORY_WORDS[firstLine.en16931Category] : 'standard'}`)} · ${rates.size === 1 ? `${firstLine.taxRate ?? 0}%` : t('salesNote.detail.mixedRates')}`
    : '—'
  const reasonCode = data.details?.correctionReasonCode ?? null
  const reasonKey = reasonLabelKey(kind, reasonCode, data.details?.correctionReasonDetail)
  const reasonLabel = reasonKey ? t(reasonKey) : (reasonCode ?? '—')
  const reference = data.details?.buyerReference ?? data.details?.subject ?? null

  const cancelBlockedKey: string | null = credit
    ? refunded > 0
      ? 'salesNote.detail.cancelBlocked.refunded'
      : null
    : ISSUED_DEBIT_NOTE_LOCKED

  const cancel = async () => {
    const text = reason.trim()
    if (text === '') return
    setBusy(true)
    setNotice(null)
    try {
      await cancelInvoice(id, data.version, text)
      setCancelling(false)
      setReason('')
      setNotice(t(`salesNote.detail.cancelled.${kind}`))
      note.retry()
      history.retry()
    } catch (error) {
      setNotice(refusalText(t, error, kind))
      if (error instanceof ApiError && error.code === 'INVOICE_CANCEL_HAS_PAYMENTS') {
        setCancelling(false)
        originalPayments.retry()
        receivable.retry()
      }
      // D-3 refusals are permanent for this note: another reason or a reload cannot change them, so
      // the dialog closes rather than inviting a second try. Nothing on the page changed, so no read.
      if (error instanceof ApiError && error.code && D3_CANCEL_REFUSALS.has(error.code)) {
        setCancelling(false)
      }
    } finally {
      setBusy(false)
    }
  }

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
      setNotice(t('salesNote.detail.done.reversed'))
      afterPayment()
    } catch (error) {
      setReversing(null)
      const refusal =
        error instanceof ApiError && error.code && Object.hasOwn(PAYMENT_REFUSALS, error.code) ? PAYMENT_REFUSALS[error.code] : undefined
      setNotice(refusal ? t(refusal.key) : refusalText(t, error))
      afterPayment()
    } finally {
      setBusy(false)
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
      setNotice(refusalText(t, error))
    }
  }

  const canPay =
    !credit &&
    data.authoringState === 'ISSUED' &&
    can(session, 'invoice.payment.manage') &&
    (owed?.paymentState === 'UNPAID' || owed?.paymentState === 'PARTIALLY_PAID')
  const canReverse =
    !credit && data.authoringState === 'ISSUED' && can(session, 'invoice.payment.manage')

  const menu: ActionMenuItem[] = [
    ...(originalId
      ? [
          {
            id: 'invoice',
            labelKey: 'salesNote.compose.openInvoice',
            icon: invoiceActionIcon,
            to: `/invoices/${originalId}`,
          },
        ]
      : []),
    ...(draft && can(session, 'invoice.draft')
      ? [
          {
            id: 'edit',
            labelKey: 'salesNote.detail.editDraft',
            icon: editIcon,
            to: `${base}/${data.id}/edit`,
          },
        ]
      : []),
    // A credit note's refunds decide; until that read answers Cancel is not offered. An issued
    // debit note is never cancelled here (D-26). A blocked note keeps the item and says why
    // instead of opening the confirmation the server would refuse (DA-2).
    ...(data.authoringState === 'ISSUED' &&
    can(session, 'invoice.cancel') &&
    (!credit || originalPayments.read.status === 'ready')
      ? [
          cancelBlockedKey !== null
            ? {
                id: 'cancel',
                labelKey: `salesNote.detail.cancelAction.${kind}`,
                icon: deleteIcon,
                onSelect: () => setNotice(t(cancelBlockedKey)),
              }
            : {
                id: 'cancel',
                labelKey: `salesNote.detail.cancelAction.${kind}`,
                icon: deleteIcon,
                danger: true,
                onSelect: () => setCancelling(true),
              },
        ]
      : []),
  ]

  const seller = sellerParty(
    data.seller,
    companyProfile.read.status === 'ready' ? companyProfile.read.data : null,
    t,
    language,
  )
  const buyer = buyerParty(
    data.buyer,
    customer.read.status === 'ready' ? customer.read.data : null,
    t,
    language,
  )
  const vatLine = (vat: string | null | undefined) =>
    vat ? t('invoiceDetails.vatNumber', { number: vat }) : ''
  const printable: PreviewDocument = {
    kind: t(`salesNote.detail.preview.kind.${kindKey}`),
    number: data.invoiceNumber ?? t('salesNote.draft'),
    statusLabel: status === 'toSend' ? t('salesNote.status.toSend') : undefined,
    brand: {
      name: seller?.name ?? t('salesNote.detail.preview.seller'),
      initial: seller ? initialsOf(seller.name) : t('salesNote.detail.preview.sellerInitial'),
      vat: vatLine(seller?.vat),
    },
    from: {
      name: seller?.name ?? t('salesNote.detail.preview.seller'),
      lines: seller?.addressLines ?? [],
      vat: vatLine(seller?.vat),
    },
    to: {
      name: buyer?.name ?? customerName,
      lines: buyer?.addressLines ?? [],
      vat: vatLine(buyer?.vat),
    },
    meta: [
      { label: t('salesNote.detail.preview.issueDate'), value: day(data.issueDate) },
      { label: t('salesNote.detail.preview.original'), value: invoiceNumber },
      ...(credit
        ? []
        : [{ label: t('salesNote.detail.preview.dueDate'), value: day(data.dueDate) }]),
      {
        label: t('salesNote.detail.preview.reason'),
        value: reasonLabel,
      },
    ],
    lines: data.lines.map((line) => ({
      id: String(line.lineNumber),
      description: line.description,
      unitPrice: money(line.unitPrice),
      qty: String(line.quantity),
      vat: `${line.taxRate ?? 0}%`,
      total: `${sign} ${money(perLine.get(line.lineNumber))}`,
    })),
    totals: {
      subtotal: money(data.totals?.subtotal ?? null),
      discount:
        data.totals && data.totals.totalDiscount > 0 ? money(data.totals.totalDiscount) : undefined,
      net: money(data.totals?.taxableAmount ?? null),
      vat: money(data.totals?.vatAmount ?? null),
      vatLabel,
      total: money(total),
    },
    notes: data.details?.customerVisibleNote ?? undefined,
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      {breadcrumb}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {data.invoiceNumber ?? t(`salesNote.${kindKey}.new`)}
          </h1>
          <span
            className={[
              'inline-flex h-[31px] items-center gap-2 rounded-full px-3 text-sm font-semibold',
              STATUS_STYLES[status].bg,
              STATUS_STYLES[status].text,
            ].join(' ')}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {t(`salesNote.status.${status}`)}
          </span>
          {/* A till refund's credit note, as on the invoice header; absent from older servers. */}
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
            {menu.length > 0 ? (
              <ActionMenu items={menu} label={t('salesNote.compose.more')} variant="bordered" />
            ) : null}
            {draft ? (
              <>
                {can(session, 'invoice.draft') && !editWaitsOnApproval(salesApproval.approval) ? (
                  <Link to={`${base}/${data.id}/edit`} className={GHOST_BUTTON}>
                    <img src={editIcon} alt="" className="size-5" />
                    {t('salesNote.detail.editDraft')}
                  </Link>
                ) : null}
                {can(session, 'invoice.issue') &&
                mayIssue &&
                !issueWaitsOnApproval(salesApproval.approval) ? (
                  <Link to={`${base}/${data.id}/edit`} className={PRIMARY_BUTTON}>
                    {t(`salesNote.${kindKey}.issue`)}
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <button type="button" onClick={preview.print} className={GHOST_BUTTON}>
                  <img src={downloadIcon} alt="" className="size-5" />
                  {t('salesNote.detail.download')}
                </button>
                {!credit && (status === 'awaiting' || status === 'overdue') ? (
                  <a href="#reminders" className={GHOST_BUTTON}>
                    {t('salesNote.detail.sendReminder')}
                  </a>
                ) : null}
                {canPay ? (
                  <button type="button" onClick={() => setPaying(true)} className={PRIMARY_BUTTON}>
                    <img src={cardIcon} alt="" className="size-5 brightness-0 invert" />
                    {t('salesNote.detail.recordPayment')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
          <span className="font-medium text-text-quaternary">
            {t(`salesNote.compose.${credit ? 'reversing' : 'adjusting'}`)}
          </span>
          {originalId ? (
            <Link
              to={`/invoices/${originalId}`}
              className="font-semibold text-text-primary hover:text-primary-700"
            >
              {invoiceNumber}
            </Link>
          ) : (
            <span className="font-semibold text-text-primary">—</span>
          )}
          <span className="mx-0.5 size-1 rounded-full bg-text-quaternary" />
          <span className="font-medium text-text-quaternary">{t('salesNote.compose.for')}</span>
          <span className="font-semibold text-text-primary">{customerName}</span>
        </p>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {draft ? <Notice body={t('salesNote.detail.draftNotice')} /> : null}
      {draft ? (
        <DraftApprovalCard
          invoiceId={data.id}
          type={data.type}
          approval={salesApproval.approval}
          onRefused={salesApproval.retry}
          onChanged={() => {
            salesApproval.retry()
            note.retry()
            history.retry()
          }}
        />
      ) : null}

      {/* The printed document sits beside the amount and the details only; the rest is full width, as designed. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">
          {/* Amount */}
          <section className="rounded-sm bg-surface-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t(`salesNote.detail.amountTitle.${kindKey}`)}
                </h2>
                <OmAmount
                  size="lg"
                  prefix={sign}
                  amount={money(total)}
                  amountClassName={`text-[40px] font-semibold leading-none ${toneClass} tabular-nums`}
                  className="mt-3"
                />
              </div>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                  credit ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700',
                ].join(' ')}
              >
                <img src={credit ? reducesIcon : increasesIcon} alt="" className="size-4" />
                {t(`salesNote.amount.${credit ? 'reduces' : 'increases'}`)}
              </span>
            </div>
            <div className="h-px w-full bg-border-subtle" />
            <div className="grid gap-4 p-4 sm:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-[#727579]">
                  {t(`salesNote.detail.documentTotal.${kind}`)}
                </p>
                <OmAmount
                  size="sm"
                  amount={money(total)}
                  className="mt-1"
                  amountClassName={`text-xl font-semibold ${toneClass}`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-[#727579]">
                  {t(credit ? 'salesNote.detail.appliedTo' : 'salesNote.detail.linkedTo', {
                    invoice: invoiceNumber,
                  })}
                </p>
                {credit && applied === null ? (
                  // TODO(backend): INCOME.md 4.19, the note's own applied amount.
                  <p className="mt-1 text-xl font-semibold text-text-primary">
                    {t('salesNote.detail.notAvailableYet')}
                  </p>
                ) : (
                  <OmAmount
                    size="sm"
                    amount={money(credit ? applied : total)}
                    className="mt-1"
                    amountClassName="text-xl font-semibold text-text-primary"
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-[#727579]">
                  {t(credit ? 'salesNote.detail.refundDue' : 'salesNote.detail.nowDue')}
                </p>
                {credit && refund === null ? (
                  // TODO(backend): INCOME.md 4.19, the note's own refund amount.
                  <p className="mt-1 text-xl font-semibold text-text-primary">
                    {t('salesNote.detail.notAvailableYet')}
                  </p>
                ) : (
                  <OmAmount
                    size="sm"
                    amount={money(credit ? refund : nowDue)}
                    className="mt-1"
                    amountClassName={`text-xl font-semibold ${credit && refunding ? 'text-success-700' : 'text-text-primary'}`}
                  />
                )}
              </div>
            </div>
            {credit && refunding ? (
              <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-success-100 px-4 py-3">
                <div>
                  <p className="text-base font-medium text-text-primary">
                    {t('salesNote.detail.refundBanner', { customer: customerName })}
                  </p>
                  <p className="text-sm font-medium text-text-tertiary">
                    {t('salesNote.detail.refundBannerHint', { invoice: invoiceNumber })}
                  </p>
                </div>
                <OmAmount
                  size="sm"
                  amount={money(refund)}
                  amountClassName="text-xl font-semibold text-text-primary"
                />
              </div>
            ) : null}
            {!credit && owed && (status === 'awaiting' || status === 'overdue') ? (
              <div
                className={[
                  'mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm px-4 py-3',
                  status === 'overdue' ? 'bg-danger-100' : 'bg-warning-100',
                ].join(' ')}
              >
                <div>
                  <p className="text-base font-medium text-text-primary">
                    {t('salesNote.detail.awaitingBanner', { customer: customerName })}
                  </p>
                  <p className="text-sm font-medium text-text-tertiary">
                    {t('salesNote.detail.awaitingHint', {
                      invoice: invoiceNumber,
                      date: day(owed.dueDate),
                      when:
                        dueDays === null
                          ? ''
                          : dueDays > 0
                            ? t('salesNote.detail.dueIn', { count: dueDays })
                            : dueDays === 0
                              ? t('salesNote.detail.dueToday')
                              : t('salesNote.detail.dueLate', { count: -dueDays }),
                    })}
                  </p>
                </div>
                <OmAmount
                  size="sm"
                  amount={money(nowDue)}
                  amountClassName="text-xl font-semibold text-text-primary"
                />
              </div>
            ) : null}
            {!credit && status === 'paid' ? (
              <div className="mx-4 mb-4 rounded-sm bg-success-100 px-4 py-3">
                <p className="text-base font-medium text-text-primary">
                  {t('salesNote.detail.paidBanner', { customer: customerName })}
                </p>
              </div>
            ) : null}
            {status === 'toSend' ? (
              <div className="mx-4 mb-4 flex items-start gap-2 rounded-sm bg-warning-100 px-4 py-3 text-sm font-medium text-text-secondary">
                <img src={warningIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-semibold">{t('salesNote.detail.notSent')}</span>{' '}
                  {/* "Ready to deliver over Peppol" is untrue while the server reports a blocker, so
                      the blocker takes the hint's place, in the same span (W2-D1, as IMPL2-D1). */}
                  {blockerKey
                    ? t(
                        blockerKey === 'other'
                          ? `salesNote.detail.blocked.other.${kindKey}`
                          : `salesNote.detail.blocked.${blockerKey}`,
                      )
                    : t(`salesNote.detail.notSentHint.${kindKey}`, { customer: customerName })}
                </span>
              </div>
            ) : null}
          </section>

          {/* Details */}
          <SectionCard
            title={t('salesNote.detail.details')}
            action={
              can(session, 'customer.read') && customer.read.status === 'ready' ? (
                <Link
                  to={`/customers/${data.customerId}/edit`}
                  className="inline-flex items-center gap-0.5 text-base font-semibold text-primary-800"
                >
                  {t('salesNote.detail.viewCustomer')}
                  <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
                </Link>
              ) : undefined
            }
          >
            {originalId ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-tab-bar px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-medium text-text-primary">
                      {t(credit ? 'salesNote.detail.reverses' : 'salesNote.detail.adjusts', {
                        invoice: invoiceNumber,
                      })}
                    </span>
                    {!draft ? (
                      <span
                        className={[
                          'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                          credit
                            ? 'bg-success-100 text-success-700'
                            : 'bg-warning-100 text-[#6d5a39]',
                        ].join(' ')}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {t(
                          credit
                            ? refunding
                              ? 'salesNote.detail.settled'
                              : 'salesNote.detail.balanceReduced'
                            : 'salesNote.detail.balanceIncreased',
                        )}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-text-tertiary">
                    {orig
                      ? withRial(
                          t('salesNote.detail.originalMeta', {
                            amount: money(
                              origOwed?.documentTotal ?? orig.totals?.totalAmount ?? null,
                            ),
                            date: day(orig.issueDate),
                          }),
                        )
                      : '…'}
                    {origOwed && origOwed.paidAmount > 0
                      ? withRial(
                          ` · ${t('salesNote.detail.originalPaid', { amount: money(origOwed.paidAmount) })}`,
                        )
                      : ''}
                  </p>
                </div>
                <Link
                  to={`/invoices/${originalId}`}
                  className="inline-flex h-10 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary"
                >
                  {t('salesNote.detail.openInvoice')}
                </Link>
              </div>
            ) : null}
            {customer.read.status === 'ready' ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={customerLogo} alt="" className="size-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {customer.read.data.displayName}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {/* INCOME.md 4.14: the participant id beside the VAT number, when the record has one. */}
                      {[
                        customer.read.data.profile.details?.vatRegistrationNumber ??
                          t('salesNote.detail.noVat'),
                        participantIdText(customer.read.data.profile.details?.peppolParticipantId),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                {customer.read.data.peppolDelivery === 'ACTIVE' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary-300 bg-white px-2.5 py-1 text-xs font-semibold text-primary-800">
                    <img src={peppolCheckIcon} alt="" className="size-3.5" />
                    {t('salesNote.detail.onPeppol')}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-3">
              <MetaField
                label={t(`salesNote.detail.fields.number.${kindKey}`)}
                value={data.invoiceNumber ?? t('salesNote.compose.numberAtIssue')}
              />
              <MetaField
                label={t('salesNote.detail.fields.issueDate')}
                value={day(data.issueDate)}
              />
              {credit ? (
                <MetaField
                  label={t('salesNote.detail.fields.currency')}
                  value={t(`salesNote.compose.currencyName.${data.currency}`, {
                    defaultValue: data.currency,
                  })}
                />
              ) : (
                <MetaField
                  label={t('salesNote.detail.fields.paymentDue')}
                  value={day(data.dueDate)}
                />
              )}
              <MetaField
                label={t('salesNote.detail.fields.concerning')}
                value={
                  originalId ? (
                    <Link
                      to={`/invoices/${originalId}`}
                      className="font-semibold text-primary-700 hover:underline"
                    >
                      {invoiceNumber}
                    </Link>
                  ) : (
                    '—'
                  )
                }
              />
              <MetaField
                label={t('salesNote.detail.fields.po')}
                value={data.details?.purchaseOrderReference ?? '—'}
              />
              <MetaField label={t('salesNote.detail.fields.tax')} value={taxCategory} />
            </div>
            <div className="mt-5">
              <p className="text-xs font-medium leading-[1.2] text-[#727579]">
                {t(`salesNote.detail.fields.reasonFor.${kindKey}`)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <span
                  className={[
                    'inline-flex h-[31px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
                    credit ? 'bg-warning-100 text-[#6d5a39]' : 'bg-warning-100 text-[#6d5a39]',
                  ].join(' ')}
                >
                  <img src={credit ? returnIcon : increasesIcon} alt="" className="size-4" />
                  {reasonLabel}
                </span>
                {reference ? (
                  <span className="text-sm font-medium text-text-primary">{reference}</span>
                ) : null}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          {/* Items */}
          <SectionCard title={t('salesNote.detail.items')}>
            <RowsView>
              <table className="w-full min-w-[720px] border-collapse text-start">
                <thead>
                  <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                    <th className="py-2 text-start font-semibold">
                      {t('salesNote.detail.col.description')}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t(
                        credit
                          ? 'salesNote.detail.col.unitPrice'
                          : 'salesNote.detail.col.difference',
                      )}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t('salesNote.detail.col.vat')}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t('salesNote.detail.col.qty')}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t('salesNote.detail.col.unit')}
                    </th>
                    <th className="py-2 text-start font-semibold">
                      {t('salesNote.detail.col.disc')}
                    </th>
                    <th className="py-2 text-end font-semibold">
                      {t('salesNote.detail.col.total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => {
                    const origin = orig?.lines.find(
                      (candidate) =>
                        candidate.description === line.description &&
                        (candidate.productId ?? null) === (line.productId ?? null),
                    )
                    return (
                      <tr key={line.lineNumber} className="border-b border-surface-background">
                        <td className="py-3 pe-4">
                          <p className="text-base font-medium text-text-primary">
                            {line.description}
                          </p>
                          <p className="text-sm font-medium text-text-quaternary">
                            {origin
                              ? t('salesNote.detail.lineOrigin', {
                                  n: origin.lineNumber,
                                  invoice: invoiceNumber,
                                  price: money(origin.unitPrice),
                                  charged: money(
                                    !credit ? origin.unitPrice + line.unitPrice : line.unitPrice,
                                  ),
                                })
                              : t('salesNote.detail.lineAdded')}
                          </p>
                        </td>
                        <td className="py-3 text-sm font-medium text-text-secondary tabular-nums">
                          {money(line.unitPrice)}
                        </td>
                        <td className="py-3 text-sm font-medium text-text-secondary">
                          {line.taxRate === null ? line.taxCategoryCode : `${line.taxRate}%`}
                        </td>
                        <td className="py-3 text-base font-medium text-text-secondary">
                          {line.quantity}
                        </td>
                        <td className="py-3 text-base font-medium text-text-secondary">
                          {unitLabel(line.unitCode, t)}
                        </td>
                        <td className="py-3 text-sm font-medium text-text-secondary">
                          {line.discountValue === 0
                            ? '—'
                            : line.discountType === 'PERCENTAGE'
                              ? `${line.discountValue}%`
                              : money(line.discountValue)}
                        </td>
                        <td className="py-3 text-end text-xl font-semibold text-text-primary/90 tabular-nums">
                          {money(perLine.get(line.lineNumber))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </RowsView>
            {data.totals ? (
              <div className="mt-4 ms-auto flex w-full max-w-[360px] flex-col gap-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-text-tertiary">
                    {t(`salesNote.detail.totals.net.${kindKey}`)}
                  </span>
                  <OmAmount
                    size="xs"
                    prefix={sign}
                    amount={money(data.totals.taxableAmount)}
                    amountClassName={`text-base font-semibold ${toneClass}`}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-text-tertiary">{vatLabel}</span>
                  <OmAmount
                    size="xs"
                    prefix={sign}
                    amount={money(data.totals.vatAmount)}
                    amountClassName={`text-base font-semibold ${toneClass}`}
                  />
                </div>
                <div className="my-1 h-px w-full bg-border-subtle" />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-text-primary">
                    {t(`salesNote.detail.totals.total.${kindKey}`)}
                  </span>
                  <OmAmount
                    size="sm"
                    prefix={sign}
                    amount={money(data.totals.totalAmount)}
                    amountClassName={`text-xl font-semibold ${toneClass}`}
                  />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium text-text-quaternary">
                {t('salesNote.detail.totalsAtIssue')}
              </p>
            )}
          </SectionCard>

          {/* Notes & attachments */}
          <SectionCard title={t('salesNote.detail.notesTitle')}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">
                  {t('salesNote.detail.noteCustomer')}{' '}
                  <span className="text-text-quaternary">
                    {t(`salesNote.detail.onTheNote.${kindKey}`)}
                  </span>
                </p>
                <p className="min-h-[68px] rounded-sm border border-border-subtle px-4 py-3 text-sm font-medium leading-[1.5] text-text-secondary">
                  {data.details?.customerVisibleNote ?? '—'}
                </p>
              </div>
              {can(session, 'invoice.internal-note.read') ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-text-primary">
                    {t('salesNote.detail.noteInternal')}{' '}
                    <span className="text-text-quaternary">{t('salesNote.detail.private')}</span>
                  </p>
                  <div className="min-h-[68px] rounded-sm border border-border-subtle px-4 py-3 text-sm font-medium leading-[1.5] text-text-secondary">
                    {internalNote.read.status === 'ready'
                      ? (internalNote.read.data.internalNote ?? '—')
                      : '…'}
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-4 mb-2 text-sm font-medium text-text-primary">
              {t('salesNote.detail.supportingDocs')}
            </p>
            {attachments.read.status === 'ready' && attachments.read.data.length > 0 ? (
              <ul className="mb-3 flex flex-col gap-3">
                {attachments.read.data.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-text-primary">
                        {file.filename}
                      </p>
                      <p className="truncate text-sm font-medium text-text-quaternary">
                        {formatFileSize(file.byteSize)} · {formatInstant(file.attachedAt, language)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => download(file)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-800"
                    >
                      <img src={downloadIcon} alt="" className="size-5" />
                      {t('salesNote.detail.downloadFile')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* TODO(backend): attachment upload on an issued note (2.3); the frame draws the dropzone on every note. */}
            <FileDropzone
              accept=".pdf,.jpg,.jpeg,.png,.xlsx"
              multiple
              onFiles={(picked) => setPending((current) => [...current, ...picked])}
              className="block w-full"
            >
              {({ dragging }) => (
                <div
                  className={[
                    'flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed bg-surface-tab-bar px-4 py-6 text-center',
                    dragging ? 'border-primary-700' : 'border-primary-300',
                  ].join(' ')}
                >
                  <img src={uploadIcon} alt="" className="size-6" />
                  <span className="text-base font-medium text-text-primary">
                    {t('salesNote.compose.dropFiles')}
                  </span>
                  <span className="text-sm font-medium text-text-quaternary">
                    {t('salesNote.compose.dropHint')}
                  </span>
                </div>
              )}
            </FileDropzone>
            {pending.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {pending.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary"
                  >
                    <span className="truncate">
                      {file.name}
                      <span className="ms-2 text-xs text-text-quaternary">
                        {t('salesNote.detail.pendingUpload')}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                      className="text-xs font-semibold text-text-quaternary hover:text-danger-700"
                    >
                      {t('salesNote.compose.removeFile')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </SectionCard>

          {!draft ? (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {/* Refunds (credit) / Payments (debit) */}
              <SectionCard
                title={t(credit ? 'salesNote.detail.refunds' : 'salesNote.detail.payments')}
                action={
                  credit ? (
                    <button
                      type="button"
                      onClick={() => setNotice(t('salesNote.detail.refundNotWired'))}
                      className="inline-flex items-center gap-1 text-base font-semibold text-primary-800"
                    >
                      + {t('salesNote.detail.recordRefund')}
                    </button>
                  ) : canPay ? (
                    <button
                      type="button"
                      onClick={() => setPaying(true)}
                      className="inline-flex items-center gap-1 text-base font-semibold text-primary-800"
                    >
                      + {t('salesNote.detail.recordPayment')}
                    </button>
                  ) : undefined
                }
              >
                {credit ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-neutral-25">
                      <img src={cardIcon} alt="" className="size-6" />
                    </span>
                    {/* TODO(backend): INCOME.md 4.19, the note's refund state and amount. */}
                    {refund === null ? (
                      <>
                        <p className="text-xl font-medium text-text-primary">
                          {t('salesNote.detail.notAvailableYet')}
                        </p>
                        <p className="max-w-[360px] text-sm font-medium leading-[1.5] text-text-tertiary">
                          {t('salesNote.detail.refundNotWired')}
                        </p>
                      </>
                    ) : (
                      <>
                        <OmAmount
                          size="sm"
                          amount={`${money(refund)} ${t(refunding ? 'salesNote.detail.refundPending' : 'salesNote.detail.refundNone')}`}
                          amountClassName="text-xl font-medium text-text-primary"
                        />
                        <p className="max-w-[360px] text-sm font-medium leading-[1.5] text-text-tertiary">
                          {t(
                            refunding
                              ? 'salesNote.detail.refundPendingHint'
                              : 'salesNote.detail.refundNoneHint',
                            { invoice: invoiceNumber },
                          )}
                        </p>
                      </>
                    )}
                    {/* TODO(backend): a refund endpoint for credit notes; the button is drawn as designed and says so when pressed. */}
                    {refunding ? (
                      <button
                        type="button"
                        onClick={() => setNotice(t('salesNote.detail.refundNotWired'))}
                        className={PRIMARY_BUTTON}
                      >
                        {t('salesNote.detail.recordRefund')}
                      </button>
                    ) : null}
                  </div>
                ) : payments.read.status === 'ready' &&
                  paymentRows(payments.read.data).length > 0 ? (
                  <ul className="flex flex-col gap-3">
                    {paymentRows(payments.read.data).map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <p
                            className={[
                              'truncate text-base font-medium',
                              row.reversed
                                ? 'text-text-quaternary line-through'
                                : 'text-text-primary',
                            ].join(' ')}
                          >
                            {money(row.amount)}
                          </p>
                          <p className="truncate text-sm font-medium text-text-quaternary">
                            {[
                              day(row.paymentDate),
                              row.methodCode
                                ? t(`invoiceDetails.pay.means.${row.methodCode}`, {
                                    defaultValue: row.methodCode,
                                  })
                                : null,
                              row.reference,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        {row.reversed ? (
                          <span className="shrink-0 rounded-full bg-neutral-25 px-3 py-1 text-xs font-semibold text-text-quaternary">
                            {t('salesNote.detail.reversed')}
                          </span>
                        ) : canReverse ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReversing({ id: row.id, amount: row.amount, key: newPaymentKey() })
                            }
                            className="shrink-0 text-sm font-semibold text-text-quaternary hover:text-danger-700"
                          >
                            {t('salesNote.detail.reverse')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-warning-100">
                      <img src={clockIcon} alt="" className="size-6" />
                    </span>
                    <OmAmount
                      size="sm"
                      amount={`${money(owed?.outstandingAmount ?? total)} ${t('salesNote.detail.awaitingPayment')}`}
                      amountClassName="text-xl font-medium text-text-primary"
                    />
                    <p className="max-w-[360px] text-sm font-medium leading-[1.5] text-text-tertiary">
                      {withRial(
                        t('salesNote.detail.awaitingPaymentHint', {
                          invoice: invoiceNumber,
                          customer: customerName,
                          amount: money(nowDue),
                          date: day(owed?.dueDate ?? data.dueDate),
                        }),
                      )}
                    </p>
                    {canPay ? (
                      <button
                        type="button"
                        onClick={() => setPaying(true)}
                        className={PRIMARY_BUTTON}
                      >
                        {t('salesNote.detail.recordPayment')}
                      </button>
                    ) : null}
                  </div>
                )}
              </SectionCard>

              {/* Activity */}
              <SectionCard title={t('salesNote.detail.activity')}>
                {history.read.status === 'ready' ? (
                  <ol className="flex flex-col">
                    {timelineOf(history.read.data, session?.userId ?? null).map(
                      (event, index, all) => (
                        <li key={`${event.key}-${event.at}-${index}`} className="flex gap-3">
                          <div className="flex w-8 flex-col items-center">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-success-700">
                              <img
                                src={timelineCheckIcon}
                                alt=""
                                className="size-3.5 brightness-0 invert"
                              />
                            </span>
                            {index < all.length - 1 ? (
                              <span className="w-px flex-1 bg-border-subtle" />
                            ) : null}
                          </div>
                          <div className="pb-5">
                            <p className="text-base font-medium text-text-primary">
                              {t(event.key)}
                              {event.byYou ? (
                                <span className="font-medium text-text-quaternary">
                                  {' '}
                                  · {t('salesNote.detail.byYou')}
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-sm font-medium text-text-quaternary">
                              {[formatInstant(event.at, language), event.outcome]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </li>
                      ),
                    )}
                    {history.read.data.truncated ? (
                      <li className="text-sm font-medium text-text-quaternary">
                        {t('salesNote.detail.truncated', { count: history.read.data.limit })}
                      </li>
                    ) : null}
                  </ol>
                ) : (
                  <p className="text-sm font-medium text-text-quaternary">…</p>
                )}
              </SectionCard>
            </div>
          ) : null}

          {/* A debit note is chased like an invoice; a credit note is not owed to us, and a
              cancelled note is owed by nobody (its preview has no amount to put in a message). */}
          {!draft && !credit && status !== 'cancelled' ? (
            <div id="reminders">
              <InvoiceRemindersCard
                invoiceId={id}
                dueDate={data.dueDate}
                noteType={kind === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : undefined}
              />
            </div>
          ) : null}
        </div>

        {/* The document as it prints */}
        <aside className="flex flex-col self-stretch overflow-hidden rounded-sm bg-surface-card xl:col-start-2 xl:row-start-1">
          <div className="flex items-center justify-between border-b border-border-subtle px-3.5 py-4">
            <div className="flex items-center gap-1.5">
              <img src={pdfIcon} alt="" className="size-6" />
              <p className="text-sm font-medium text-text-secondary">
                {t(`salesNote.detail.pdfTitle.${kindKey}`)}
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={t('salesNote.detail.zoomOut')}
                  disabled={!preview.canZoomOut}
                  onClick={preview.zoomOut}
                  className="disabled:opacity-40"
                >
                  <img src={zoomOutIcon} alt="" className="size-6" />
                </button>
                <span className="min-w-[38px] text-center text-xs font-medium text-text-tertiary tabular-nums">
                  {preview.zoom}%
                </span>
                <button
                  type="button"
                  aria-label={t('salesNote.detail.zoomIn')}
                  disabled={!preview.canZoomIn}
                  onClick={preview.zoomIn}
                  className="disabled:opacity-40"
                >
                  <img src={zoomInIcon} alt="" className="size-6" />
                </button>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label={t('salesNote.detail.download')}
                  onClick={preview.print}
                >
                  <img src={downloadIcon} alt="" className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label={t('salesNote.detail.print')}
                  onClick={preview.print}
                >
                  <img src={printIcon} alt="" className="size-6" />
                </button>
                <button
                  type="button"
                  aria-label={t('salesNote.detail.fullscreen')}
                  aria-pressed={preview.fullscreen}
                  onClick={preview.openFullscreen}
                >
                  <img src={fullscreenIcon} alt="" className="size-6" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-start justify-center overflow-auto bg-surface-tab-bar p-4">
            <DocumentPreview
              document={printable}
              labels={previewLabels(t)}
              zoom={preview.zoom / 100}
            />
          </div>
          {preview.fullscreen ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t(`salesNote.detail.pdfTitle.${kindKey}`)}
              className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/70 p-6"
              onClick={preview.closeFullscreen}
            >
              <DocumentPreview document={printable} labels={previewLabels(t)} zoom={1.6} />
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

      {paying && owed ? (
        <RecordPaymentModal
          invoiceId={data.id}
          invoiceNumber={data.invoiceNumber}
          currency={data.currency}
          outstanding={owed.outstandingAmount}
          issueDate={data.issueDate}
          today={today}
          onBalanceChanged={() => {
            balanceStale.current = true
          }}
          onClose={() => {
            setPaying(false)
            if (balanceStale.current) {
              balanceStale.current = false
              afterPayment()
            }
          }}
          onRecorded={() => {
            setPaying(false)
            setNotice(t('salesNote.detail.done.recorded'))
            afterPayment()
          }}
        />
      ) : null}

      <Modal
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title={t('salesNote.detail.reverseTitle')}
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
              {t('salesNote.detail.reverseConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('salesNote.detail.reverseBody', { amount: reversing ? money(reversing.amount) : '' })}
        </p>
      </Modal>

      <Modal
        open={cancelling}
        onClose={() => {
          setCancelling(false)
          setReason('')
        }}
        title={t(`salesNote.detail.cancelTitle.${kind}`)}
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
              {t(`salesNote.detail.cancelConfirm.${kind}`)}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t(`salesNote.detail.cancelBody.${kind}`)}
        </p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">
            {t('salesNote.detail.cancelReason')}
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

function previewLabels(t: Translate) {
  return {
    from: t('salesNote.detail.preview.from'),
    billTo: t('salesNote.detail.preview.to'),
    description: t('salesNote.detail.col.description'),
    price: t('salesNote.detail.col.unitPrice'),
    qty: t('salesNote.detail.col.qty'),
    vat: t('salesNote.detail.col.vat'),
    total: t('salesNote.detail.col.total'),
    subtotal: t('salesNote.detail.preview.subtotal'),
    discount: t('salesNote.detail.preview.discount'),
    net: t('salesNote.detail.preview.net'),
    totalDue: t('salesNote.detail.preview.total'),
    qrAlt: t('salesNote.detail.preview.qrAlt'),
  }
}

const D3_CANCEL_REFUSALS = new Set(['CREDIT_NOTE_CANCEL_TILL_REFUND', 'CREDIT_NOTE_CANCEL_HAS_STOCK_RETURN'])

function refusalText(t: Translate, error: unknown, kind?: NoteKind): string {
  const blocked = kind ? noteCancelRefusalKey(error, kind) : null
  if (blocked) return t(blocked)
  if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION')
    return t('salesNote.detail.refused.stale')
  if (error instanceof ApiError && error.code === 'INVOICE_NOT_CANCELLABLE')
    return t('salesNote.detail.refused.notCancellable')
  if (error instanceof ApiError && error.code === 'DELIVERED_INVOICE_CANCELLATION_NOT_APPROVED')
    return t('salesNote.detail.refused.delivered')
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

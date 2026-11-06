import type {
  InvoiceAttachmentDto,
  InvoiceDetailDto,
  InvoiceHistoryDto,
  InvoicePaymentDto,
  InvoiceReceivableDto,
} from '../api/invoices/detail'
import type { NoteKind } from '../api/invoices/drafts'
import { ApiError } from '../api'
import { calculateInvoice, projectInvoice } from './invoiceMath'
import { minorUnitsOf } from './format'

/**
 * One authored invoice, opened, written only from what the API holds.
 *
 * Three things the design shows are absent from every response and are therefore absent here
 * (decisions of 2026-09-16): a PDF of the document, any Peppol or Tax Authority delivery event,
 * and the name of whoever acted. The audit trail names an actor id and nothing else, so the
 * timeline can say "by you" and otherwise stays quiet rather than inventing a person.
 */

export type Note = { key: string; values?: Record<string, string | number> }

/** What the reader is looking at: a draft, or a document that has been issued. */
export function isDraft(invoice: InvoiceDetailDto): boolean {
  return invoice.authoringState === 'DRAFT'
}

/**
 * What is refunded on a credit note: its REFUND entries on the invoice it credits, less any
 * reversed. A refunded note cannot be cancelled: cancelling one left the refund on the invoice
 * pointing at a cancelled note and the VAT restored (DA-2, local E2E 2026-10-29); the server now
 * refuses it with INVOICE_CANCEL_HAS_PAYMENTS.
 */
export function refundedOnNote(noteId: string, invoicePayments: readonly InvoicePaymentDto[]): number {
  const reversed = new Set(
    invoicePayments
      .filter((entry) => entry.entryType === 'REVERSAL' && entry.reversalOfPaymentId)
      .map((entry) => entry.reversalOfPaymentId!),
  )
  return invoicePayments
    .filter((entry) => entry.entryType === 'REFUND' && entry.creditNoteId === noteId && !reversed.has(entry.id))
    .reduce((sum, entry) => sum + entry.amount, 0)
}

/** Why an issued document may not be cancelled, or `unknown` while the page cannot yet tell. */
export type CancelBlock = 'corrections' | 'payments' | 'unknown' | null

/**
 * Cancelling an invoice that a credit note or a payment already settles left the note counted in
 * the VAT report without its invoice and the statement with an orphan credit (A-0, TEST
 * 2026-10-29); the server now refuses it with INVOICE_CANCEL_HAS_CORRECTIONS and
 * INVOICE_CANCEL_HAS_PAYMENTS. The page asks the same question of what it already reads, so no
 * request is added: the receivable's credited and paid figures (net of reversals, as the server
 * computes them) and the notes it lists under the invoice. An issued note counts even before the
 * receivable reflects it (a debit note does not move `creditedAmount`). Until both reads answer
 * the answer is `unknown` and Cancel is not offered: the server would refuse anyway, and an offer
 * withdrawn a moment later is worse than one that appears late.
 *
 * `notes` is `null` for a document the notes list is not read for (a credit or debit note).
 */
export function cancelBlockOf(
  receivable: { status: 'loading' } | { status: 'failed' } | { status: 'ready'; data: InvoiceReceivableDto },
  notes:
    | { status: 'loading' }
    | { status: 'failed' }
    | { status: 'ready'; data: { items: readonly { authoringState: string }[] } }
    | null,
): CancelBlock {
  if (receivable.status !== 'ready') return 'unknown'
  if (notes !== null && notes.status !== 'ready') return 'unknown'
  const issuedNote = notes?.status === 'ready' && notes.data.items.some((note) => note.authoringState === 'ISSUED')
  if (receivable.data.creditedAmount > 0 || issuedNote) return 'corrections'
  if (receivable.data.paidAmount > 0) return 'payments'
  return null
}

/**
 * The status pill. Authoring state answers for everything except an issued invoice, where what
 * matters is whether it has been paid — which only the receivable read knows.
 */
export function statusOf(
  invoice: InvoiceDetailDto,
  receivable: InvoiceReceivableDto | null,
  today?: string,
): {
  key: string
  values?: Record<string, number>
  tone: 'draft' | 'issued' | 'cancelled' | 'awaiting' | 'partial' | 'overdue' | 'paid'
} {
  if (invoice.authoringState === 'DRAFT') return { key: 'invoicesPage.authoring.draft', tone: 'draft' }
  if (invoice.authoringState === 'CANCELLED') return { key: 'invoicesPage.authoring.cancelled', tone: 'cancelled' }
  if (invoice.authoringState === 'DISCARDED') return { key: 'invoicesPage.authoring.discarded', tone: 'cancelled' }
  if (!receivable || receivable.paymentState === 'NOT_APPLICABLE') {
    return { key: 'invoicesPage.authoring.issued', tone: 'issued' }
  }
  if (receivable.overdue) {
    // "Overdue · 7 days": the same count as the balance line's "7 days overdue" (`dueNote`).
    const note = today ? dueNote(receivable, today) : null
    return note?.key === 'invoiceDetails.due.late'
      ? { key: 'invoicesPage.payment.overdue', values: { count: Number(note.values?.count) }, tone: 'overdue' }
      : { key: 'invoicesPage.payment.overdue', tone: 'overdue' }
  }
  if (receivable.paymentState === 'PAID') {
    // Settled by credit notes with no money kept (a till sale refunded in full): not "Paid".
    return receivable.creditedAmount > 0 && receivable.paidAmount < 0.0005
      ? { key: 'invoicesPage.payment.credited', tone: 'paid' }
      : { key: 'invoicesPage.payment.paid', tone: 'paid' }
  }
  if (receivable.paymentState === 'PARTIALLY_PAID') return { key: 'invoicesPage.payment.partial', tone: 'partial' }
  return { key: 'invoicesPage.payment.awaiting', tone: 'awaiting' }
}

/**
 * What a line adds up to. The API sends the parts (quantity, price, discount) and no line total,
 * so it is computed here with the engine the composer uses, at the currency's scale.
 */
export function lineTotals(invoice: InvoiceDetailDto): Map<number, number> {
  const scale = minorUnitsOf(invoice.currency)
  const amounts = calculateInvoice(
    invoice.lines.map((line) => ({
      id: String(line.lineNumber),
      lineNumber: line.lineNumber,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      vatRate: String(line.taxRate ?? 0),
      discountType: line.discountType,
      discountValue: String(line.discountValue),
    })),
    invoice.headerDiscount?.type ?? 'PERCENTAGE',
    String(invoice.headerDiscount?.value ?? 0),
  )
  const projected = projectInvoice(amounts, scale)
  const totals = new Map<number, number>()
  invoice.lines.forEach((line, index) => {
    const value = projected.lines[index]
    if (value) totals.set(line.lineNumber, Number(value.afterLineDiscount) / 10 ** scale)
  })
  return totals
}

export type PaymentRow = {
  id: string
  amount: number
  currency: string
  methodCode: string | null
  reference: string | null
  paymentDate: string | null
  occurredAt: string
  /** A reversal of this payment exists, so it no longer counts towards what was paid. */
  reversed: boolean
}

/**
 * The payments as a person reads them: what was taken, and which of those was undone. Nothing is
 * ever deleted — a reversal is its own row pointing at the payment it undoes — so the reversals
 * are folded into the payments they cancel rather than listed as further payments.
 */
export function paymentRows(payments: readonly InvoicePaymentDto[]): PaymentRow[] {
  const reversed = new Set(
    payments.filter((entry) => entry.entryType === 'REVERSAL' && entry.reversalOfPaymentId).map((entry) => entry.reversalOfPaymentId!),
  )
  return payments
    .filter((entry) => entry.entryType === 'PAYMENT')
    .map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      currency: entry.currency,
      methodCode: entry.methodCode,
      reference: entry.paymentReference,
      paymentDate: entry.paymentDate,
      occurredAt: entry.occurredAt,
      reversed: reversed.has(entry.id),
    }))
}

export type TimelineEntry = { key: string; at: string; byYou: boolean; outcome: string | null }

/**
 * The audit trail as a timeline. Every entry is an event the server recorded. The names are the
 * values the events table's CHECK constraint allows; a type this build does not know is still
 * listed, as "Recorded", rather than dropped, because an unexplained gap in an audit trail is
 * worse than a vague word.
 */
const KNOWN_EVENTS = new Set([
  'DRAFT_CREATED',
  'DRAFT_UPDATED',
  'DRAFT_DISCARDED',
  'ISSUED',
  'CREDIT_NOTE_ISSUED',
  'DEBIT_NOTE_ISSUED',
  'CANCELLED',
  'PAYMENT_RECORDED',
  'PAYMENT_REVERSED',
  'INTERNAL_NOTE_VIEWED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REJECTED',
  'ATTACHMENT_REMOVED',
  'MARKED_SENT_MANUALLY',
  // Sales approval (RL-6, V346).
  'APPROVAL_REQUESTED',
  'APPROVAL_WITHDRAWN',
  'APPROVED',
  'APPROVAL_REJECTED',
  'APPROVAL_CLEARED_BY_EDIT',
  // Backend 5597b0250 (HS Slice A, V534): HS codes added to a never-sent invoice held at dispatch.
  'ISSUED_HS_CODE_AMENDED',
])

const SILENT_OUTCOMES = new Set(['SUCCEEDED', 'SUCCESS'])

export function timelineOf(history: InvoiceHistoryDto, userId: string | null): TimelineEntry[] {
  return history.entries.map((entry) => ({
    key: KNOWN_EVENTS.has(entry.eventType) ? `invoiceDetails.event.${entry.eventType}` : 'invoiceDetails.event.other',
    at: entry.occurredAt,
    byYou: userId !== null && entry.actorId === userId,
    // Only a refusal is worth saying out loud; a success is the entry itself. The server writes
    // SUCCEEDED; SUCCESS is kept too, so a rename there does not print the word on every line.
    outcome: entry.outcome && !SILENT_OUTCOMES.has(entry.outcome) ? entry.outcome : null,
  }))
}

/** How far through the invoice's value the payments have got, for the progress bar. */
export function paidPercent(receivable: InvoiceReceivableDto | null): number {
  if (!receivable || !receivable.documentTotal || receivable.documentTotal <= 0) return 0
  const paid = receivable.paidAmount + receivable.creditedAmount
  return Math.min(100, Math.max(0, Math.round((paid / receivable.documentTotal) * 100)))
}

/** The due-date badge beside the balance: how long is left, or how long it is late. */
export function dueNote(receivable: InvoiceReceivableDto | null, today: string): Note | null {
  if (!receivable?.dueDate || receivable.paymentState === 'PAID' || receivable.paymentState === 'NOT_APPLICABLE') return null
  const days = Math.round((Date.parse(`${receivable.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days === 0) return { key: 'invoiceDetails.due.today' }
  return days > 0 ? { key: 'invoiceDetails.due.in', values: { count: days } } : { key: 'invoiceDetails.due.late', values: { count: -days } }
}

/**
 * Attachments can only be added or removed while the invoice is a draft: the API refuses both on
 * an issued one, and a page that offered them would only collect a 409.
 */
export function attachmentsEditable(invoice: InvoiceDetailDto, can: (permission: string) => boolean): boolean {
  return isDraft(invoice) && can('invoice.attachment.manage')
}

export type AttachmentRow = InvoiceAttachmentDto & { sizeLabel: string }

export function attachmentRows(files: readonly InvoiceAttachmentDto[], size: (bytes: number) => string): AttachmentRow[] {
  return files.map((file) => ({ ...file, sizeLabel: size(file.byteSize) }))
}

export type PaymentForm = { amount: string; methodCode: string; reference: string; paymentDate: string }
export type PaymentField = 'amount' | 'methodCode' | 'reference' | 'paymentDate'

/**
 * What the API would refuse, said before the request goes: an amount of nothing or more than is
 * owed, finer than the currency's minor units, a date in the future or before the invoice was
 * issued. The server still decides — a closed period, for one, is only known there.
 */
export function paymentProblems(
  form: PaymentForm,
  context: { outstanding: number | null; currency: string; issueDate: string | null; today: string },
): Partial<Record<PaymentField, string>> {
  const problems: Partial<Record<PaymentField, string>> = {}
  const text = form.amount.trim().replace(/,/g, '')
  const scale = minorUnitsOf(context.currency)
  if (text === '') problems.amount = 'invoiceDetails.pay.error.amountRequired'
  else if (!/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) problems.amount = 'invoiceDetails.pay.error.amountPositive'
  else if ((text.split('.')[1] ?? '').length > scale) problems.amount = 'invoiceDetails.pay.error.amountScale'
  else if (context.outstanding !== null && Number(text) > context.outstanding) problems.amount = 'invoiceDetails.pay.error.amountTooMuch'
  if (!form.methodCode) problems.methodCode = 'invoiceDetails.pay.error.methodRequired'
  if (!form.paymentDate) problems.paymentDate = 'invoiceDetails.pay.error.dateRequired'
  else if (form.paymentDate > context.today) problems.paymentDate = 'invoiceDetails.pay.error.dateFuture'
  else if (context.issueDate && form.paymentDate < context.issueDate) problems.paymentDate = 'invoiceDetails.pay.error.dateBeforeIssue'
  return problems
}

/**
 * D-26 (owner, 6 Nov 2026): an issued debit note is not cancelled, deleted, edited or reversed from
 * the web. A legally valid, traceable correction workflow is an open PINT-OM/OTA requirement, so no
 * such workflow is offered either. Cancel and Delete keep their place on an issued debit note and
 * only say so: no request is sent that the server would have to refuse. A draft is not locked.
 */
export const ISSUED_DEBIT_NOTE_LOCKED = 'salesNote.detail.debitLocked'

export function issuedDebitNoteLocked(type: string | null | undefined, issued: boolean): boolean {
  return issued && type === 'DEBIT_NOTE'
}

/**
 * The server's refusals of cancelling a credit or debit note, by code, and the sentence for each
 * kind. Shared by the note's own page and the documents list, so a note refused from either reads
 * the same instead of the list's "reload and try again", which cannot help with any of these.
 */
const NOTE_CANCEL_REFUSALS: Record<string, Record<NoteKind, string>> = {
  INVOICE_CANCEL_HAS_PAYMENTS: {
    CREDIT_NOTE: 'salesNote.detail.cancelBlocked.refunded',
    DEBIT_NOTE: 'invoiceDetails.cancelBlocked.paymentsOnNote',
  },
  INVOICE_CANCEL_HAS_CORRECTIONS: {
    CREDIT_NOTE: 'invoiceDetails.cancelBlocked.correctionsOnNote',
    DEBIT_NOTE: 'invoiceDetails.cancelBlocked.correctionsOnNote',
  },
  // Backend #834: credit notes on the invoice already use what this debit note added. Only a debit
  // note is refused this way; the credit-note entry is never reached.
  DEBIT_NOTE_CANCEL_CREDITED: {
    CREDIT_NOTE: 'salesNote.detail.cancelBlocked.debitCredited',
    DEBIT_NOTE: 'salesNote.detail.cancelBlocked.debitCredited',
  },
  // D-3: what the note did outside itself (a till refund, or goods put back on the shelf) would
  // survive the cancellation, so the server refuses it. A cash, card or transfer till refund is refused earlier
  // as INVOICE_CANCEL_HAS_PAYMENTS; only an on-account (REDUCE_BALANCE) one reaches this code. Only a
  // credit note is refused this way; the debit-note entries are never reached.
  CREDIT_NOTE_CANCEL_TILL_REFUND: {
    CREDIT_NOTE: 'salesNote.detail.cancelBlocked.tillRefund',
    DEBIT_NOTE: 'salesNote.detail.cancelBlocked.tillRefund',
  },
  CREDIT_NOTE_CANCEL_HAS_STOCK_RETURN: {
    CREDIT_NOTE: 'salesNote.detail.cancelBlocked.stockReturn',
    DEBIT_NOTE: 'salesNote.detail.cancelBlocked.stockReturn',
  },
}

/** The sentence for a note's cancel refusal, or null when the code is not one of them. */
export function noteCancelRefusalKey(error: unknown, kind: NoteKind): string | null {
  if (!(error instanceof ApiError) || !error.code || !Object.hasOwn(NOTE_CANCEL_REFUSALS, error.code))
    return null
  return NOTE_CANCEL_REFUSALS[error.code][kind]
}

/** Server refusals of a payment that belong to one field of the form, and the sentence for each. */
export const PAYMENT_REFUSALS: Record<string, { field: PaymentField | null; key: string }> = {
  PAYMENT_EXCEEDS_OUTSTANDING: { field: 'amount', key: 'invoiceDetails.pay.error.amountTooMuch' },
  PAYMENT_AMOUNT_SCALE_INVALID: { field: 'amount', key: 'invoiceDetails.pay.error.amountScale' },
  PAYMENT_DATE_IN_FUTURE: { field: 'paymentDate', key: 'invoiceDetails.pay.error.dateFuture' },
  PAYMENT_DATE_BEFORE_ISSUE_DATE: { field: 'paymentDate', key: 'invoiceDetails.pay.error.dateBeforeIssue' },
  PAYMENT_METHOD_INVALID: { field: 'methodCode', key: 'invoiceDetails.pay.error.methodRequired' },
  // DEC-30-06, from RC2 on (b48e85031 never sends it): a card-coded payment's reference holding a
  // card number. Without it the form said only "check the form", naming no field.
  PAYMENT_REFERENCE_CARD_NUMBER: {
    field: 'reference',
    key: 'invoiceDetails.pay.error.referenceCardNumber',
  },
  PERIOD_CLOSED: { field: 'paymentDate', key: 'invoiceDetails.pay.error.periodClosed' },
  PAYMENT_REQUIRES_ISSUED_INVOICE: { field: null, key: 'invoiceDetails.pay.error.notIssued' },
  PAYMENT_ALREADY_REVERSED: { field: null, key: 'invoiceDetails.pay.error.alreadyReversed' },
  // FIN-4 Option B′ (owner, batch 43): a till payment once the invoice has a refund or an issued credit
  // note. Without it the reverse dialog fell back to the server's generic sentence.
  PAYMENT_REVERSAL_AFTER_REFUND_OR_CREDIT: {
    field: null,
    key: 'invoiceDetails.pay.error.reversalAfterRefundOrCredit',
  },
  PAYMENT_NOT_FOUND: { field: null, key: 'invoiceDetails.pay.error.paymentGone' },
}

/**
 * Self-billing inverts the parties: the tenant is the BUYER and `customerId` names the SELLER.
 *
 * So the counterparty labels have to flip. "Bill to Gulf Supplies" on a document Gulf Supplies is
 * billing YOU for is not a cosmetic slip — it states the wrong direction of a debt, on a screen
 * whose whole job is to say who owes whom.
 *
 * The document is otherwise an ordinary authored invoice read from the same endpoints, which is
 * why a self-billed document's page is the invoice page rather than one of its own.
 */
export function isSelfBilled(type: string): boolean {
  return type.startsWith('SELF_BILLED')
}

/** Counterparty wording for a document type: seller-facing when self-billed, buyer-facing otherwise. */
export function counterpartyKeys(type: string): {
  section: string
  preposition: string
  view: string
  unknown: string
  note: string
} {
  return isSelfBilled(type)
    ? {
        section: 'invoiceDetails.billedBy',
        preposition: 'invoiceDetails.from',
        view: 'invoiceDetails.viewSeller',
        unknown: 'invoiceDetails.sellerUnknown',
        // `customerVisibleNote` is the field, but on a self-bill the party who reads it is the
        // supplier — the name of the column is not the name of the reader.
        note: 'invoiceDetails.notes.supplier',
      }
    : {
        section: 'invoiceDetails.billTo',
        preposition: 'invoiceDetails.to',
        view: 'invoiceDetails.viewCustomer',
        unknown: 'invoiceDetails.customerUnknown',
        note: 'invoiceDetails.notes.customer',
      }
}

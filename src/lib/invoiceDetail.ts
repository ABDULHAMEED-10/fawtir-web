import type {
  InvoiceAttachmentDto,
  InvoiceDetailDto,
  InvoiceHistoryDto,
  InvoicePaymentDto,
  InvoiceReceivableDto,
} from '../api/invoices/detail'
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
  if (receivable.paymentState === 'PAID') return { key: 'invoicesPage.payment.paid', tone: 'paid' }
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

/** Server refusals of a payment that belong to one field of the form, and the sentence for each. */
export const PAYMENT_REFUSALS: Record<string, { field: PaymentField | null; key: string }> = {
  PAYMENT_EXCEEDS_OUTSTANDING: { field: 'amount', key: 'invoiceDetails.pay.error.amountTooMuch' },
  PAYMENT_AMOUNT_SCALE_INVALID: { field: 'amount', key: 'invoiceDetails.pay.error.amountScale' },
  PAYMENT_DATE_IN_FUTURE: { field: 'paymentDate', key: 'invoiceDetails.pay.error.dateFuture' },
  PAYMENT_DATE_BEFORE_ISSUE_DATE: { field: 'paymentDate', key: 'invoiceDetails.pay.error.dateBeforeIssue' },
  PAYMENT_METHOD_INVALID: { field: 'methodCode', key: 'invoiceDetails.pay.error.methodRequired' },
  PERIOD_CLOSED: { field: 'paymentDate', key: 'invoiceDetails.pay.error.periodClosed' },
  PAYMENT_REQUIRES_ISSUED_INVOICE: { field: null, key: 'invoiceDetails.pay.error.notIssued' },
  PAYMENT_ALREADY_REVERSED: { field: null, key: 'invoiceDetails.pay.error.alreadyReversed' },
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

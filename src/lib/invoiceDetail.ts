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
): { key: string; tone: 'draft' | 'issued' | 'cancelled' | 'awaiting' | 'partial' | 'overdue' | 'paid' } {
  if (invoice.authoringState === 'DRAFT') return { key: 'invoicesPage.authoring.draft', tone: 'draft' }
  if (invoice.authoringState === 'CANCELLED') return { key: 'invoicesPage.authoring.cancelled', tone: 'cancelled' }
  if (invoice.authoringState === 'DISCARDED') return { key: 'invoicesPage.authoring.discarded', tone: 'cancelled' }
  if (!receivable || receivable.paymentState === 'NOT_APPLICABLE') {
    return { key: 'invoicesPage.authoring.issued', tone: 'issued' }
  }
  if (receivable.overdue) return { key: 'invoicesPage.payment.overdue_other', tone: 'overdue' }
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
 * The audit trail as a timeline. Every entry is an event the server recorded; a type this build
 * does not know is shown by its own name rather than dropped, because an unexplained gap in an
 * audit trail is worse than an unfamiliar word.
 */
const KNOWN_EVENTS = new Set([
  'DRAFT_CREATED',
  'DRAFT_UPDATED',
  'DRAFT_DISCARDED',
  'INVOICE_ISSUED',
  'INVOICE_CANCELLED',
  'PAYMENT_RECORDED',
  'PAYMENT_REVERSED',
  'INTERNAL_NOTE_VIEWED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
  'MANUAL_DELIVERY_RECORDED',
  'LEGAL_HOLD_SET',
  'LEGAL_HOLD_RELEASED',
])

export function timelineOf(history: InvoiceHistoryDto, userId: string | null): TimelineEntry[] {
  return history.entries.map((entry) => ({
    key: KNOWN_EVENTS.has(entry.eventType) ? `invoiceDetails.event.${entry.eventType}` : 'invoiceDetails.event.other',
    at: entry.occurredAt,
    byYou: userId !== null && entry.actorId === userId,
    // Only a refusal is worth saying out loud; a success is the entry itself.
    outcome: entry.outcome && entry.outcome !== 'SUCCESS' ? entry.outcome : null,
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

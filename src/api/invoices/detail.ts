import { apiDownload, apiRequest, type ApiDownload } from '../client'
import type { DiscountDto } from './drafts'
import type { InvoiceStateDto, InvoiceTypeDto } from './list'

/**
 * One authored invoice, opened (`InvoiceAuthoringController`). The document, what it still owes,
 * what has been paid against it, its files and its audit trail are five separate reads behind
 * three different permissions, so the screen asks for each one only when it may.
 */
const path = (invoiceId: string) => `/v1/authored-invoices/${encodeURIComponent(invoiceId)}`

export type InvoiceLineDto = {
  lineNumber: number
  productId: string | null
  productCode: string | null
  description: string
  unitCode: string
  quantity: number
  unitPrice: number
  discountType: DiscountDto['type']
  discountValue: number
  taxCategoryCode: string
  en16931Category: string
  taxRate: number | null
  exemptionReason: string | null
  /** IBT-121: VATZR-OM-nn on a zero-rated line, VATEX-OM-nn on an exempt one. */
  exemptionReasonCode?: string | null
  /** The line's Oman classification, as the invoice carries it. */
  classification?: {
    goodsOrService?: 'G' | 'S' | null
    hsCode?: string | null
    serviceTypeCode?: string | null
  } | null
}

export type InvoiceTotalsDto = {
  subtotal: number
  itemLevelDiscount: number
  headerDiscount: number
  totalDiscount: number
  taxableAmount: number
  vatAmount: number
  totalAmount: number
  payableRoundingAmount: number
  outputScale: number
}

/** `InvoiceResponse`. `customerName` and `payment` are list-row fields and are null here. */
export type InvoiceDetailDto = {
  id: string
  type: InvoiceTypeDto
  correctionOfInvoiceId: string | null
  version: number
  authoringState: InvoiceStateDto
  /** Only `NOT_SUBMITTED` or `SENT_MANUALLY` exist today; there is no Peppol delivery state (B4). */
  deliveryState: string
  deliveryBlocker: string | null
  /**
   * TODO(backend): the design's header and delivery bar say "Sent via Peppol" and "Delivered on
   * Peppol to … · when". Neither the response code nor the delivery time is answered today.
   */
  peppolResponse?: 'AB' | 'AP' | 'RE' | null
  deliveredAt?: string | null
  customerId: string
  branchId: string
  currency: string
  vatMode: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  issuedAt: string | null
  details: {
    deliveryDate: string | null
    subject: string | null
    purchaseOrderReference: string | null
    customerVisibleNote: string | null
    paymentTerms: { code: string; label: string } | null
    paymentMethod: { code: string; label: string } | null
    correctionReasonCode: string | null
    buyerReference: string | null
    contractReference: string | null
    transactionType: string | null
    transactionSubtypes: string[] | null
    invoicingPeriod: { startDate: string | null; endDate: string | null } | null
  } | null
  headerDiscount: DiscountDto | null
  lines: InvoiceLineDto[]
  /** Null until the invoice is issued: a draft is priced only then. */
  totals: InvoiceTotalsDto | null
}

/** `InvoiceReceivable`. `NOT_APPLICABLE` for anything that is not an issued invoice or debit note. */
export type InvoiceReceivableDto = {
  documentTotal: number | null
  paidAmount: number
  creditedAmount: number
  outstandingAmount: number | null
  currency: string
  paymentState: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE'
  overdue: boolean
  dueDate: string | null
}

/** A payment or its reversal. Nothing is ever deleted, so a list must net the two. */
export type InvoicePaymentDto = {
  id: string
  entryType: 'PAYMENT' | 'REVERSAL'
  reversalOfPaymentId: string | null
  amount: number
  currency: string
  methodCode: string | null
  paymentReference: string | null
  paymentDate: string | null
  occurredAt: string
}

export type InvoiceAttachmentDto = {
  id: string
  filename: string
  contentType: string
  byteSize: number
  sha256: string
  attachedAt: string
}

/** `InvoiceAuditEntry`: what happened and when, with no amounts and no names. */
export type InvoiceHistoryDto = {
  entries: {
    id: string
    eventType: string
    outcome: string
    invoiceVersion: number | null
    changedFieldsHash: string | null
    actorId: string | null
    occurredAt: string
  }[]
  truncated: boolean
  limit: number
}

export const invoicePath = path

export function loadInvoice(invoiceId: string): Promise<InvoiceDetailDto> {
  return apiRequest<InvoiceDetailDto>(path(invoiceId))
}

export function loadReceivable(invoiceId: string): Promise<InvoiceReceivableDto> {
  return apiRequest<InvoiceReceivableDto>(`${path(invoiceId)}/receivable`)
}

export function loadPayments(invoiceId: string): Promise<InvoicePaymentDto[]> {
  return apiRequest<InvoicePaymentDto[]>(`${path(invoiceId)}/payments`)
}

export function loadAttachments(invoiceId: string): Promise<InvoiceAttachmentDto[]> {
  return apiRequest<InvoiceAttachmentDto[]>(`${path(invoiceId)}/attachments`)
}

export function loadHistory(invoiceId: string): Promise<InvoiceHistoryDto> {
  return apiRequest<InvoiceHistoryDto>(`${path(invoiceId)}/history`)
}

/** Reading the note is itself an audited event, so it is asked for only when it will be shown. */
export function loadInternalNote(invoiceId: string): Promise<{ internalNote: string | null }> {
  return apiRequest<{ internalNote: string | null }>(`${path(invoiceId)}/internal-note`)
}

export function downloadAttachment(invoiceId: string, attachmentId: string): Promise<ApiDownload> {
  return apiDownload(`${path(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}`)
}

/** `invoice.attachment.manage`, draft only (`INVOICE_ATTACHMENT_REQUIRES_DRAFT` otherwise). */
export function uploadAttachment(invoiceId: string, file: File): Promise<InvoiceAttachmentDto> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<InvoiceAttachmentDto>(`${path(invoiceId)}/attachments`, {
    method: 'POST',
    body: form,
  })
}

/** `invoice.attachment.manage`. Refused under legal hold (`INVOICE_ATTACHMENT_NOT_REMOVABLE`). */
export async function removeAttachment(invoiceId: string, attachmentId: string): Promise<void> {
  await apiRequest<unknown>(`${path(invoiceId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
  })
}

/** ISSUED only, and refused once the invoice was delivered — a credit note is the remedy then. */
export function cancelInvoice(
  invoiceId: string,
  expectedVersion: number,
  reason: string,
): Promise<InvoiceDetailDto> {
  return apiRequest<InvoiceDetailDto>(`${path(invoiceId)}/cancel`, {
    method: 'POST',
    body: { expectedVersion, reason },
  })
}

export type RecordPaymentRequest = {
  /** In the invoice's currency, at no finer scale than its minor units (OMR: 3). */
  amount: number
  /** UNCL4461 payment means code, as the rest of the invoice records it. */
  methodCode: string
  paymentReference: string | null
  paymentDate: string
}

/**
 * A payment against an issued invoice. The Idempotency-Key is the modal's, minted once when it
 * opens: a double click or a retry after a lost response records the payment once, not twice.
 */
export function recordPayment(
  invoiceId: string,
  idempotencyKey: string,
  payment: RecordPaymentRequest,
): Promise<InvoicePaymentDto> {
  return apiRequest<InvoicePaymentDto>(`${path(invoiceId)}/payments`, {
    method: 'POST',
    body: payment,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** Nothing is deleted: a reversal is a new, dated row that cancels the payment it names. */
export function reversePayment(
  invoiceId: string,
  paymentId: string,
  idempotencyKey: string,
): Promise<InvoicePaymentDto> {
  return apiRequest<InvoicePaymentDto>(
    `${path(invoiceId)}/payments/${encodeURIComponent(paymentId)}/reverse`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )
}

/** 16–128 characters of `[A-Za-z0-9._:-]`, as the API requires. */
export function newPaymentKey(): string {
  return `payment-${crypto.randomUUID()}`
}

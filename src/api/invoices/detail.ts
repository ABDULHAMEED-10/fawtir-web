import { apiDownload, apiRequest, type ApiDownload } from '../client'
import type { DiscountDto } from './drafts'
import type {
  InvoiceListApproval,
  InvoicePaymentDto as InvoiceListPaymentDto,
  InvoiceSourceDto,
  InvoiceStateDto,
  InvoiceTillDto,
  InvoiceTypeDto,
} from './list'

/**
 * One authored invoice, opened (`InvoiceAuthoringController`). The document, what it still owes,
 * what has been paid against it, its files and its audit trail are five separate reads behind
 * three different permissions, so the screen asks for each one only when it may.
 */
const path = (invoiceId: string) => `/v1/authored-invoices/${encodeURIComponent(invoiceId)}`

export type InvoiceLineDto = {
  lineNumber: number
  /** The bundle this line is a part of; an older server leaves it out. */
  bundleId?: string | null
  /** The price rule that gave this line its discount (at most one); an older server leaves it out. */
  priceRuleIds?: string[] | null
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
  /**
   * Backend #808 (INCOME.md P.25): the line's product's `keepCount`, read from the catalogue now.
   * Null when the line names no product or it is not found; absent from an older server.
   */
  keepCount?: boolean | null
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
  /**
   * One row per VAT category and rate, from the projection the other totals come from (A-8b,
   * backend #824). Absent from a server before it.
   */
  taxSubtotals?: InvoiceTaxSubtotalDto[]
}

/** `InvoicePreviewResponse.TaxSubtotal`, the shape the preview and the totals share. */
export type InvoiceTaxSubtotalDto = {
  taxCategoryCode: string
  en16931Category: string
  rate: number
  exemptionReason: string | null
  exemptionReasonCode: string | null
  taxableAmount: number
  vatAmount: number
}

/** `InvoiceResponse`, as `GET /authored-invoices/{id}` answers it. */
export type InvoiceDetailDto = {
  id: string
  type: InvoiceTypeDto
  correctionOfInvoiceId: string | null
  version: number
  authoringState: InvoiceStateDto
  /**
   * Only `NOT_SUBMITTED` or `SENT_MANUALLY`: the manual-delivery fact. Where the document stands on
   * the network is `InvoiceDispatchDto`, read from its own route.
   */
  deliveryState: string
  deliveryBlocker: string | null
  /**
   * TODO(backend): the design's header and delivery bar say "Sent via Peppol" and "Delivered on
   * Peppol to … · when". Neither the response code nor the delivery time is answered today. The
   * detail screen reads neither until the API defines them: an RE here would otherwise have been
   * shown as "Delivered on Peppol" with the success tick. Delivery is read from the dispatch.
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
    /**
     * The composer's reason behind the code (`returnedGoods`, `freightOmitted`, …), so two reasons
     * sharing a code stay apart (INCOME.md 4.9). Never in the UBL; absent before the API kept it.
     */
    correctionReasonDetail?: string | null
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
  /**
   * Self-billed documents only: the Expenditure payable raised at issue, which is what the tenant
   * owes the supplier (decision D2). Null otherwise, or before it is raised; absent from an API
   * that predates it. Paid through `POST /bills/{billId}/payments`.
   */
  payable?: SelfBilledPayableDto | null
  /**
   * The seller and buyer as the document was issued: a snapshot frozen at issue, so null on a
   * draft. Optional because a server older than the field does not send it; the screen then falls
   * back to the live company profile and customer record.
   */
  seller?: InvoiceSellerDto | null
  buyer?: InvoiceBuyerDto | null
  /**
   * The list-row fields, read by the single read as the list reads them since backend #824 (C-5).
   * A server before it sends them null, so each is only a fallback beside the page's own reads.
   */
  customerName?: string | null
  payment?: InvoiceListPaymentDto | null
  correctionOfInvoiceNumber?: string | null
  approvalState?: InvoiceListApproval | null
  /**
   * Line warnings on the authoring routes, never blocking; `[]` when none. The issue answer also
   * lists the lines that cite a counted product and moved no stock (`STOCK_UNIT_MISMATCH`,
   * `STOCK_VARIANT_UNKNOWN`, `STOCK_QUANTITY_NOT_WHOLE`, `STOCK_QUANTITY_INVALID`), and
   * `STOCK_BELOW_ZERO` for a line that moved stock below zero (batch 39 STK-Q4B). The single read
   * returns the stock warnings recorded at issue (V518) for credit notes, and from STK-Q4B for
   * invoices too; an invoice issued before V518 reads none. Absent from older servers.
   */
  warnings?: InvoiceLineWarningDto[] | null
  /** As on the list rows: `TILL` when a till sale or refund issued it. Absent from older servers. */
  source?: InvoiceSourceDto | null
  /** With `source` TILL, the till that made it. */
  till?: InvoiceTillDto | null
}

/** One line warning: `line` is the document's line number; `code` is worded by the screen. */
export type InvoiceLineWarningDto = {
  line?: number | null
  code: string
  severity?: 'warning'
  message?: string
}

export type InvoicePartyAddressDto = {
  streetName: string | null
  additionalStreetName: string | null
  addressLine3: string | null
  buildingNumber: string | null
  cityName: string | null
  postalCode: string | null
  /** The governorate, in the English spelling printed on the document (IBT-039 / IBT-054). */
  countrySubentity: string | null
  countryCode: string | null
  poBox: string | null
}

export type InvoiceSellerDto = {
  legalName: string
  vatin: string
  /** `scheme:value`. */
  participantId: string | null
  address: InvoicePartyAddressDto
}

export type InvoiceBuyerDto = {
  name: string
  vatin: string | null
  /** `scheme:value`. */
  participantId: string | null
  address: InvoicePartyAddressDto | null
}

/** `SelfBilledPayable`: the bill's own settlement. `NOT_PAYABLE` for a self-billed credit note. */
export type SelfBilledPayableDto = {
  billId: string
  state: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_PAYABLE'
  totalAmount: number
  paidAmount: number
  creditedAmount: number
  outstandingAmount: number
  currency: string
  dueDate: string | null
}

/** `InvoiceReceivable`. `NOT_APPLICABLE` for anything that is not an issued invoice or debit note. */
export type InvoiceReceivableDto = {
  documentTotal: number | null
  paidAmount: number
  creditedAmount: number
  outstandingAmount: number | null
  /** D-30(a), from 0c2d034d4: what lies below the floor of `outstandingAmount`, at or below zero. */
  unappliedCredit?: number
  currency: string
  paymentState: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE'
  overdue: boolean
  dueDate: string | null
}

/** A payment or its reversal. Nothing is ever deleted, so a list must net the two. */
export type InvoicePaymentDto = {
  id: string
  /** `REFUND` (backend V477): money paid back for a credit note, kept on the invoice it credits. */
  entryType: 'PAYMENT' | 'REVERSAL' | 'REFUND'
  reversalOfPaymentId: string | null
  amount: number
  currency: string
  methodCode: string | null
  paymentReference: string | null
  paymentDate: string | null
  occurredAt: string
  /** `REFUND` only: the credit note the money was paid back for. Absent from an older server. */
  creditNoteId?: string | null
}

export type InvoiceAttachmentDto = {
  id: string
  filename: string
  contentType: string
  byteSize: number
  sha256: string
  attachedAt: string
  /** The uploader's display name, read at request time; null when the user no longer exists. */
  attachedByName?: string | null
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

/**
 * Records that the document reached its buyer outside Peppol (`InvoiceManualDeliveryController`).
 * The server keeps one such fact per document, so marking twice answers the first.
 */
export function markSentManually(invoiceId: string): Promise<{ recordedAt: string }> {
  return apiRequest<{ recordedAt: string }>(`${path(invoiceId)}/manual-delivery`, {
    method: 'POST',
  })
}

/**
 * Where an issued document stands on its way to the buyer and the Tax Authority
 * (`GET /authored-invoices/{id}/dispatch`). `sendable` is the server's own answer to "may Send be
 * pressed now"; the screen does not re-derive it from `state`.
 */
export type InvoiceDispatchStateDto =
  | 'NOT_OWED'
  | 'NOT_SENT'
  | 'PROCESSING'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTERED'
  | 'CANCELLED'
  | 'DISPATCHED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'DELIVERED_UNCONFIRMED'
  | 'UNDELIVERABLE'

export type InvoiceDispatchDto = {
  state: InvoiceDispatchStateDto
  /** A stable token (`SELLER_ADDRESS_INCOMPLETE`, `PINT_OM_VALIDATION_FAILED`, …), never prose. */
  reasonCode: string | null
  attempts: number
  nextAttemptAt: string | null
  dispatchedAt: string | null
  sendable: boolean
  /** How the buyer is reached, once the document is dispatched; the server decides it. */
  buyerDelivery: InvoiceBuyerDeliveryDto | null
  /** A held buyer e-mail may be released now. */
  buyerEmailReleasable: boolean
  /**
   * What the AS4 transport has actually done with each leg, read from its own records. Absent from
   * a server older than this field, and null before anything was queued for transport.
   */
  transport?: InvoiceTransportDto | null
}

/**
 * One transport leg as its message record stands. `QUEUED_NOT_ATTEMPTED` is a document waiting
 * for the transport, with no attempt made: the ledger already says SENDING at that point, which
 * is why this is reported separately.
 */
export type InvoiceTransportLegStateDto =
  | 'QUEUED_NOT_ATTEMPTED'
  | 'TRANSMITTING'
  | 'RETRY_SCHEDULED'
  | 'TRANSMITTED'
  | 'FAILED'

export type InvoiceTransportLegDto = {
  messageId: string
  state: InvoiceTransportLegStateDto
  attempts: number
  lastAttemptAt: string | null
  nextAttemptAt: string | null
}

export type InvoiceTransportDto = {
  /** The Peppol leg to the buyer's access point; null when the buyer is not reached over Peppol. */
  buyer: InvoiceTransportLegDto | null
  /** The tax data document to the Tax Authority. */
  taxAuthority: InvoiceTransportLegDto | null
}

export type InvoiceBuyerDeliveryDto =
  | 'PEPPOL'
  | 'NOT_PERMITTED'
  | 'EMAIL_PENDING'
  | 'EMAIL_HELD'
  | 'EMAIL_SENT'
  | 'EMAIL_FAILED'
  | 'SENT_MANUALLY'
  | 'PRINTED_RECEIPT'
  | 'MANUAL_REQUIRED'
  | 'SELF_BILLING'

export type InvoiceSendOutcomeDto =
  | 'DISPATCHED'
  | 'ALREADY_DISPATCHED'
  | 'REFUSED'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTERED'
  | 'SUPERSEDED'

export type InvoiceSendResultDto = {
  invoiceId: string
  invoiceNumber: string | null
  outcome: InvoiceSendOutcomeDto
  reasonCode: string | null
  dispatch: InvoiceDispatchDto
}

/**
 * `GET /authored-invoices/{id}/receipt-qr` (QR E-3). READY carries the payload to draw, read by the
 * server as frozen at the receipt's first print, else as filed, else built from the issued invoice.
 * PENDING: owed or maybe owed, not derivable yet. NOT_APPLICABLE: a business or government buyer, or
 * any doubt. NOT_AN_ISSUED_SALE: not issued, a correction, or not an ordinary invoice.
 */
export type InvoiceReceiptQrDto = {
  status: 'READY' | 'PENDING' | 'NOT_APPLICABLE' | 'NOT_AN_ISSUED_SALE'
  /** Tenant data: never logged. */
  payload?: string | null
}

export function receiptQrPath(invoiceId: string): string {
  return `${path(invoiceId)}/receipt-qr`
}

export function loadReceiptQr(invoiceId: string): Promise<InvoiceReceiptQrDto> {
  return apiRequest<InvoiceReceiptQrDto>(receiptQrPath(invoiceId))
}

export function loadDispatch(invoiceId: string): Promise<InvoiceDispatchDto> {
  return apiRequest<InvoiceDispatchDto>(`${path(invoiceId)}/dispatch`)
}

/**
 * Processes this one document now (`POST /authored-invoices/{id}/send`): generation, validation
 * and queueing for the network. The key is minted when the confirmation opens, so a double click
 * or a retry of the same confirmation is one send.
 */
export function sendInvoice(invoiceId: string, idempotencyKey: string): Promise<InvoiceSendResultDto> {
  return apiRequest<InvoiceSendResultDto>(`${path(invoiceId)}/send`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/**
 * Sends this invoice's held buyer e-mail now (`POST /authored-invoices/{id}/buyer-email/release`).
 * The server sends it at most once, so a second press answers that nothing is held.
 */
export function releaseBuyerEmail(invoiceId: string): Promise<InvoiceDispatchDto> {
  return apiRequest<InvoiceDispatchDto>(`${path(invoiceId)}/buyer-email/release`, { method: 'POST' })
}

export type HeldHsCodeAmendmentDto = {
  invoice: InvoiceDetailDto
  /** RELEASED: queued to be sent again. STILL_OWED: it was not held, and is still waiting to be sent. */
  dispatch: 'RELEASED' | 'STILL_OWED'
}

/**
 * Adds the missing HS codes to an issued invoice held at dispatch for them, and releases it under the
 * same number (`POST /authored-invoices/{id}/held-hs-codes`, owner v2 A1 and K5). Lines are named
 * by number; the version guards against a change made since the page was read.
 */
export function amendHeldHsCodes(
  invoiceId: string,
  body: { expectedVersion: number; lines: { lineNumber: number; hsCode: string }[]; reason: string },
): Promise<HeldHsCodeAmendmentDto> {
  return apiRequest<HeldHsCodeAmendmentDto>(`${path(invoiceId)}/held-hs-codes`, {
    method: 'POST',
    body,
  })
}

/** 16–128 characters of `[A-Za-z0-9._:-]`, as the API requires. */
export function newSendKey(): string {
  return `send-${crypto.randomUUID()}`
}

/** 16–128 characters of `[A-Za-z0-9._:-]`, as the API requires. */
export function newPaymentKey(): string {
  return `payment-${crypto.randomUUID()}`
}

/** The `deliveryBlocker` codes InvoiceResponse documents at backend a17fad205. */
const DELIVERY_BLOCKERS = new Set(['CANONICAL_HANDOFF_NOT_ENABLED', 'DISPATCH_NOT_ACTIVE'])

/**
 * The text key suffix for a document's `deliveryBlocker`, or null when it has none. An unknown code
 * maps to `other` so that a code the backend adds later still says sending is held here rather
 * than vanishing (IMPL2-D1, W2-D1).
 */
export function deliveryBlockerKey(blocker: string | null | undefined): string | null {
  if (!blocker) return null
  return DELIVERY_BLOCKERS.has(blocker) ? blocker : 'other'
}

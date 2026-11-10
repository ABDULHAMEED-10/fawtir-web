import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { fromSpringPage, type Page, type SpringPage } from '../page'
import { withQuery } from '../query'
import type { DiscountDto } from './drafts'

/**
 * The invoices list endpoints (`InvoiceListController`, `InvoiceExportController`), in the shapes
 * the API answers with. Screens use the mappers in `lib/invoiceList.ts`.
 */
export const INVOICES_PATH = '/v1/authored-invoices'
export const INVOICE_SUMMARY_PATH = `${INVOICES_PATH}/summary`

export type InvoiceTypeDto =
  'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'SELF_BILLED_INVOICE' | 'SELF_BILLED_CREDIT_NOTE'
export type InvoiceStateDto = 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'DISCARDED'
export type InvoiceListPayment = 'AWAITING' | 'OVERDUE' | 'PAID'
export type InvoiceListSort =
  | 'UPDATED'
  | 'ISSUED_NEWEST'
  | 'ISSUED_OLDEST'
  | 'DUE_SOONEST'
  | 'AMOUNT_HIGHEST'
  | 'AMOUNT_LOWEST'
  | 'CUSTOMER'

/** `InvoiceResponse.Payment`: set on issued invoices and debit notes, the only receivables. */
export type InvoicePaymentDto = {
  state: 'NOT_APPLICABLE' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
  overdue: boolean
  daysOverdue: number | null
  paidAmount: number | null
  creditedAmount: number | null
  outstandingAmount: number | null
  /** The day of the latest payment (ISO date); absent from an API that predates it. */
  lastPaymentDate?: string | null
  /** UNCL4461 code of the latest payment's method ("30"); absent from an API that predates it. */
  lastPaymentMethodCode?: string | null
}

export type InvoiceRowLineDto = {
  lineNumber: number
  quantity: number
  unitPrice: number
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  discountValue: number
  taxRate: number
}

/** Where a document was made: `TILL` for a till sale's invoice or a till refund's credit note. */
export type InvoiceSourceDto = 'TILL' | 'OTHER'

/** `InvoiceResponse.Till`: the till a `TILL` document came from. */
export type InvoiceTillDto = {
  id: string
  /** The till's code, as in its numbering series (`T01`). */
  code: string
  name: string | null
}

/** `InvoiceResponse`, only the members the list reads. */
export type InvoiceRowDto = {
  id: string
  type: InvoiceTypeDto
  version: number
  authoringState: InvoiceStateDto
  /**
   * On an ISSUED row, the Peppol ledger state the single read reports (A-4b, backend #824), or
   * `SENT_MANUALLY`. A server before #824 answers `NOT_SUBMITTED` on every row but a manual send,
   * so `NOT_SUBMITTED` alone never says "nothing was sent".
   */
  deliveryState: string
  /** `CANONICAL_HANDOFF_NOT_ENABLED` while nothing was submitted and this deployment cannot hand over. */
  deliveryBlocker?: string | null
  /**
   * TODO(backend): the design's PEPPOL/OTA column prints the Peppol response code of the last
   * delivery (AB acknowledged, AP accepted, RE rejected). Not answered today; drawn when present.
   */
  peppolResponse?: 'AB' | 'AP' | 'RE' | null
  customerId: string
  currency: string
  invoiceNumber: string | null
  issueDate: string | null
  dueDate: string | null
  details: {
    subject: string | null
    purchaseOrderReference: string | null
    /** BTOM-032, a credit or debit note's reason: CAN, VAT, VAL, QTY or OTH. */
    correctionReasonCode?: string | null
    /** The composer's reason behind the code (INCOME.md 4.9); absent before the API kept it. */
    correctionReasonDetail?: string | null
  } | null
  /** The issuing branch; the notes list names it under the customer. */
  branchId?: string | null
  headerDiscount?: DiscountDto | null
  lines: InvoiceRowLineDto[]
  /** Null until the document is issued: a draft is priced only then. */
  totals: { totalAmount: number } | null
  customerName: string | null
  payment: InvoicePaymentDto | null
  /** A credit or debit note: the invoice it corrects, and that invoice's number. */
  correctionOfInvoiceId?: string | null
  correctionOfInvoiceNumber?: string | null
  /** A draft with an open sales approval request for its current version (RL-6); else null. */
  approvalState?: InvoiceListApproval | null
  /**
   * Where the document was made. Absent from a server older than the field: the list then draws
   * no "From the till" badge and offers no source filter.
   */
  source?: InvoiceSourceDto | null
  /** With `source` TILL, the till that made it; null otherwise. */
  till?: InvoiceTillDto | null
}

/** A draft's sales approval state, as the list reads it; `PENDING` is the approvers' queue. */
export type InvoiceListApproval = 'PENDING' | 'APPROVED' | 'REJECTED'

/** `InvoiceListSummary`. Tab counts cover every currency; the card figures cover `currencyCode`. */
export type InvoiceSummaryDto = {
  currencyCode: string
  /** The Muscat day the figures were read on. */
  asOf: string
  all: number
  drafts: number
  /** TODO(backend): the design's "To send" tab count — issued, undelivered documents. Not answered today. */
  toSend?: number
  awaiting: number
  overdue: number
  paid: number
  outstandingTotal: number
  outstandingInvoices: number
  awaitingTotal: number
  dueSoonInvoices: number
  dueSoonDays: number
  overdueTotal: number
  /** The card's count, in `currencyCode`; `overdue` is the tab's, across currencies. */
  overdueInvoices: number
  oldestOverdueDueDate: string | null
  paidTotal: number
  paidInvoices: number
  /**
   * Every issued (not cancelled, not draft) document in scope, undated, in `currencyCode`: the
   * credit notes list's "Applied to invoices" card. Absent from an API that predates it.
   */
  issuedTotal?: { count: number; total: number }
  /**
   * Documents issued in the 30 days up to `asOf`, and their total in `currencyCode`: the notes
   * lists' "Charged · 30 days" / "Credited · 30 days" card. Absent from an API that predates it.
   */
  issuedLast30Days?: { count: number; total: number }
  /**
   * Documents issued since the first day of the current quarter up to `asOf`, same basis as
   * `issuedLast30Days`: the notes lists' subtitle. Absent from an API that predates it.
   */
  issuedThisQuarter?: { count: number; total: number }
  /**
   * Documents issued in `asOf`'s calendar month, their total and their VAT, in `currencyCode`: the
   * self-billing list's "Raised this month" and "Input VAT claimed" cards. Absent from an API that
   * predates it.
   */
  issuedThisMonth?: { count: number; total: number; vat: number }
  /**
   * Issued self-billed invoices whose Expenditure payable is not settled, every currency, and the
   * earliest issue date among them: the self-billing list's "Awaiting supplier" card. Absent from
   * an API that predates it.
   */
  awaitingSupplier?: { count: number; oldestIssueDate: string | null }
  /** Drafts waiting for sales approval (RL-6): the "To approve" tab's count. */
  awaitingApproval?: number
  /**
   * Issued credit notes on which money was paid back to the customer, and what was paid back, in
   * `currencyCode` (ACC-3, backend #824). "Applied to invoices" is `issuedTotal` less this. Absent
   * from an API that predates it.
   */
  refundedTotal?: { count: number; total: number }
  /**
   * Issued invoices with cash received on them, and those payments net of reversals, in
   * `currencyCode` (ACC-10, backend #824). Unlike `paidTotal`, an invoice a credit note cleared
   * adds nothing. Absent from an API that predates it.
   */
  collectedTotal?: { count: number; total: number }
}

/** What a tab, the toolbar and the search ask the server for. */
export type InvoiceListFilter = {
  /** Comma-separated states, as both routes read them. */
  state: string | null
  payment: InvoiceListPayment | null
  /**
   * One type, or several. Comma-separated on the wire, exactly as `state` is: the server binds it
   * as a `Set<InvoiceType>`, so a screen showing self-billing's two document types (389 and 261)
   * asks for both in one page rather than merging two independently paged responses.
   */
  type: InvoiceTypeDto | InvoiceTypeDto[] | null
  from: string | null
  to: string | null
  search: string
  /** The notes of one invoice. */
  correctionOf?: string | null
  /** One customer's invoices — the periodic schedule's template picker asks for these. */
  customerId?: string | null
  /** How the customer is sent to (`InvoiceListChannel`); no invoice records a channel of its own yet. */
  channel?: 'PEPPOL' | 'EMAIL' | null
  /**
   * `TO_SEND`: issued documents not yet delivered by any means, exactly what the summary's
   * `toSend` counts (`InvoiceListDelivery`), so the tab's rows match its badge.
   */
  delivery?: 'TO_SEND' | null
  /** Drafts in this sales approval state; `PENDING` with state DRAFT is the "To approve" tab. */
  approval?: InvoiceListApproval | null
  /** Made at the till (sale invoices and refund credit notes) or anywhere else. */
  source?: InvoiceSourceDto | null
}

export type InvoiceListQuery = InvoiceListFilter & {
  sort: InvoiceListSort
  /** Zero-based. */
  page: number
  size: number
}

function filterParams(filter: InvoiceListFilter) {
  return {
    state: filter.state,
    payment: filter.payment,
    type: Array.isArray(filter.type) ? (filter.type.length === 0 ? null : filter.type.join(',')) : filter.type,
    from: filter.from,
    to: filter.to,
    q: filter.search.trim(),
    correction_of_invoice_id: filter.correctionOf ?? undefined,
    customer_id: filter.customerId ?? undefined,
    channel: filter.channel ?? undefined,
    delivery: filter.delivery ?? undefined,
    approval: filter.approval ?? undefined,
    source: filter.source ?? undefined,
  }
}

/** The request for one page of the list. Also its identity: the same query is the same key. */
export function invoiceListPath(query: InvoiceListQuery): string {
  return withQuery(INVOICES_PATH, {
    ...filterParams(query),
    sort: query.sort,
    page: query.page,
    size: query.size,
  })
}

export async function loadInvoicePage(path: string): Promise<Page<InvoiceRowDto>> {
  return fromSpringPage(await apiRequest<SpringPage<InvoiceRowDto>>(path))
}

/**
 * The summary's request: every document, or one document type (`?type=DEBIT_NOTE`), with the
 * money figures in `currency` when one is named (the server's default is OMR).
 */
export function invoiceSummaryPath(
  type: InvoiceTypeDto | null = null,
  currency: string | null = null,
): string {
  return withQuery(INVOICE_SUMMARY_PATH, { type, currency })
}

export function loadInvoiceSummary(
  type: InvoiceTypeDto | null = null,
  currency: string | null = null,
): Promise<InvoiceSummaryDto> {
  return apiRequest<InvoiceSummaryDto>(invoiceSummaryPath(type, currency))
}

export type InvoiceExport = ApiDownload & {
  /** The server stopped at its row cap; the file is not every matching document. */
  truncated: boolean
}

/** The CSV of the documents the list is showing: the same tab, type, period and search. */
export async function exportInvoices(filter: InvoiceListFilter): Promise<InvoiceExport> {
  const file = await apiDownload(withQuery(`${INVOICES_PATH}/export.csv`, filterParams(filter)))
  return { ...file, truncated: file.headers.get('X-Fawtir-Export-Truncated') === 'true' }
}

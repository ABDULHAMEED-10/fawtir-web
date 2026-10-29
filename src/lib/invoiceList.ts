import type {
  InvoiceListApproval,
  InvoiceListFilter,
  InvoiceListPayment,
  InvoiceListSort,
  InvoiceRowDto,
  InvoiceStateDto,
  InvoiceSummaryDto,
  InvoiceTypeDto,
} from '../api/invoices/list'
import { calculateInvoice, projectInvoice } from './invoiceMath'
import { minorUnitsOf } from './format'
import { delivered, noteStatusOf, type NoteListStatus } from './salesNote'

/**
 * The Invoices list's view model, written only from what a row carries.
 *
 * Status is three facts, not one (INV-FR-012, decision D4): where the document is in authoring,
 * what it still owes, and whether it was delivered by hand. The Peppol/OTA column stays hidden
 * until the delivery status is real (D5), so no row claims a transmission the server never made.
 */

export type Note = { key: string; values?: Record<string, string | number> }

export type InvoiceTabId = 'all' | 'drafts' | 'awaiting' | 'overdue' | 'paid'

/**
 * The design's "To send" tab is left out: nothing is sent while submission is off, so the tab
 * would count every issued invoice under a name that promises something else.
 */
export const INVOICE_TABS: { id: InvoiceTabId; labelKey: string; danger?: boolean }[] = [
  { id: 'all', labelKey: 'invoicesPage.tabs.all' },
  { id: 'drafts', labelKey: 'invoicesPage.tabs.drafts' },
  { id: 'awaiting', labelKey: 'invoicesPage.tabs.awaiting' },
  { id: 'overdue', labelKey: 'invoicesPage.tabs.overdue', danger: true },
  { id: 'paid', labelKey: 'invoicesPage.tabs.paid' },
]

export function isInvoiceTab(value: string | null): value is InvoiceTabId {
  return INVOICE_TABS.some((tab) => tab.id === value)
}

/**
 * What each tab asks for. "All" names its three states rather than asking for everything, because
 * a discarded draft is gone from the user's point of view and the summary does not count it.
 */
export function tabFilter(tab: InvoiceTabId): {
  state: string | null
  payment: InvoiceListPayment | null
} {
  switch (tab) {
    case 'all':
      return { state: 'DRAFT,ISSUED,CANCELLED', payment: null }
    case 'drafts':
      return { state: 'DRAFT', payment: null }
    case 'awaiting':
      return { state: null, payment: 'AWAITING' }
    case 'overdue':
      return { state: null, payment: 'OVERDUE' }
    case 'paid':
      return { state: null, payment: 'PAID' }
  }
}

export function tabCount(summary: InvoiceSummaryDto, tab: InvoiceTabId): number {
  return summary[tab]
}

export type InvoiceSortKey =
  | 'updated'
  | 'issuedNewest'
  | 'issuedOldest'
  | 'dueSoonest'
  | 'amountHighest'
  | 'amountLowest'
  | 'customer'

export const INVOICE_SORTS: { value: InvoiceSortKey; sort: InvoiceListSort; labelKey: string }[] = [
  { value: 'updated', sort: 'UPDATED', labelKey: 'invoicesPage.sort.updated' },
  { value: 'issuedNewest', sort: 'ISSUED_NEWEST', labelKey: 'invoicesPage.sort.issuedNewest' },
  { value: 'issuedOldest', sort: 'ISSUED_OLDEST', labelKey: 'invoicesPage.sort.issuedOldest' },
  { value: 'dueSoonest', sort: 'DUE_SOONEST', labelKey: 'invoicesPage.sort.dueSoonest' },
  { value: 'amountHighest', sort: 'AMOUNT_HIGHEST', labelKey: 'invoicesPage.sort.amountHighest' },
  { value: 'amountLowest', sort: 'AMOUNT_LOWEST', labelKey: 'invoicesPage.sort.amountLowest' },
  { value: 'customer', sort: 'CUSTOMER', labelKey: 'invoicesPage.sort.customer' },
]

export function isInvoiceSort(value: string | null): value is InvoiceSortKey {
  return INVOICE_SORTS.some((option) => option.value === value)
}

/**
 * The document types the Income list's Type filter offers: sales documents only. Self-billed
 * invoices and credit notes (389, 261) are purchases and live under Expenditure › Self-billing
 * (owner decision, 6 Oct 2026).
 */
export const INVOICE_TYPES: InvoiceTypeDto[] = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']

export function isInvoiceType(value: string | null): value is InvoiceTypeDto {
  return INVOICE_TYPES.includes(value as InvoiceTypeDto)
}

export type PeriodId = 'all' | 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear'

export const PERIODS: { id: PeriodId; labelKey: string }[] = [
  { id: 'all', labelKey: 'invoicesPage.filters.period.all' },
  { id: 'thisMonth', labelKey: 'invoicesPage.filters.period.thisMonth' },
  { id: 'lastMonth', labelKey: 'invoicesPage.filters.period.lastMonth' },
  { id: 'last3Months', labelKey: 'invoicesPage.filters.period.last3Months' },
  { id: 'thisYear', labelKey: 'invoicesPage.filters.period.thisYear' },
]

export function isPeriod(value: string | null): value is PeriodId {
  return PERIODS.some((period) => period.id === value)
}

const pad = (value: number) => String(value).padStart(2, '0')
const dayKey = (year: number, month: number, day: number) => {
  // Date.UTC rolls month 0 back into the previous year and day 0 back into the previous month.
  const date = new Date(Date.UTC(year, month - 1, day))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/**
 * The issue dates a period covers, both ends inclusive, counted from `today` — the summary's
 * `asOf`, the Muscat day the server reads, never the browser's clock.
 */
export function periodRange(
  period: PeriodId,
  today: string,
): { from: string | null; to: string | null } {
  const [year, month] = today.split('-').map(Number)
  switch (period) {
    case 'all':
      return { from: null, to: null }
    case 'thisMonth':
      return { from: dayKey(year, month, 1), to: null }
    case 'lastMonth':
      return { from: dayKey(year, month - 1, 1), to: dayKey(year, month, 0) }
    case 'last3Months':
      return { from: dayKey(year, month - 2, 1), to: null }
    case 'thisYear':
      return { from: dayKey(year, 1, 1), to: null }
  }
}

export function listFilter(
  tab: InvoiceTabId,
  type: InvoiceTypeDto | null,
  period: PeriodId,
  today: string,
  search: string,
): InvoiceListFilter {
  return { ...tabFilter(tab), type, ...periodRange(period, today), search }
}

export type AuthoringChip = 'draft' | 'issued' | 'cancelled' | 'discarded'
/** `toSend` is the design's "To be sent": issued, nothing paid yet, and not delivered by any means. */
export type PaymentChip = 'toSend' | 'awaiting' | 'partial' | 'overdue' | 'paid'
export type PeppolResponse = 'AB' | 'AP' | 'RE'

export type InvoiceListItem = {
  id: string
  version: number
  number: string | null
  type: InvoiceTypeDto
  customer: string | null
  subtitle: string | null
  issueDate: string | null
  dueDate: string | null
  currency: string
  amount: number | null
  /** A draft's figure is the browser's reading of its lines; the server prices it only at issue. */
  estimated: boolean
  amountNote: Note | null
  authoring: AuthoringChip
  payment: PaymentChip | null
  paymentValues?: Record<string, number>
  sentManually: boolean
  /** The Peppol response code of the last delivery, when the row carries one. */
  peppolResponse: PeppolResponse | null
  /** The issuing branch, named under the customer once the branches are known. */
  branchId: string | null
  isDraft: boolean
  /** A draft's sales approval state when a request is open (RL-6). */
  approval: InvoiceListApproval | null
  /**
   * A credit or debit note's status as the notes lists word it, so one note reads the same in both
   * lists; it said "Issued" here and "To be sent" there. Null on any other document.
   */
  noteStatus: NoteListStatus | null
}

const AUTHORING: Record<InvoiceStateDto, AuthoringChip> = {
  DRAFT: 'draft',
  ISSUED: 'issued',
  CANCELLED: 'cancelled',
  DISCARDED: 'discarded',
}

/**
 * One pill per row, as the design draws it (Figma 154:172772): overdue, paid, partially paid,
 * "To be sent" while an unpaid document has not been delivered by any means, else awaiting.
 */
function paymentOf(row: InvoiceRowDto): Pick<InvoiceListItem, 'payment' | 'paymentValues'> {
  const payment = row.payment
  if (!payment || payment.state === 'NOT_APPLICABLE') return { payment: null }
  if (payment.overdue)
    return { payment: 'overdue', paymentValues: { count: payment.daysOverdue ?? 0 } }
  if (payment.state === 'PAID') return { payment: 'paid' }
  if (payment.state === 'PARTIALLY_PAID') return { payment: 'partial' }
  return { payment: delivered(row) ? 'awaiting' : 'toSend' }
}

/**
 * A note row's words from the notes lists' rule, with two exceptions that keep what this list
 * already said. A debit note that is paid, partly paid or overdue keeps its payment pill:
 * noteStatusOf reads delivery first, and the backend sends no Peppol response, so an undelivered
 * paid debit note would read "To be sent" (the hazard debitPaymentOf names). A discarded note
 * keeps "Discarded", which noteStatusOf folds into "Cancelled".
 */
function listNoteStatus(row: InvoiceRowDto, payment: PaymentChip | null): NoteListStatus | null {
  if (row.type !== 'CREDIT_NOTE' && row.type !== 'DEBIT_NOTE') return null
  if (row.authoringState === 'DISCARDED') return null
  if (
    row.type === 'DEBIT_NOTE' &&
    (payment === 'paid' || payment === 'partial' || payment === 'overdue')
  )
    return null
  return noteStatusOf(row.type, row)
}

/** The draft's lines through the same engine the composer uses, at the currency's scale. */
function estimateOf(row: InvoiceRowDto): number | null {
  if (row.lines.length === 0) return null
  const scale = minorUnitsOf(row.currency)
  const amounts = calculateInvoice(
    row.lines.map((line) => ({
      id: String(line.lineNumber),
      lineNumber: line.lineNumber,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      vatRate: String(line.taxRate),
      discountType: line.discountType,
      discountValue: String(line.discountValue),
    })),
    row.headerDiscount?.type ?? 'PERCENTAGE',
    String(row.headerDiscount?.value ?? 0),
  )
  return Number(projectInvoice(amounts, scale).total) / 10 ** scale
}

function amountNoteOf(row: InvoiceRowDto, payment: PaymentChip | null): Note | null {
  const figures = row.payment
  if (!figures || payment === null) return null
  if (payment === 'partial' || (payment === 'overdue' && (figures.paidAmount ?? 0) > 0)) {
    return {
      key: 'invoicesPage.amountNote.outstanding',
      values: { amount: figures.outstandingAmount ?? 0 },
    }
  }
  if (payment === 'paid' && (figures.creditedAmount ?? 0) > 0) {
    return {
      key: 'invoicesPage.amountNote.credited',
      values: { amount: figures.creditedAmount ?? 0 },
    }
  }
  return null
}

export function toInvoiceListItem(row: InvoiceRowDto): InvoiceListItem {
  const isDraft = row.authoringState === 'DRAFT'
  const payment = paymentOf(row)
  const estimated = row.totals === null && isDraft
  return {
    id: row.id,
    version: row.version,
    number: row.invoiceNumber,
    type: row.type,
    customer: row.customerName,
    subtitle: row.details?.subject?.trim() || row.details?.purchaseOrderReference?.trim() || null,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    currency: row.currency,
    amount: row.totals ? row.totals.totalAmount : estimated ? estimateOf(row) : null,
    estimated,
    amountNote: amountNoteOf(row, payment.payment),
    authoring: AUTHORING[row.authoringState],
    ...payment,
    sentManually: row.deliveryState === 'SENT_MANUALLY',
    peppolResponse: row.peppolResponse ?? null,
    branchId: row.branchId ?? null,
    isDraft,
    approval: isDraft ? (row.approvalState ?? null) : null,
    noteStatus: listNoteStatus(row, payment.payment),
  }
}

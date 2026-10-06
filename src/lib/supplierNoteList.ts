import type {
  CreditNoteRowDto,
  CreditNoteStatusDto,
  DebitNoteRowDto,
  DebitNoteStatusDto,
  NoteSortDto,
  NoteSourceDto,
} from '../api/expenditure/notes'

/**
 * View models for the two supplier-note lists (E-15, E-16), written from what a row carries and
 * shaped the way the Figma frames draw them (Credit notes 163:18691, Debit notes 163:21057).
 *
 * The frames' tabs are All / Used / Refunded and All / Accepted / Rejected. The two statuses the
 * server also filters on (credit nobody has used yet, charges nobody has checked) are reached from
 * the highlighted KPI card, which is the frame's own signpost to them; while one of those is
 * selected it appears in the strip so it can be cleared.
 */

export type NoteSourceBadge = 'peppol' | 'uploaded' | 'scanned' | 'recurring' | 'selfBilled'

const SOURCE: Record<NoteSourceDto, NoteSourceBadge> = {
  PEPPOL: 'peppol',
  UPLOADED: 'uploaded',
  SCANNED: 'scanned',
  RECURRING: 'recurring',
  SELF_BILLED: 'selfBilled',
}

/** The toolbar's sort choices, and the server's order each one asks for. */
export type NoteSort = 'natural' | 'amountDesc' | 'amountAsc' | 'supplierAsc'

export const NOTE_SORTS: { value: NoteSort; labelKey: string; sort: NoteSortDto }[] = [
  { value: 'natural', labelKey: 'supplierNotes.sort.natural', sort: 'NEWEST' },
  { value: 'amountDesc', labelKey: 'supplierNotes.sort.amountDesc', sort: 'AMOUNT_HIGHEST' },
  { value: 'amountAsc', labelKey: 'supplierNotes.sort.amountAsc', sort: 'AMOUNT_LOWEST' },
  { value: 'supplierAsc', labelKey: 'supplierNotes.sort.supplierAsc', sort: 'SUPPLIER' },
]

export function isNoteSort(value: string | null): value is NoteSort {
  return NOTE_SORTS.some((option) => option.value === value)
}

export function noteSortOf(value: NoteSort): NoteSortDto {
  return NOTE_SORTS.find((option) => option.value === value)?.sort ?? 'NEWEST'
}

/**
 * The suppliers the filter offers, by record id: the server narrows on `supplier_id`. A note
 * whose supplier was never matched to a record has no id to narrow by, so it is not offered.
 */
export function supplierOptions(
  rows: { supplierId: string | null; supplier: string | null }[],
): Record<string, string> {
  const found: Record<string, string> = {}
  for (const row of rows) if (row.supplierId && row.supplier) found[row.supplierId] = row.supplier
  return found
}

// ─────────────────────────────────────────────────────────────── credit notes

export type CreditTabId = 'all' | 'applied' | 'refunded' | 'unapplied' | 'waiting'

export const CREDIT_TAB_STATUS: Record<CreditTabId, CreditNoteStatusDto | 'ALL'> = {
  all: 'ALL',
  applied: 'APPLIED',
  refunded: 'REFUNDED',
  unapplied: 'UNAPPLIED',
  waiting: 'WAITING_FOR_BILL',
}

export const CREDIT_TAB_LABEL: Record<CreditTabId, string> = {
  all: 'supplierCreditNotes.tabs.all',
  applied: 'supplierCreditNotes.tabs.used',
  refunded: 'supplierCreditNotes.tabs.refunded',
  unapplied: 'supplierCreditNotes.tabs.unapplied',
  waiting: 'supplierCreditNotes.tabs.waiting',
}

/** The strip as the frame draws it. `unapplied` and `waiting` join it only while selected. */
export const CREDIT_TABS: CreditTabId[] = ['all', 'applied', 'refunded']

export const DEFAULT_CREDIT_TAB: CreditTabId = 'all'

export function isCreditTab(value: string | null): value is CreditTabId {
  return value !== null && value in CREDIT_TAB_STATUS
}

export type CreditChipTone = 'usable' | 'waiting' | 'done' | 'refunded'

export const CREDIT_STATUS_CHIP: Record<CreditNoteStatusDto, CreditChipTone> = {
  UNAPPLIED: 'usable',
  WAITING_FOR_BILL: 'waiting',
  APPLIED: 'done',
  REFUNDED: 'refunded',
}

/** The chip's words, as the frame prints them. */
export const CREDIT_STATUS_LABEL: Record<CreditNoteStatusDto, string> = {
  UNAPPLIED: 'supplierCreditNotes.state.notUsed',
  WAITING_FOR_BILL: 'supplierCreditNotes.state.waitingForBill',
  APPLIED: 'supplierCreditNotes.state.used',
  REFUNDED: 'supplierCreditNotes.state.refunded',
}

/** The one thing a row offers under its chip. */
export const CREDIT_ROW_ACTION: Record<
  CreditNoteStatusDto,
  { labelKey: string; primary?: boolean; goesTo: 'bill' | 'note' }
> = {
  UNAPPLIED: { labelKey: 'supplierCreditNotes.actions.setAgainst', primary: true, goesTo: 'note' },
  // The frame prints "View the bill" here, but a note waiting for a bill has none to view: the
  // link opens the note instead.
  WAITING_FOR_BILL: { labelKey: 'supplierCreditNotes.actions.openNote', goesTo: 'note' },
  APPLIED: { labelKey: 'supplierCreditNotes.actions.viewBill', goesTo: 'bill' },
  REFUNDED: { labelKey: 'supplierCreditNotes.actions.seePayment', goesTo: 'note' },
}

/** What the figure column says under the amount. */
export const CREDIT_AMOUNT_NOTE: Record<CreditNoteStatusDto, string> = {
  UNAPPLIED: 'supplierCreditNotes.rows.youdPayLess',
  WAITING_FOR_BILL: 'supplierCreditNotes.rows.youdPayLess',
  APPLIED: 'supplierCreditNotes.rows.takenOff',
  REFUNDED: 'supplierCreditNotes.rows.paidBack',
}

export type CreditNoteItem = {
  id: string
  number: string | null
  issueDate: string | null
  supplier: string | null
  supplierId: string | null
  source: NoteSourceBadge
  networkVerified: boolean
  /** The Peppol delivery the document came in on, which is where its file is downloaded from. */
  inboundDeliveryId: string | null
  /** The upload the note was confirmed from, where an uploaded note's file is downloaded from. */
  intakeId: string | null
  /** When the note was recorded (an instant), or null from a server that does not say. */
  receivedAt: string | null
  /** The bill this credit actually reduces, when it reduces exactly one. */
  againstBillId: string | null
  againstBillNumber: string | null
  againstBillIssueDate: string | null
  applied: boolean
  reasonCode: string | null
  /** The supplier's finer reason behind the code, when sent. */
  reasonDetail: string | null
  status: CreditNoteStatusDto
  currency: string
  credited: number | null
  remaining: number
  /** Whether any of the credit is still to be spent: what the "still usable" figure counts. */
  usable: boolean
}

export function toCreditNoteItem(row: CreditNoteRowDto): CreditNoteItem {
  return {
    id: row.id,
    number: row.creditNoteNumber,
    issueDate: row.issueDate,
    supplier: row.supplierName,
    supplierId: row.supplierId,
    source: SOURCE[row.source],
    networkVerified: row.networkVerified,
    inboundDeliveryId: row.inboundDeliveryId,
    intakeId: row.intakeId ?? null,
    receivedAt: row.receivedAt ?? null,
    againstBillId: row.credits.billId,
    againstBillNumber: row.credits.billNumber,
    againstBillIssueDate: row.credits.issueDate,
    applied: row.credits.applied,
    reasonCode: row.reasonCode,
    reasonDetail: row.reasonDetail ?? null,
    status: row.status,
    currency: row.currencyCode,
    credited: row.creditedAmount,
    remaining: row.balance.remaining,
    usable: row.balance.remaining > 0,
  }
}

// ──────────────────────────────────────────────────────────────── debit notes

export type DebitTabId = 'all' | 'accepted' | 'refused' | 'unchecked'

export const DEBIT_TAB_STATUS: Record<DebitTabId, DebitNoteStatusDto | 'ALL'> = {
  all: 'ALL',
  accepted: 'ACCEPTED',
  refused: 'REFUSED',
  unchecked: 'UNCHECKED',
}

export const DEBIT_TAB_LABEL: Record<DebitTabId, string> = {
  all: 'supplierDebitNotes.tabs.all',
  accepted: 'supplierDebitNotes.tabs.accepted',
  refused: 'supplierDebitNotes.tabs.rejected',
  unchecked: 'supplierDebitNotes.tabs.unchecked',
}

/** The strip as the frame draws it. `unchecked` joins it only while selected. */
export const DEBIT_TABS: DebitTabId[] = ['all', 'accepted', 'refused']

export const DEFAULT_DEBIT_TAB: DebitTabId = 'all'

export function isDebitTab(value: string | null): value is DebitTabId {
  return value !== null && value in DEBIT_TAB_STATUS
}

export const DEBIT_ROW_ACTION: Record<
  DebitNoteStatusDto,
  { labelKey: string; primary?: boolean; goesTo: 'bill' | 'note' }
> = {
  UNCHECKED: {
    labelKey: 'supplierDebitNotes.actions.acceptOrRefuse',
    primary: true,
    goesTo: 'note',
  },
  ACCEPTED: { labelKey: 'supplierDebitNotes.actions.viewBill', goesTo: 'bill' },
  // The frame prints "See the payment" on a refused charge; a refused charge is never paid, so
  // the link opens the decision instead.
  REFUSED: { labelKey: 'supplierDebitNotes.actions.seeDecision', goesTo: 'note' },
}

export type DebitNoteItem = {
  id: string
  number: string | null
  issueDate: string | null
  dueDate: string | null
  /** The server's judgment. Never recomputed from the due date here: see the Bills list. */
  overdue: boolean
  supplier: string | null
  supplierId: string | null
  source: NoteSourceBadge
  networkVerified: boolean
  inboundDeliveryId: string | null
  againstBillNumber: string | null
  againstBillIssueDate: string | null
  reasonCode: string | null
  /** The supplier's finer reason behind the code, when sent. */
  reasonDetail: string | null
  status: DebitNoteStatusDto
  decisionReason: string | null
  decidedAt: string | null
  decidedBy: string | null
  currency: string
  total: number | null
  outstanding: number
  paid: number
  /**
   * Whether anything is still owed on it. A refused note owes nothing whatever the figure says:
   * the tenant has rejected the charge, so presenting it as a debt would chase money that is
   * disputed.
   */
  owes: boolean
}

export function toDebitNoteItem(row: DebitNoteRowDto): DebitNoteItem {
  return {
    id: row.id,
    number: row.debitNoteNumber,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    overdue: row.overdue,
    supplier: row.supplierName,
    supplierId: row.supplierId,
    source: SOURCE[row.source],
    networkVerified: row.networkVerified,
    inboundDeliveryId: row.inboundDeliveryId,
    againstBillNumber: row.relatesTo?.billNumber ?? null,
    againstBillIssueDate: row.relatesTo?.issueDate ?? null,
    reasonCode: row.reasonCode,
    reasonDetail: row.reasonDetail ?? null,
    status: row.status,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    currency: row.currencyCode,
    total: row.totalIncludingVat,
    outstanding: row.outstandingAmount,
    paid: row.paidAmount,
    owes: row.status !== 'REFUSED' && row.outstandingAmount > 0,
  }
}

/** What the figure column says under a charge: where the money has got to. */
export function debitAmountNoteKey(item: DebitNoteItem): string {
  if (item.status === 'REFUSED') return 'supplierDebitNotes.outcome.notOwed'
  if (item.status === 'UNCHECKED') return 'supplierDebitNotes.outcome.youdPayMore'
  if (item.outstanding <= 0 && item.paid > 0) return 'supplierDebitNotes.outcome.paidSeparately'
  return item.overdue
    ? 'supplierDebitNotes.rows.overdueShort'
    : 'supplierDebitNotes.outcome.addedToBill'
}

/**
 * The reason as something to read: the words given with the note when sent, else the CL-02-OM code. A code with no label is shown as the code: inventing
 * a sentence for it would put words in the supplier's mouth, and a blank would hide that they
 * gave a reason at all.
 */
export function reasonLabelKey(
  code: string | null,
  detail: string | null = null,
): { key: string; fallback: string } | null {
  // The words given with the note (or an older row's reason id, which reads as its label) say
  // more than the CL-02-OM code's own label; the code is still shown beside them on the detail
  // screens. Words with no label read as written.
  if (detail) return { key: `expenditureNotes.reason.${detail}`, fallback: detail }
  if (!code) return null
  return { key: `expenditureNotes.reason.${code}`, fallback: code }
}

/** The five CL-02-OM credit and debit note reason codes (BTOM-032, IBR-023-OM). */
export const CL02_OM_REASONS = ['CAN', 'VAT', 'VAL', 'QTY', 'OTH'] as const
export type Cl02Reason = (typeof CL02_OM_REASONS)[number]

/**
 * The app's older reason codes read as the CL-02-OM code they stand for, so the screen can say
 * which code the note carries in the Tax Authority's own list.
 *
 * TODO(backend): EXPENDITURE.md R.3. `reasonCode` should only ever carry a CL-02-OM code.
 */
const LEGACY_REASONS: Record<string, Cl02Reason> = {
  SHORT_DELIVERY: 'QTY',
  DAMAGED: 'QTY',
  RETURN: 'CAN',
  OVERCHARGE: 'VAL',
  PRICE_CORRECTION: 'VAL',
  SURCHARGE: 'VAL',
  LATE_FEE: 'OTH',
  DUPLICATE: 'CAN',
  OTHER: 'OTH',
}

/** The CL-02-OM code a reason stands for, or null for a code that maps to none. */
export function cl02ReasonOf(code: string | null): Cl02Reason | null {
  if (!code) return null
  const upper = code.toUpperCase()
  if ((CL02_OM_REASONS as readonly string[]).includes(upper)) return upper as Cl02Reason
  return LEGACY_REASONS[upper] ?? null
}

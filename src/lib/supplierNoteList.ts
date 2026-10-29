import type {
  CreditNoteRowDto,
  CreditNoteStatusDto,
  CreditNoteUsageDto,
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The supplier filter from the address: a supplier record's id, else `all`. A link saved before
 * the filter went to the server held the supplier's name, which `supplier_id` would refuse.
 */
export function supplierFilterOf(value: string | null): string {
  return value !== null && UUID.test(value) ? value : 'all'
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

/**
 * Where a note stands, as the screens show it: the server's status, plus PARTLY_USED for a note
 * some of whose credit has gone (used on a bill or refunded) while some is still left.
 */
export type CreditState = CreditNoteStatusDto | 'PARTLY_USED'

/**
 * The state the screens show. A note bigger than its bill, or partly refunded, comes back
 * UNAPPLIED (credit is left) with money already used, and reading only the status called it
 * "Not yet used" and offered to set it against the bill it had already cleared. So the server's
 * `usage` decides how much has gone (backend #477), and without it the balance does; the status
 * only says which way a fully used note went, or that an unused one waits for its bill. Holds
 * whatever status word the server sends, including one this screen does not know yet.
 */
export function creditStateOf(row: {
  status: CreditNoteStatusDto | string
  usage?: CreditNoteUsageDto | string | null
  balance: { applied: number; refunded: number; remaining: number }
}): CreditState {
  const { applied, refunded, remaining } = row.balance
  const usage =
    row.usage === 'NOT_USED' || row.usage === 'PARTLY_USED' || row.usage === 'FULLY_USED'
      ? row.usage
      : remaining <= 0 && (applied > 0 || refunded > 0)
        ? 'FULLY_USED'
        : applied > 0 || refunded > 0
          ? 'PARTLY_USED'
          : 'NOT_USED'
  if (usage === 'PARTLY_USED') return 'PARTLY_USED'
  if (usage === 'FULLY_USED') {
    if (row.status === 'APPLIED' || row.status === 'REFUNDED') return row.status
    return refunded > applied ? 'REFUNDED' : 'APPLIED'
  }
  return row.status === 'WAITING_FOR_BILL' ? 'WAITING_FOR_BILL' : 'UNAPPLIED'
}

export const CREDIT_STATUS_CHIP: Record<CreditState, CreditChipTone> = {
  UNAPPLIED: 'usable',
  WAITING_FOR_BILL: 'waiting',
  APPLIED: 'done',
  REFUNDED: 'refunded',
  PARTLY_USED: 'usable',
}

/** The chip's words, as the frame prints them. */
export const CREDIT_STATUS_LABEL: Record<CreditState, string> = {
  UNAPPLIED: 'supplierCreditNotes.state.notUsed',
  WAITING_FOR_BILL: 'supplierCreditNotes.state.waitingForBill',
  APPLIED: 'supplierCreditNotes.state.used',
  REFUNDED: 'supplierCreditNotes.state.refunded',
  PARTLY_USED: 'supplierCreditNotes.state.partlyUsed',
}

/** The one thing a row offers under its chip. */
export const CREDIT_ROW_ACTION: Record<
  CreditState,
  { labelKey: string; primary?: boolean; goesTo: 'bill' | 'note' }
> = {
  UNAPPLIED: { labelKey: 'supplierCreditNotes.actions.setAgainst', primary: true, goesTo: 'note' },
  // The frame prints "View the bill" here, but a note waiting for a bill has none to view: the
  // link opens the note instead.
  WAITING_FOR_BILL: { labelKey: 'supplierCreditNotes.actions.openNote', goesTo: 'note' },
  APPLIED: { labelKey: 'supplierCreditNotes.actions.viewBill', goesTo: 'bill' },
  REFUNDED: { labelKey: 'supplierCreditNotes.actions.seePayment', goesTo: 'note' },
  // What is left goes against another bill, chosen on the note; the bill it cleared would refuse.
  PARTLY_USED: { labelKey: 'supplierCreditNotes.actions.openNote', goesTo: 'note' },
}

type CreditRowAction = (typeof CREDIT_ROW_ACTION)[CreditState]

/**
 * Held as a duplicate while none of its credit has gone anywhere: the only states a held note
 * reaches, since the server refuses it every settlement. A spent state keeps its own words and
 * action, which settle nothing.
 */
export function isHeldUnspent(note: Pick<CreditNoteItem, 'status' | 'heldAsDuplicate'>): boolean {
  return (
    note.heldAsDuplicate && (note.status === 'UNAPPLIED' || note.status === 'WAITING_FOR_BILL')
  )
}

const HELD_CREDIT_ROW_ACTION: CreditRowAction = {
  labelKey: 'supplierCreditNotes.actions.openNote',
  goesTo: 'note',
}

/**
 * The row's action. A held duplicate keeps the status its balance gives (UNAPPLIED or
 * WAITING_FOR_BILL, since it credits nothing), but the server refuses to apply or refund it, so
 * "Set against the bill" would only fail: the row opens the note, where the hold is decided.
 * Spent states are left alone, since their actions settle nothing.
 */
export function creditRowActionOf(
  note: Pick<CreditNoteItem, 'status' | 'heldAsDuplicate'>,
): CreditRowAction {
  return isHeldUnspent(note) ? HELD_CREDIT_ROW_ACTION : CREDIT_ROW_ACTION[note.status]
}

/**
 * The chip's tone and words. Only "Not yet used" gives way on a held note (owner's copy,
 * 28 Oct 2026): it reads as credit ready to spend, which the server refuses. The amber of a
 * pending note is reused rather than a new style.
 */
export function creditChipOf(note: Pick<CreditNoteItem, 'status' | 'heldAsDuplicate'>): {
  tone: CreditChipTone
  labelKey: string
} {
  if (note.heldAsDuplicate && note.status === 'UNAPPLIED') {
    return { tone: 'waiting', labelKey: 'supplierCreditNotes.held.status' }
  }
  return { tone: CREDIT_STATUS_CHIP[note.status], labelKey: CREDIT_STATUS_LABEL[note.status] }
}

/** What the figure column says under the amount. */
export const CREDIT_AMOUNT_NOTE: Record<CreditState, string> = {
  UNAPPLIED: 'supplierCreditNotes.rows.youdPayLess',
  WAITING_FOR_BILL: 'supplierCreditNotes.rows.youdPayLess',
  APPLIED: 'supplierCreditNotes.rows.takenOff',
  REFUNDED: 'supplierCreditNotes.rows.paidBack',
  PARTLY_USED: 'supplierCreditNotes.rows.youdPayLess',
}

/**
 * The words under a row's amount, or null for none. "You'd pay less" is a promise a held note
 * cannot keep: its credit reduces nothing until the hold is decided.
 */
export function creditAmountNoteOf(
  note: Pick<CreditNoteItem, 'status' | 'heldAsDuplicate'>,
): string | null {
  return isHeldUnspent(note) ? null : CREDIT_AMOUNT_NOTE[note.status]
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
  /** The server's status read with the balance: see {@link creditStateOf}. */
  status: CreditState
  currency: string
  credited: number | null
  remaining: number
  /** Whether any of the credit is still to be spent: what the "still usable" figure counts. */
  usable: boolean
  /** Held as a possible or confirmed duplicate (backend #784): it credits nothing while held. */
  heldAsDuplicate: boolean
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
    status: creditStateOf(row),
    currency: row.currencyCode,
    credited: row.creditedAmount,
    remaining: row.balance.remaining,
    // The server leaves a held note out of usable credit whatever its balance says.
    usable: row.heldAsDuplicate !== true && row.balance.remaining > 0,
    heldAsDuplicate: row.heldAsDuplicate === true,
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
  refused: 'supplierDebitNotes.tabs.refused',
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
  /** When the note reached us; null from a server that does not say. */
  receivedAt: string | null
  dueDate: string | null
  /** The server's judgment. Never recomputed from the due date here: see the Bills list. */
  overdue: boolean
  supplier: string | null
  supplierId: string | null
  source: NoteSourceBadge
  networkVerified: boolean
  inboundDeliveryId: string | null
  /** The bill on file the note adds to, when the server names exactly one. */
  againstBillId: string | null
  againstBillNumber: string | null
  againstBillIssueDate: string | null
  reasonCode: string | null
  /** The supplier's finer reason behind the code, when sent. */
  reasonDetail: string | null
  status: DebitNoteStatusDto
  decisionReason: string | null
  decidedAt: string | null
  decidedBy: string | null
  /** Who took the current decision, by name, when the server knows it. */
  decidedByName: string | null
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
  /** Held as a possible duplicate: not accepted until its bill record's duplicate check is decided. */
  heldAsDuplicate: boolean
}

export function toDebitNoteItem(row: DebitNoteRowDto): DebitNoteItem {
  return {
    id: row.id,
    number: row.debitNoteNumber,
    issueDate: row.issueDate,
    receivedAt: row.receivedAt ?? null,
    dueDate: row.dueDate,
    overdue: row.overdue,
    supplier: row.supplierName,
    supplierId: row.supplierId,
    source: SOURCE[row.source],
    networkVerified: row.networkVerified,
    inboundDeliveryId: row.inboundDeliveryId,
    againstBillId: row.relatesTo?.billId ?? null,
    againstBillNumber: row.relatesTo?.billNumber ?? null,
    againstBillIssueDate: row.relatesTo?.issueDate ?? null,
    reasonCode: row.reasonCode,
    reasonDetail: row.reasonDetail ?? null,
    status: row.status,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    decidedByName: row.decidedByName ?? null,
    currency: row.currencyCode,
    total: row.totalIncludingVat,
    outstanding: row.outstandingAmount,
    paid: row.paidAmount,
    owes: row.status !== 'REFUSED' && row.outstandingAmount > 0,
    heldAsDuplicate: row.heldAsDuplicate === true,
  }
}

/**
 * Where a held debit note is decided as a duplicate: its own bill record, where the copy is
 * compared with the note already on file.
 */
export function duplicateCheckPath(noteId: string): string {
  return `/expenditure/bills/${encodeURIComponent(noteId)}`
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

import type {
  CreditNoteRowDto,
  CreditNoteStatusDto,
  DebitNoteRowDto,
  DebitNoteStatusDto,
  NoteSourceDto,
} from '../api/expenditure/notes'

/**
 * View models for the two supplier-note lists (E-15, E-16), written only from what a row carries.
 *
 * The prototype's per-row sentences — a channel line, a "why" sentence, a chased-on date — had no
 * field behind them. What the API does carry is a CL-02-OM reason CODE, which is shown as a code
 * unless a label for it exists, rather than a sentence invented here.
 */

export type NoteSourceBadge = 'peppol' | 'uploaded' | 'scanned' | 'recurring' | 'selfBilled'

const SOURCE: Record<NoteSourceDto, NoteSourceBadge> = {
  PEPPOL: 'peppol',
  UPLOADED: 'uploaded',
  SCANNED: 'scanned',
  RECURRING: 'recurring',
  SELF_BILLED: 'selfBilled',
}

// ─────────────────────────────────────────────────────────────── credit notes

export type CreditTabId = 'all' | 'unapplied' | 'waiting' | 'applied' | 'refunded'

/**
 * Every tab is a status the server filters in SQL. The prototype offered All, Used and Refunded
 * and left the two that matter most — credit nobody has spent yet — reachable only by scrolling.
 */
export const CREDIT_TABS: { id: CreditTabId; status: CreditNoteStatusDto | 'ALL'; labelKey: string }[] = [
  { id: 'all', status: 'ALL', labelKey: 'supplierCreditNotes.tabs.all' },
  { id: 'unapplied', status: 'UNAPPLIED', labelKey: 'supplierCreditNotes.tabs.unapplied' },
  { id: 'waiting', status: 'WAITING_FOR_BILL', labelKey: 'supplierCreditNotes.tabs.waiting' },
  { id: 'applied', status: 'APPLIED', labelKey: 'supplierCreditNotes.tabs.applied' },
  { id: 'refunded', status: 'REFUNDED', labelKey: 'supplierCreditNotes.tabs.refunded' },
]

export const DEFAULT_CREDIT_TAB: CreditTabId = 'all'

export function isCreditTab(value: string | null): value is CreditTabId {
  return CREDIT_TABS.some((tab) => tab.id === value)
}

export const CREDIT_STATUS_CHIP: Record<CreditNoteStatusDto, 'usable' | 'waiting' | 'done' | 'refunded'> = {
  UNAPPLIED: 'usable',
  WAITING_FOR_BILL: 'waiting',
  APPLIED: 'done',
  REFUNDED: 'refunded',
}

export type CreditNoteItem = {
  id: string
  number: string | null
  issueDate: string | null
  supplier: string | null
  source: NoteSourceBadge
  networkVerified: boolean
  /** The bill this credit actually reduces, when it reduces exactly one. */
  againstBillId: string | null
  againstBillNumber: string | null
  applied: boolean
  reasonCode: string | null
  status: CreditNoteStatusDto
  currency: string
  credited: number | null
  remaining: number
  /** Whether any of the credit is still to be spent — what the "still usable" figure counts. */
  usable: boolean
}

export function toCreditNoteItem(row: CreditNoteRowDto): CreditNoteItem {
  return {
    id: row.id,
    number: row.creditNoteNumber,
    issueDate: row.issueDate,
    supplier: row.supplierName,
    source: SOURCE[row.source],
    networkVerified: row.networkVerified,
    againstBillId: row.credits.billId,
    againstBillNumber: row.credits.billNumber,
    applied: row.credits.applied,
    reasonCode: row.reasonCode,
    status: row.status,
    currency: row.currencyCode,
    credited: row.creditedAmount,
    remaining: row.balance.remaining,
    usable: row.balance.remaining > 0,
  }
}

// ──────────────────────────────────────────────────────────────── debit notes

export type DebitTabId = 'all' | 'unchecked' | 'accepted' | 'refused'

export const DEBIT_TABS: { id: DebitTabId; status: DebitNoteStatusDto | 'ALL'; labelKey: string }[] = [
  { id: 'all', status: 'ALL', labelKey: 'supplierDebitNotes.tabs.all' },
  { id: 'unchecked', status: 'UNCHECKED', labelKey: 'supplierDebitNotes.tabs.unchecked' },
  { id: 'accepted', status: 'ACCEPTED', labelKey: 'supplierDebitNotes.tabs.accepted' },
  { id: 'refused', status: 'REFUSED', labelKey: 'supplierDebitNotes.tabs.refused' },
]

export const DEFAULT_DEBIT_TAB: DebitTabId = 'unchecked'

export function isDebitTab(value: string | null): value is DebitTabId {
  return DEBIT_TABS.some((tab) => tab.id === value)
}

export type DebitNoteItem = {
  id: string
  number: string | null
  issueDate: string | null
  dueDate: string | null
  /** The server's judgment. Never recomputed from the due date here — see the Bills list. */
  overdue: boolean
  supplier: string | null
  source: NoteSourceBadge
  networkVerified: boolean
  relatesToBillNumber: string | null
  reasonCode: string | null
  status: DebitNoteStatusDto
  decisionReason: string | null
  decidedAt: string | null
  currency: string
  total: number | null
  outstanding: number
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
    source: SOURCE[row.source],
    networkVerified: row.networkVerified,
    relatesToBillNumber: row.relatesTo?.billNumber ?? null,
    reasonCode: row.reasonCode,
    status: row.status,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt,
    currency: row.currencyCode,
    total: row.totalIncludingVat,
    outstanding: row.outstandingAmount,
    owes: row.status !== 'REFUSED' && row.outstandingAmount > 0,
  }
}

/**
 * The CL-02-OM reason as something to read. A code with no label is shown as the code: inventing
 * a sentence for it would put words in the supplier's mouth, and a blank would hide that they
 * gave a reason at all.
 */
export function reasonLabelKey(code: string | null): { key: string; fallback: string } | null {
  if (!code) return null
  return { key: `expenditureNotes.reason.${code}`, fallback: code }
}

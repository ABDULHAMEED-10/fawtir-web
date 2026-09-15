import type {
  BillingChannel,
  SupplierListFilter,
  SupplierListRowDto,
  SupplierListSort,
  SupplierSummaryDto,
} from '../api/expenditure/suppliers'
import { initialsOf } from './format'

/**
 * The Suppliers list (Figma 117:31875) as the screen draws it, built from `GET /v1/suppliers`.
 *
 * The mock rows this replaced carried per-row sentences ("both approved", "July's bill hasn't
 * arrived") the API has no data for. Each note here is written only from fields the row really
 * carries, and is left out when the row cannot support it.
 */

export type SupplierChannel = 'peppol' | 'emailPdf' | 'paper' | 'manual'

/** What, if anything, is wrong with the record, worst first when several are. */
export type RecordIssue = 'complete' | 'bankChanged' | 'noBankDetails' | 'noVatNumber' | 'notOnPeppol' | 'switchedOff'

export type Note = { key: string; values?: Record<string, number | string> }

export type SupplierListItem = {
  id: string
  name: string
  initials: string
  vat: string | null
  channel: SupplierChannel
  /** Under the channel chip: the participant identifier, or why bills come the way they do. */
  channelNote: Note | { text: string } | null
  terms: Note | { text: string }
  termsNote: Note | null
  owed: number
  currency: string
  openBills: number
  owedNote: Note
  /** Something on hold makes the owed line a warning. */
  owedAlert: boolean
  issue: RecordIssue
  /** Out of four: the filled dots in "their record". */
  score: number
  recordNote: Note | null
  active: boolean
}

const CHANNEL: Record<BillingChannel, SupplierChannel> = {
  PEPPOL: 'peppol',
  EMAIL_PDF: 'emailPdf',
  PAPER: 'paper',
  MANUAL: 'manual',
}

/**
 * A bank account changed and not yet confirmed is where a payment can go to a fraudster, so it
 * is the issue a row shows when it has more than one.
 */
function issueOf(row: SupplierListRowDto): RecordIssue {
  if (row.status === 'SWITCHED_OFF') return 'switchedOff'
  const health = row.record.health
  if (health.includes('BANK_CHANGED_UNCONFIRMED')) return 'bankChanged'
  if (health.includes('NO_BANK_DETAILS')) return 'noBankDetails'
  if (health.includes('NO_VAT_NUMBER')) return 'noVatNumber'
  if (row.billingChannel !== 'PEPPOL') return 'notOnPeppol'
  return 'complete'
}

/**
 * The four dots: bank details on file, bank details confirmed, a VAT number, and bills arriving
 * over Peppol. The design draws the dots without defining them, and these are the four facts the
 * row carries about the record's quality.
 */
function scoreOf(row: SupplierListRowDto): number {
  if (row.status === 'SWITCHED_OFF') return 0
  const health = row.record.health
  return [
    !health.includes('NO_BANK_DETAILS'),
    !health.includes('BANK_CHANGED_UNCONFIRMED'),
    !health.includes('NO_VAT_NUMBER'),
    row.billingChannel === 'PEPPOL',
  ].filter(Boolean).length
}

function channelNoteOf(row: SupplierListRowDto): SupplierListItem['channelNote'] {
  if (row.selfBilling) return { key: 'suppliersPage.channelNote.selfBilled' }
  return row.participantId ? { text: row.participantId } : null
}

function termsOf(row: SupplierListRowDto): SupplierListItem['terms'] {
  // The API reads DUE_ON_RECEIPT, IMMEDIATE and COD as zero net days (`SupplierTerms`).
  if (row.terms.netDays === 0) return { key: 'suppliersPage.terms.onReceipt' }
  if (row.terms.netDays !== null) return { key: 'suppliersPage.terms.netDays', values: { count: row.terms.netDays } }
  // Free text the tenant typed on the supplier form. It is their data, shown as they wrote it.
  if (row.terms.paymentTerms) return { text: row.terms.paymentTerms }
  return { key: 'suppliersPage.terms.none' }
}

function termsNoteOf(row: SupplierListRowDto): Note | null {
  const { earlyPaymentDiscountPercent: percent, earlyPaymentDiscountDays: days } = row.terms
  if (percent === null || days === null || percent <= 0) return null
  return { key: 'suppliersPage.termsNote.earlyDiscount', values: { percent, days } }
}

function owedNoteOf(row: SupplierListRowDto): Note {
  const { openBills, onHold } = row.youOwe
  if (openBills === 0) return { key: 'suppliersPage.owedNote.nothingOpen' }
  if (onHold > 0) return { key: 'suppliersPage.owedNote.openWithHold', values: { count: openBills, held: onHold } }
  return { key: 'suppliersPage.owedNote.open', values: { count: openBills } }
}

function recordNoteOf(row: SupplierListRowDto, issue: RecordIssue): Note | null {
  if (issue === 'bankChanged') return { key: 'suppliersPage.recordNote.confirmBeforeRun' }
  if (issue === 'noVatNumber') return { key: 'suppliersPage.recordNote.cantReclaim' }
  if (row.record.settledCount > 0) {
    return {
      key: 'suppliersPage.recordNote.paidOnTime',
      values: { onTime: row.record.paidOnTimeCount, settled: row.record.settledCount },
    }
  }
  return null
}

export function toSupplierListItem(row: SupplierListRowDto): SupplierListItem {
  const issue = issueOf(row)
  return {
    id: row.id,
    name: row.displayName,
    initials: initialsOf(row.displayName),
    vat: row.vatNumber,
    channel: CHANNEL[row.billingChannel] ?? 'manual',
    channelNote: channelNoteOf(row),
    terms: termsOf(row),
    termsNote: termsNoteOf(row),
    owed: row.youOwe.amount,
    currency: row.youOwe.currency,
    openBills: row.youOwe.openBills,
    owedNote: owedNoteOf(row),
    owedAlert: row.youOwe.onHold > 0,
    issue,
    score: scoreOf(row),
    recordNote: recordNoteOf(row, issue),
    active: row.status === 'ACTIVE',
  }
}

/** The action offered on each row follows from what is wrong with it. */
export const ROW_ACTION: Record<RecordIssue, string> = {
  complete: 'suppliersPage.rowAction.newBill',
  bankChanged: 'suppliersPage.rowAction.checkIt',
  noBankDetails: 'suppliersPage.rowAction.addIt',
  noVatNumber: 'suppliersPage.rowAction.addIt',
  notOnPeppol: 'suppliersPage.rowAction.chaseIt',
  switchedOff: 'suppliersPage.rowAction.turnBackOn',
}

/** Labels for the issue column. The mock's "Bank changed 4d ago" had a date the list cannot know. */
export const RECORD_LABEL: Record<RecordIssue, string> = {
  complete: 'suppliersPage.record.complete',
  bankChanged: 'suppliersPage.record.bankChangedUnconfirmed',
  noBankDetails: 'suppliersPage.record.noBankDetails',
  noVatNumber: 'suppliersPage.record.noVatNumber',
  notOnPeppol: 'suppliersPage.record.notOnPeppol',
  switchedOff: 'suppliersPage.record.switchedOff',
}

/* --------------------------------------------------------------------- tabs */

export type SupplierTabId = 'all' | 'active' | 'needsFix' | 'youOwe' | 'notOnPeppol' | 'switchedOff'

export const SUPPLIER_TABS: { id: SupplierTabId; labelKey: string; filter: SupplierListFilter }[] = [
  { id: 'all', labelKey: 'suppliersPage.tabs.all', filter: 'ALL' },
  { id: 'active', labelKey: 'suppliersPage.tabs.active', filter: 'ACTIVE' },
  { id: 'needsFix', labelKey: 'suppliersPage.tabs.needsFix', filter: 'NEEDS_FIX' },
  { id: 'youOwe', labelKey: 'suppliersPage.tabs.youOwe', filter: 'OWED' },
  { id: 'notOnPeppol', labelKey: 'suppliersPage.tabs.notOnPeppol', filter: 'NOT_ON_PEPPOL' },
  { id: 'switchedOff', labelKey: 'suppliersPage.tabs.switchedOff', filter: 'SWITCHED_OFF' },
]

export function isSupplierTab(value: string | null): value is SupplierTabId {
  return SUPPLIER_TABS.some((tab) => tab.id === value)
}

/**
 * Each tab's count, taken from the summary, which counts over the whole directory with the same
 * predicates as the tab. "Needs fix" and "You owe" use the per-supplier counts, because the
 * per-flag ones overlap.
 */
export function tabCount(summary: SupplierSummaryDto, tab: SupplierTabId): number {
  switch (tab) {
    case 'all':
      return summary.total
    case 'active':
      return summary.active
    case 'needsFix':
      return summary.needsFixSuppliers
    case 'youOwe':
      return summary.owedSuppliers
    case 'notOnPeppol':
      return summary.notOnPeppol
    case 'switchedOff':
      return summary.switchedOff
  }
}

/* ------------------------------------------------------------------ sorting */

export type SupplierSortKey = 'nameAsc' | 'owedDesc' | 'owedAsc'

export const SUPPLIER_SORTS: { value: SupplierSortKey; labelKey: string; sort: SupplierListSort }[] = [
  { value: 'nameAsc', labelKey: 'suppliersPage.sortOptions.nameAsc', sort: 'NAME' },
  { value: 'owedDesc', labelKey: 'suppliersPage.sortOptions.owedDesc', sort: 'OWED_DESC' },
  { value: 'owedAsc', labelKey: 'suppliersPage.sortOptions.owedAsc', sort: 'OWED_ASC' },
]

export function isSupplierSort(value: string | null): value is SupplierSortKey {
  return SUPPLIER_SORTS.some((option) => option.value === value)
}

/** Rows per page. The API allows up to 200; the design shows a short page. */
export const SUPPLIER_PAGE_SIZE = 10

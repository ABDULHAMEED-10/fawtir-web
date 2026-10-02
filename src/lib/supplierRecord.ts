import type { SupplierAddressDto, SupplierDetailDto } from '../api/expenditure/suppliers'
import type {
  DocumentKeep,
  DocumentKind,
  SupplierDocumentDto,
  SupplierOverviewDto,
  SupplierPaymentDto,
} from '../api/expenditure/supplierRecord'
import type { ApiDownload } from '../api/client'
import type { ContactPurpose } from '../api/expenditure/supplierRecord'
import * as validate from './validation'

/**
 * A supplier's record page (decisions of 2026-09-17, E-03/E-04), written only from what the API
 * holds. The design's paid-on-time share, average days to pay, spend this year, open order value,
 * "added by", per-bill discount savings, unused credit, price notes and the header's payment run
 * have nothing behind them and are not drawn.
 */

export type Note = { key: string; values?: Record<string, string | number> }

export type DetailTabId = 'overview' | 'bills' | 'payments' | 'orders' | 'documents'

export const DETAIL_TABS: DetailTabId[] = ['overview', 'bills', 'payments', 'orders', 'documents']

export function tabCount(tab: DetailTabId, overview: SupplierOverviewDto | null): number | null {
  if (!overview || tab === 'overview') return null
  return overview.tabs[tab]
}

/**
 * "Net 30 days" from `NET30` or `NET_30`, "Due on receipt" from `NET0` or `DUE_ON_RECEIPT`; a code
 * this build does not know is shown as it is.
 *
 * Both spellings are real: the seeded suppliers carry `NET_10` and `DUE_ON_RECEIPT`, which read as
 * "Terms NET_10" until the underscore was allowed for (E-05 browser check).
 */
export function termsNote(code: string | null): Note | null {
  if (!code || !code.trim()) return null
  if (code === 'DUE_ON_RECEIPT') return { key: 'supplierRecord.terms.onReceipt' }
  const net = /^NET_?(\d+)$/.exec(code)
  if (!net) return { key: 'supplierRecord.terms.raw', values: { code } }
  const days = Number(net[1])
  return days === 0 ? { key: 'supplierRecord.terms.onReceipt' } : { key: 'supplierRecord.terms.net', values: { count: days } }
}

export function earlySettlementNote(profile: SupplierDetailDto['profile']): Note {
  const { earlyPaymentDiscountPercent: percent, earlyPaymentDiscountDays: days } = profile
  return percent === null || days === null
    ? { key: 'supplierRecord.early.none' }
    : { key: 'supplierRecord.early.offer', values: { percent, count: days } }
}

/** One line, the parts that are there, in the order a letter would carry them. */
export function addressLine(address: SupplierAddressDto | null): string | null {
  if (!address) return null
  const parts = [
    address.buildingNumber,
    address.streetName,
    address.additionalStreetName,
    address.cityName,
    address.countrySubentity,
    address.postalCode,
    address.countryCode,
  ].filter((part): part is string => Boolean(part && part.trim()))
  return parts.length > 0 ? parts.join(', ') : null
}

export type Band = { id: 'notDue' | 'dueSoon' | 'late' | 'onHold'; amount: number; bills: number; nextDue: string | null }

/** What is owed, in the four bands the design draws, with the share of the bar each takes. */
export function bandsOf(overview: SupplierOverviewDto): { bands: Band[]; total: number } {
  const p = overview.payables
  const bands: Band[] = [
    { id: 'notDue', ...p.notDue },
    { id: 'dueSoon', ...p.dueSoon },
    { id: 'late', ...p.late },
    { id: 'onHold', ...p.onHold },
  ]
  const total = bands.reduce((sum, band) => sum + band.amount, 0)
  return { bands, total }
}

export type PaymentLine = SupplierPaymentDto & { reversed: boolean }

/** Payments as a person reads them: a reversal is folded into the payment it undoes, not listed as one. */
export function paymentLines(payments: readonly SupplierPaymentDto[]): PaymentLine[] {
  const reversed = new Set(payments.filter((row) => row.entryType === 'REVERSAL' && row.reversalOfPaymentId).map((row) => row.reversalOfPaymentId!))
  return payments.filter((row) => row.entryType === 'PAYMENT').map((row) => ({ ...row, reversed: reversed.has(row.id) }))
}

export function documentMeta(entry: SupplierDocumentDto): Note {
  const d = entry.document
  if (d.documentDate) return { key: 'supplierRecord.documents.dated', values: { date: d.documentDate } }
  return { key: 'supplierRecord.documents.uploaded', values: { date: d.uploadedAt.slice(0, 10) } }
}

export function fileSize(bytes: number, language: string): string {
  const format = (value: number, unit: 'byte' | 'kilobyte' | 'megabyte') =>
    new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value)
  if (bytes < 1024) return format(bytes, 'byte')
  if (bytes < 1024 * 1024) return format(bytes / 1024, 'kilobyte')
  return format(bytes / (1024 * 1024), 'megabyte')
}

/**
 * Whether the server would let the paper go. The server says so itself (`removable`: no legal
 * hold, and kept until deleted or past its date). A server from before that field is answered
 * for as before: not frozen, and past its Art. 70 retention date
 * (`RetentionPolicy.assertRemovable` refuses on or before `retainUntil`).
 */
export function documentRemovable(entry: SupplierDocumentDto, today: string): boolean {
  if (typeof entry.removable === 'boolean') return entry.removable
  const d = entry.document
  if (d.legalHold.held) return false
  return d.retainUntil === null || d.retainUntil < today
}

/** The upload screen's "How long to keep it" choices (Figma 154:140599). */
export type KeepChoice = 'forever' | 'matchInvoice' | 'untilDate'

/** A bill, a credit note or a debit note: always under the ten-year rule (owner, 2 Oct 2026). */
const TAX_DOCUMENT_KINDS: ReadonlySet<string> = new Set(['BILL', 'CREDIT_NOTE', 'DEBIT_NOTE'])

export function isTaxDocumentKind(kind: string): boolean {
  return TAX_DOCUMENT_KINDS.has(kind)
}

/**
 * The choices offered for a kind of paper. A tax document is always kept under the ten-year rule
 * and cannot be set to delete, so the two choices that would let it go are not offered (hidden,
 * not disabled); the one left says which rule applies.
 */
export function keepChoicesFor(kind: DocumentKind): KeepChoice[] {
  return isTaxDocumentKind(kind) ? ['matchInvoice'] : ['forever', 'matchInvoice', 'untilDate']
}

/**
 * What the upload sends as `keep`. "Until a date I choose" has nothing behind it on the server
 * (no dated deletion, no date field), so such a paper is kept until someone deletes it, which is
 * the only rule that lets it go on the day chosen.
 * TODO(backend): DOCUMENTS.md row 3.14, a dated deletion.
 */
export function keepToSend(kind: DocumentKind, choice: KeepChoice): DocumentKeep {
  if (isTaxDocumentKind(kind) || choice === 'matchInvoice') return 'TEN_YEAR_RULE'
  return 'UNTIL_DELETED'
}

const FORM_KINDS: ReadonlySet<string> = new Set([
  'AGREEMENT',
  'CERTIFICATE',
  'PRICE_LIST',
  'CORRESPONDENCE',
  'OTHER',
])

/**
 * What a paper's kind is called on the supplier's Documents tab. The three tax documents read in
 * words the app already has; a kind this build does not know reads "Other", never as a key.
 */
export function documentKindLabelKey(kind: string): string {
  if (FORM_KINDS.has(kind)) return `supplierRecord.kind.${kind}`
  if (kind === 'BILL') return 'billDetail.breadcrumbBill'
  if (kind === 'CREDIT_NOTE' || kind === 'DEBIT_NOTE') return `documents.kind.${kind}`
  return 'supplierRecord.kind.OTHER'
}

/** The current calendar year to date, the window a statement defaults to. */
export function yearToDate(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 4)}-01-01`, to: today }
}

/** Hands a downloaded file to the browser, as the other exports do. */
export function saveDownload(file: ApiDownload, fallbackName: string): void {
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename ?? fallbackName
  link.click()
  URL.revokeObjectURL(url)
}

export type ContactForm = { id: string | null; version: number | undefined; fullName: string; roleTitle: string; purpose: ContactPurpose; email: string; telephone: string; mobilePhone: string; notes: string }

export const blankContact = (hasMain: boolean): ContactForm => ({
  id: null,
  version: undefined,
  fullName: '',
  roleTitle: '',
  purpose: hasMain ? 'BILLING' : 'MAIN',
  email: '',
  telephone: '',
  mobilePhone: '',
  notes: '',
})

/** What the server would refuse about a contact, said first: a name, and one way to reach them. */
export function contactProblems(form: ContactForm): Partial<Record<'fullName' | 'email' | 'telephone' | 'mobilePhone' | 'channel', string>> {
  const problems: Partial<Record<'fullName' | 'email' | 'telephone' | 'mobilePhone' | 'channel', string>> = {}
  if (!form.fullName.trim()) problems.fullName = 'validation.required'
  if (form.email.trim() && validate.email(form.email)) problems.email = 'validation.email'
  for (const field of ['telephone', 'mobilePhone'] as const) {
    const value = form[field].trim()
    if (!value) continue
    const refused = value.startsWith('+') ? (/^\+[1-9][0-9]{6,14}$/.test(value.replace(/[\s().-]/g, '')) ? undefined : 'supplierForm.error.phone') : validate.omanPhone(value)
    if (refused) problems[field] = refused
  }
  if (!form.email.trim() && !form.telephone.trim() && !form.mobilePhone.trim()) problems.channel = 'supplierRecord.contacts.channelRequired'
  return problems
}


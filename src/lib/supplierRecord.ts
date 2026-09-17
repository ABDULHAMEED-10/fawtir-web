import type { SupplierAddressDto, SupplierDetailDto } from '../api/expenditure/suppliers'
import type { SupplierDocumentDto, SupplierOverviewDto, SupplierPaymentDto } from '../api/expenditure/supplierRecord'
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

/** "Net 30 days" from `NET30`, "On receipt" from `NET0`; a code this build does not know is shown as it is. */
export function termsNote(code: string | null): Note | null {
  if (!code) return null
  const net = /^NET(\d+)$/.exec(code)
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
 * Whether the server would let the paper go: not frozen, and past its Art. 70 retention date
 * (`RetentionPolicy.assertRemovable` refuses on or before `retainUntil`).
 */
export function documentRemovable(entry: SupplierDocumentDto, today: string): boolean {
  const d = entry.document
  if (d.legalHold.held) return false
  return d.retainUntil === null || d.retainUntil < today
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


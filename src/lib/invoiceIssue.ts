import { ApiError } from '../api'
import type { ReferenceDataDto } from '../api/reference/referenceData'
import { netDaysFor } from './reference/referenceData'
import { TAX_REASON_REFUSALS } from './taxReasonRefusals'
import { DEBIT_NOTE_REFUSALS } from './debitNoteRefusals'

/**
 * Issuing a draft: the dates it is issued with, what the server would refuse about them, and the
 * words for each refusal (decisions of 2026-09-16, I-07).
 *
 * Issuing gives the draft its number and its figures and ends editing. It sends nothing — the
 * issued invoice's delivery is blocked on the server — so no sentence here says it was sent.
 */

export type IssueField = 'issueDate' | 'dueDate'
export type IssueForm = { issueDate: string; dueDate: string }

/** The Oman calendar day, which is the day an invoice is issued on. */
export function muscatToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(now)
}

export function plusDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/**
 * The due date the terms give. The API stores terms as a code and a label with no day count, so
 * terms this build does not know fall back to the issue date and the reader sets the date.
 */
export function dueDateFor(
  reference: ReferenceDataDto | null,
  issueDate: string,
  termsCode: string | null | undefined,
): string {
  const days = netDaysFor(reference, termsCode) ?? undefined
  return plusDays(issueDate, days ?? 0)
}

/** What the server would refuse about the dates, said before the request goes. */
export function issueProblems(form: IssueForm, today: string): Partial<Record<IssueField, string>> {
  const problems: Partial<Record<IssueField, string>> = {}
  if (!form.issueDate) problems.issueDate = 'invoiceIssue.error.issueDateRequired'
  else if (form.issueDate > today) problems.issueDate = 'invoiceIssue.error.issueDateFuture'
  else if (form.issueDate.slice(0, 4) !== today.slice(0, 4))
    problems.issueDate = 'invoiceIssue.error.issueDateYear'
  if (!form.dueDate) problems.dueDate = 'invoiceIssue.error.dueDateRequired'
  else if (form.issueDate && form.dueDate < form.issueDate)
    problems.dueDate = 'invoiceIssue.error.dueDateBeforeIssue'
  return problems
}

/**
 * Refusals the reader can act on, each with its sentence, and the date field it belongs to where
 * there is one. The readiness reasons and QUOTA_EXCEEDED arrive as `code` on a 409 since backend
 * I-07; the rest are the issue route's own codes.
 */
export const ISSUE_REFUSALS: Record<string, { field: IssueField | null; key: string }> = {
  ISSUE_DATE_IN_FUTURE: { field: 'issueDate', key: 'invoiceIssue.error.issueDateFuture' },
  ISSUE_DATE_OUTSIDE_CURRENT_YEAR: { field: 'issueDate', key: 'invoiceIssue.error.issueDateYear' },
  PERIOD_CLOSED: { field: 'issueDate', key: 'invoiceIssue.error.periodClosed' },
  DUE_DATE_BEFORE_ISSUE_DATE: { field: 'dueDate', key: 'invoiceIssue.error.dueDateBeforeIssue' },

  COMPANY_VERIFICATION_PENDING: { field: null, key: 'invoiceIssue.refused.companyPending' },
  COMPANY_VERIFICATION_REJECTED: { field: null, key: 'invoiceIssue.refused.companyRejected' },
  TENANT_NOT_ACTIVE: { field: null, key: 'invoiceIssue.refused.tenantInactive' },
  TENANT_DISABLED: { field: null, key: 'invoiceIssue.refused.tenantInactive' },
  QUOTA_EXCEEDED: { field: null, key: 'invoiceIssue.refused.quota' },
  TENANT_TIMEZONE_UNAVAILABLE: { field: null, key: 'invoiceIssue.refused.timezone' },
  // Backend 073d5261c (QR-E2), 422 before a number is taken: a zone that does not keep Muscat time.
  TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE: { field: null, key: 'invoiceIssue.refused.timezoneNotOman' },
  SELLER_PARTICIPANT_NOT_VERIFIED: { field: null, key: 'invoiceIssue.refused.sellerParticipant' },
  SELLER_NOT_VERIFIED: { field: null, key: 'invoiceIssue.refused.companyPending' },
  SELLER_ADDRESS_INCOMPLETE: { field: null, key: 'invoiceIssue.refused.sellerAddressIncomplete' },
  SELLER_CONTACT_INCOMPLETE: { field: null, key: 'invoiceIssue.refused.sellerContactIncomplete' },
  CUSTOMER_NOT_INVOICE_ELIGIBLE: { field: null, key: 'invoiceIssue.refused.customerIncomplete' },
  // Backend #817 (A-2): a standard invoice to a customer reached over Peppol whose invoice address
  // lacks a member IBR-019-OM requires; refused at issue so no number is spent on an invoice the
  // Send would dead-letter for good.
  BUYER_ADDRESS_INCOMPLETE: { field: null, key: 'invoiceIssue.refused.buyerAddressIncomplete' },
  INDUSTRIAL_CLASSIFICATION_REQUIRED: { field: null, key: 'invoiceIssue.refused.activityRequired' },
  // A draft saved before the goods/HS rule (GoodsHsCodeRequirement) and issued as it stands; the
  // composer checks the line before it saves, so this is the server's own refusal at issue.
  HS_CODE_REQUIRED: { field: null, key: 'invoiceIssue.refused.hsCodeRequired' },
  // Backend 8f04050ab (HS Slice B, IBR-078-OM): a line of a non-simplified document stating neither
  // goods nor services, refused at issue before a number is taken.
  GOODS_OR_SERVICE_REQUIRED: { field: null, key: 'invoiceIssue.refused.goodsOrServiceRequired' },
  CUSTOMER_NOT_SELECTABLE: { field: null, key: 'invoiceIssue.refused.customerNotSelectable' },
  PAYMENT_TERMS_REQUIRED: { field: null, key: 'invoiceIssue.refused.termsRequired' },
  BRANCH_NOT_ACTIVE: { field: null, key: 'invoiceIssue.refused.branchInactive' },
  PRODUCT_NOT_FOUND: { field: null, key: 'invoiceIssue.refused.productMissing' },
  PRODUCT_ARCHIVED: { field: null, key: 'invoiceIssue.refused.productArchived' },
  PRODUCT_CODE_MISMATCH: { field: null, key: 'invoiceIssue.refused.productMissing' },
  STALE_INVOICE_VERSION: { field: null, key: 'invoiceIssue.refused.stale' },
  INVOICE_NOT_ISSUABLE: { field: null, key: 'invoiceIssue.refused.notDraft' },
  REFERENCE_CATALOGUE_NOT_AVAILABLE: { field: null, key: 'invoiceIssue.refused.unavailable' },

  CORRECTION_REASON_CODE_REQUIRED: { field: null, key: 'salesNote.error.reason' },
  CORRECTED_INVOICE_NOT_ISSUED: { field: null, key: 'salesNote.refused.invoiceNotIssued' },
  CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT: { field: null, key: 'salesNote.refused.exceeds' },
  CREDIT_NOTE_NOTHING_CORRECTABLE: { field: null, key: 'salesNote.refused.nothingLeft' },
  // The cumulative caps (DA-1 option B), said without figures where only the code is read: a note
  // draft issued from its own page. The composer names the line or rate (creditCapRefusal).
  CREDIT_NOTE_EXCEEDS_LINE_REMAINING: { field: null, key: 'salesNote.refused.lineRemaining' },
  CREDIT_NOTE_EXCEEDS_VAT_CATEGORY_REMAINING: { field: null, key: 'salesNote.refused.categoryRemaining' },
  CREDIT_NOTE_VAT_CATEGORY_NOT_ON_ORIGINAL: { field: null, key: 'salesNote.refused.categoryNotOnInvoice' },

  // A zero-rated or exempt line with no reason, or the wrong list's reason: fixed on the draft.
  ...Object.fromEntries(
    Object.entries(TAX_REASON_REFUSALS).map(([code, key]) => [code, { field: null, key }]),
  ),
  // D-26: named here, or the readiness fallback below would print the bare code.
  ...Object.fromEntries(
    Object.entries(DEBIT_NOTE_REFUSALS).map(([code, key]) => [code, { field: null, key }]),
  ),
}

/** A readiness 409 whose reason this build has no sentence for still says what kind of refusal it is. */
export function issueRefusalOf(
  error: unknown,
): { field: IssueField | null; key: string; values?: Record<string, string> } | null {
  if (!(error instanceof ApiError)) return null
  if (error.code && Object.hasOwn(ISSUE_REFUSALS, error.code)) return ISSUE_REFUSALS[error.code]
  if (error.status === 409 && error.problemType === 'resource-conflict' && error.code) {
    return { field: null, key: 'invoiceIssue.refused.notReady', values: { reason: error.code } }
  }
  return null
}

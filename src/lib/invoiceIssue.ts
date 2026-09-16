import { ApiError } from '../api'
import { PAYMENT_TERM_DAYS } from './catalogues'

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
export function dueDateFor(issueDate: string, termsCode: string | null | undefined): string {
  const days = termsCode ? PAYMENT_TERM_DAYS[termsCode] : undefined
  return plusDays(issueDate, days ?? 0)
}

/** What the server would refuse about the dates, said before the request goes. */
export function issueProblems(form: IssueForm, today: string): Partial<Record<IssueField, string>> {
  const problems: Partial<Record<IssueField, string>> = {}
  if (!form.issueDate) problems.issueDate = 'invoiceIssue.error.issueDateRequired'
  else if (form.issueDate > today) problems.issueDate = 'invoiceIssue.error.issueDateFuture'
  else if (form.issueDate.slice(0, 4) !== today.slice(0, 4)) problems.issueDate = 'invoiceIssue.error.issueDateYear'
  if (!form.dueDate) problems.dueDate = 'invoiceIssue.error.dueDateRequired'
  else if (form.issueDate && form.dueDate < form.issueDate) problems.dueDate = 'invoiceIssue.error.dueDateBeforeIssue'
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
  SELLER_PARTICIPANT_NOT_VERIFIED: { field: null, key: 'invoiceIssue.refused.sellerParticipant' },
  SELLER_NOT_VERIFIED: { field: null, key: 'invoiceIssue.refused.companyPending' },
  CUSTOMER_NOT_INVOICE_ELIGIBLE: { field: null, key: 'invoiceIssue.refused.customerIncomplete' },
  CUSTOMER_NOT_SELECTABLE: { field: null, key: 'invoiceIssue.refused.customerNotSelectable' },
  PAYMENT_TERMS_REQUIRED: { field: null, key: 'invoiceIssue.refused.termsRequired' },
  BRANCH_NOT_ACTIVE: { field: null, key: 'invoiceIssue.refused.branchInactive' },
  PRODUCT_NOT_FOUND: { field: null, key: 'invoiceIssue.refused.productMissing' },
  PRODUCT_ARCHIVED: { field: null, key: 'invoiceIssue.refused.productArchived' },
  PRODUCT_CODE_MISMATCH: { field: null, key: 'invoiceIssue.refused.productMissing' },
  STALE_INVOICE_VERSION: { field: null, key: 'invoiceIssue.refused.stale' },
  INVOICE_NOT_ISSUABLE: { field: null, key: 'invoiceIssue.refused.notDraft' },
  REFERENCE_CATALOGUE_NOT_AVAILABLE: { field: null, key: 'invoiceIssue.refused.unavailable' },
}

/** A readiness 409 whose reason this build has no sentence for still says what kind of refusal it is. */
export function issueRefusalOf(error: unknown): { field: IssueField | null; key: string; values?: Record<string, string> } | null {
  if (!(error instanceof ApiError)) return null
  if (error.code && ISSUE_REFUSALS[error.code]) return ISSUE_REFUSALS[error.code]
  if (error.status === 409 && error.problemType === 'resource-conflict' && error.code) {
    return { field: null, key: 'invoiceIssue.refused.notReady', values: { reason: error.code } }
  }
  return null
}

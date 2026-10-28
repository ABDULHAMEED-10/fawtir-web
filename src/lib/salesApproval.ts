import { ApiError } from '../api/errors'
import type {
  SalesApprovalCovers,
  SalesApprovalDto,
  SalesApprovalRuleChange,
  SalesApprovalRuleDto,
} from '../api/invoices/salesApproval'
import {
  approversProblem,
  thresholdProblem,
  type ApprovalProblem,
  type ThresholdMode,
} from './approvalPolicy'

/**
 * Sales approval (RL-6) for the screens: the rule form, which draft actions to offer, and our own
 * sentence for each refusal the server names. The server stays the authority on every one of
 * these; the screen only avoids offering what it would refuse.
 */

/** The server's codes, each to one sentence of ours; the server's `detail` is never shown. */
const REFUSALS: Record<string, string> = {
  SALES_APPROVER_IS_PREPARER: 'salesApproval.refused.preparer',
  SALES_APPROVAL_DRAFT_CHANGED: 'salesApproval.refused.changed',
  SALES_APPROVAL_NO_APPROVER: 'salesApproval.refused.noApprover',
  SALES_APPROVAL_ALREADY_PENDING: 'salesApproval.refused.alreadyPending',
  SALES_APPROVAL_ALREADY_APPROVED: 'salesApproval.refused.alreadyApproved',
  SALES_APPROVAL_NOT_REQUIRED: 'salesApproval.refused.notRequired',
  SALES_APPROVAL_NOT_PENDING: 'salesApproval.refused.notPending',
  SALES_APPROVAL_PENDING_EDIT: 'salesApproval.refused.pendingEdit',
  SALES_APPROVAL_REQUIRED: 'salesApproval.refused.required',
  SALES_APPROVAL_PENDING: 'salesApproval.refused.pending',
  SALES_APPROVAL_REJECTED: 'salesApproval.refused.rejected',
  SALES_APPROVAL_REASON_REQUIRED: 'salesApproval.refused.reasonRequired',
  SALES_APPROVAL_TEXT_TOO_LONG: 'salesApproval.refused.tooLong',
  SALES_APPROVAL_TYPE_PERMISSION_REQUIRED: 'salesApproval.refused.typePermission',
  SALES_APPROVAL_RULE_VERSION_CONFLICT: 'salesApproval.refused.ruleChanged',
  SALES_APPROVAL_RULE_EMPTY: 'salesApproval.refused.ruleEmpty',
  SALES_APPROVAL_UNAVAILABLE: 'salesApproval.refused.unavailable',
  STALE_INVOICE_VERSION: 'salesApproval.refused.changed',
}

/** Our sentence for a sales approval refusal, or null when the failure is not one. */
export function salesApprovalMessageKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  return Object.hasOwn(REFUSALS, error.code) ? REFUSALS[error.code] : null
}

/**
 * Issue refusals whose way on is the draft's approval card: not yet sent, or sent and not
 * approved. The composer has no approval actions, so from there the refusal links to the draft.
 */
export function sendsForApprovalFromDraft(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'SALES_APPROVAL_REQUIRED' || error.code === 'SALES_APPROVAL_REJECTED')
  )
}

/** The codes this build has a sentence for. Exported so a test can pin the set. */
export const MAPPED_SALES_APPROVAL_CODES = Object.freeze(Object.keys(REFUSALS))

/**
 * Sales approval is switched off on this deployment: the server's 503 `SALES_APPROVAL_UNAVAILABLE`.
 * Any other 503 is an outage and is reported as one.
 */
export function isSalesApprovalUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 503 && error.code === 'SALES_APPROVAL_UNAVAILABLE'
  )
}

/**
 * Whether this deployment offers sales approval at all: the rule read says `available: true`.
 * The rule reads 200 whether or not the deployment's switch is on, so only this field tells them
 * apart; a server older than the field omits it, and that counts as off. `awaitingApproval` on the
 * summary is no signal: it is always present, 0 with the switch off.
 */
export function salesApprovalAvailable(rule: SalesApprovalRuleDto | null): boolean {
  return rule !== null && rule.available === true
}

/**
 * Whether the screens offer sales approval to its approvers (the "To approve" tab): the
 * deployment offers it and the company rule is on. A rule left on when the switch was turned off
 * (a rollback) holds nothing, so it draws no tab.
 */
export function salesApprovalIsOn(rule: SalesApprovalRuleDto | null): boolean {
  return rule !== null && salesApprovalAvailable(rule) && rule.enabled
}

/**
 * Whether issuing waits on approval. Approved and not-required drafts issue as before; a draft not
 * yet sent, waiting, or not approved does not. The server holds the same line at issue.
 */
export function issueWaitsOnApproval(approval: SalesApprovalDto | null): boolean {
  if (approval === null) return false
  return (
    approval.status === 'NOT_REQUESTED' ||
    approval.status === 'PENDING' ||
    approval.status === 'REJECTED'
  )
}

/** A waiting draft cannot be edited until its request is withdrawn (the server refuses it). */
export function editWaitsOnApproval(approval: SalesApprovalDto | null): boolean {
  return approval !== null && approval.status === 'PENDING'
}

export type SalesApprovalRuleForm = {
  enabled: boolean
  covers: SalesApprovalCovers
  requiredApprovals: string
  mode: ThresholdMode
  threshold: string
}

export const COVER_KEYS: (keyof SalesApprovalCovers)[] = [
  'invoice',
  'creditNote',
  'debitNote',
  'selfBilled',
]

export function ruleFormOf(rule: SalesApprovalRuleDto): SalesApprovalRuleForm {
  return {
    enabled: rule.enabled,
    covers: { ...rule.covers },
    requiredApprovals: String(rule.requiredApprovals),
    mode: rule.autoApproveBelow === null ? 'EVERY_BILL' : 'BELOW_AMOUNT',
    threshold: rule.autoApproveBelow === null ? '' : String(rule.autoApproveBelow),
  }
}

export type RuleProblem = ApprovalProblem | 'coversNothing'

/** The server's `SALES_APPROVAL_RULE_EMPTY`: a rule that is on must cover a document type. */
export function coversProblem(form: SalesApprovalRuleForm): RuleProblem | null {
  if (!form.enabled) return null
  return COVER_KEYS.some((key) => form.covers[key]) ? null : 'coversNothing'
}

/** The change this form would send, or null while it is not sendable. Replaces the rule whole. */
export function ruleChangeOf(
  form: SalesApprovalRuleForm,
  expectedVersion: number,
): SalesApprovalRuleChange | null {
  if (approversProblem(form.requiredApprovals) !== null) return null
  if (thresholdProblem(form.threshold, form.mode) !== null) return null
  if (coversProblem(form) !== null) return null
  return {
    expectedVersion,
    enabled: form.enabled,
    covers: { ...form.covers },
    requiredApprovals: Number(form.requiredApprovals.trim()),
    autoApproveBelow: form.mode === 'EVERY_BILL' ? null : Number(form.threshold.trim()),
  }
}

export function ruleChanged(saved: SalesApprovalRuleDto, next: SalesApprovalRuleChange): boolean {
  return (
    saved.enabled !== next.enabled ||
    saved.requiredApprovals !== next.requiredApprovals ||
    saved.autoApproveBelow !== next.autoApproveBelow ||
    COVER_KEYS.some((key) => saved.covers[key] !== next.covers[key])
  )
}

/**
 * Too few people can approve: every request needs `required` approvers other than whoever
 * prepared the draft, so one more than the requirement is the least that never leaves a request
 * waiting for people who do not exist.
 */
export function tooFewApprovers(approverCount: number | null, required: number): boolean {
  return approverCount !== null && approverCount < required + 1
}

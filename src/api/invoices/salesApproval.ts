import { apiRequest } from '../client'

/**
 * Approval of sales documents before they are issued (RL-6): the company rule
 * (`SalesApprovalRuleController`) and a draft's approval (`SalesApprovalController`).
 *
 * The server decides everything that matters here. A draft's `callerMayRequest` and
 * `callerMayDecide` already account for the rule, the caller's permissions and separation of
 * duties (nobody who prepared a draft may approve it), so the screen never compares an amount with
 * the threshold or works out who prepared what.
 *
 * Reading the rule takes `invoice.read`; changing it takes `admin.settings.manage`, as the bills
 * policy does. With the deployment's switch off the reads still answer 200 (the rule as never set
 * and off, each draft NOT_REQUIRED) while switching the rule on and every step on a draft answer
 * 503 `SALES_APPROVAL_UNAVAILABLE`; the screens then show nothing new.
 */

export const SALES_APPROVAL_RULE_PATH = '/v1/settings/sales-approval-rule'

export type SalesApprovalCovers = {
  invoice: boolean
  creditNote: boolean
  debitNote: boolean
  selfBilled: boolean
}

/** `SalesApprovalRuleResponse`. Version 0 with `enabled` false is a company that never set one. */
export type SalesApprovalRuleDto = {
  version: number
  enabled: boolean
  covers: SalesApprovalCovers
  requiredApprovals: number
  /** Strictly below this VAT-inclusive amount no approval is needed; null means every document. */
  autoApproveBelow: number | null
  reason: string | null
  updatedBy: string | null
  updatedAt: string | null
  /** How many people can approve today; on the current rule only. */
  approverCount: number | null
}

/** `SalesApprovalRuleRequest`: the rule replaced whole, against the version it was read at. */
export type SalesApprovalRuleChange = {
  expectedVersion: number
  enabled: boolean
  covers: SalesApprovalCovers
  requiredApprovals: number
  autoApproveBelow: number | null
  reason?: string | null
}

export function loadSalesApprovalRule(): Promise<SalesApprovalRuleDto> {
  return apiRequest<SalesApprovalRuleDto>(SALES_APPROVAL_RULE_PATH)
}

export function saveSalesApprovalRule(
  change: SalesApprovalRuleChange,
): Promise<SalesApprovalRuleDto> {
  return apiRequest<SalesApprovalRuleDto>(SALES_APPROVAL_RULE_PATH, { method: 'PUT', body: change })
}

export type SalesApprovalStatus =
  'NOT_REQUIRED' | 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED'

/** `SalesApprovalResponse`. */
export type SalesApprovalDto = {
  status: SalesApprovalStatus
  requiredApprovals: number
  distinctApprovals: number
  /** The draft version this state is about; every command sends it back as `expectedVersion`. */
  draftVersion: number
  payableAmount: number | null
  currency: string | null
  requestedBy: string | null
  requestedAt: string | null
  lastDecision: {
    kind: 'APPROVED' | 'REJECTED'
    by: string
    at: string
    reason: string | null
  } | null
  callerMayRequest: boolean
  callerMayDecide: boolean
}

export const salesApprovalPath = (invoiceId: string) =>
  `/v1/invoice-drafts/${encodeURIComponent(invoiceId)}/approval`

export function loadSalesApproval(invoiceId: string): Promise<SalesApprovalDto> {
  return apiRequest<SalesApprovalDto>(salesApprovalPath(invoiceId))
}

export type SalesApprovalCommand = 'request' | 'withdraw' | 'approve' | 'reject'

/**
 * One step on a draft. `text` is the note on a request or an approval and the reason on a
 * rejection, where the server requires it.
 */
export function decideSalesApproval(
  invoiceId: string,
  command: SalesApprovalCommand,
  expectedVersion: number,
  text?: string,
): Promise<SalesApprovalDto> {
  return apiRequest<SalesApprovalDto>(`${salesApprovalPath(invoiceId)}/${command}`, {
    method: 'POST',
    body: text === undefined ? { expectedVersion } : { expectedVersion, text },
  })
}

import { apiRequest } from '../client'

/**
 * The tenant's bill-approval policy (`ExpenditureApprovalController`, E-17).
 *
 * Two figures, and the second is the one that needs care.
 *
 * `requiredApprovals` is how many **distinct** people must approve a bill before it can be paid.
 * V137's comment is explicit that no zero is admitted: approval always gates payment and only the
 * count is configurable, so a tenant wanting no gate at all is a product decision nobody has made.
 *
 * `autoApproveBelow` is a threshold under which no approval is needed — **strictly** below, so a
 * bill exactly at the threshold still needs approving. `null` means every bill needs approval,
 * which is the V137 default and the fail-closed reading.
 *
 * **A PUT replaces the whole policy.** The controller says so: omitting `autoApproveBelow` CLEARS
 * a threshold rather than keeping one, "because a policy document is replaced whole; a partial
 * update that silently kept a threshold would let an admin believe they had re-gated every bill
 * when they had not". The screen therefore makes having no threshold an explicit choice rather
 * than a blank field.
 *
 * **Reading and writing need different permissions.** `GET` takes `invoice.read`; `PUT` takes
 * `admin.settings.manage`, and the controller explains why it is not `invoice.approve`: "letting
 * an approver lower the approver count is letting the guarded change the guard". So someone who
 * may see the policy may well not be able to change it, and the screen has to render that.
 */

export const APPROVAL_POLICY_PATH = '/v1/expenditure/approval-policy'

/** `autoApproveBelow` is a bare decimal — the server attaches no currency to it. */
export type ApprovalPolicyDto = {
  requiredApprovals: number
  autoApproveBelow: number | null
}

export const MIN_REQUIRED_APPROVALS = 1
/** `@Max(10)` on the request, and `ck_approval_policy_range` in V137. */
export const MAX_REQUIRED_APPROVALS = 10
/** `@Digits(integer = 15, fraction = 3)`. */
export const THRESHOLD_DECIMALS = 3
export const THRESHOLD_INTEGER_DIGITS = 15

export function loadApprovalPolicy(): Promise<ApprovalPolicyDto> {
  return apiRequest<ApprovalPolicyDto>(APPROVAL_POLICY_PATH)
}

export function saveApprovalPolicy(policy: ApprovalPolicyDto): Promise<ApprovalPolicyDto> {
  return apiRequest<ApprovalPolicyDto>(APPROVAL_POLICY_PATH, {
    method: 'PUT',
    // Sent explicitly as null rather than left out. Both clear the threshold server-side, but a
    // named null says the caller meant it, and it keeps the request readable in a log.
    body: { requiredApprovals: policy.requiredApprovals, autoApproveBelow: policy.autoApproveBelow },
  })
}

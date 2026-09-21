import {
  MAX_REQUIRED_APPROVALS,
  MIN_REQUIRED_APPROVALS,
  THRESHOLD_DECIMALS,
  THRESHOLD_INTEGER_DIGITS,
  type ApprovalPolicyDto,
} from '../api/expenditure/approvalPolicy'

/**
 * The approval-policy form, and the rules the server would apply to it (E-17).
 *
 * Checked here as well as there so a refusal the reader could have been warned about arrives as a
 * message beside the field rather than as a 400 after the fact. The server stays the authority:
 * every rule below mirrors one of its constraints, and none of them is invented here.
 */

/** Whether a threshold applies at all. Explicit, because a blank field would CLEAR one silently. */
export type ThresholdMode = 'EVERY_BILL' | 'BELOW_AMOUNT'

export type ApprovalPolicyForm = {
  requiredApprovals: string
  mode: ThresholdMode
  /** Only meaningful under `BELOW_AMOUNT`; kept while the reader toggles, so a toggle is undoable. */
  threshold: string
}

export function formOf(policy: ApprovalPolicyDto): ApprovalPolicyForm {
  return {
    requiredApprovals: String(policy.requiredApprovals),
    mode: policy.autoApproveBelow === null ? 'EVERY_BILL' : 'BELOW_AMOUNT',
    threshold: policy.autoApproveBelow === null ? '' : String(policy.autoApproveBelow),
  }
}

export type ApprovalProblem =
  | 'approversRequired'
  | 'approversRange'
  | 'thresholdRequired'
  | 'thresholdPositive'
  | 'thresholdDecimals'
  | 'thresholdTooLarge'

/** `@Min(1) @Max(10)`, and V137's `ck_approval_policy_range`. */
export function approversProblem(value: string): ApprovalProblem | null {
  const text = value.trim()
  if (text === '') return 'approversRequired'
  if (!/^\d+$/.test(text)) return 'approversRange'
  const count = Number(text)
  if (count < MIN_REQUIRED_APPROVALS || count > MAX_REQUIRED_APPROVALS) return 'approversRange'
  return null
}

/** `@DecimalMin(value = "0", inclusive = false)` and `@Digits(integer = 15, fraction = 3)`. */
export function thresholdProblem(value: string, mode: ThresholdMode): ApprovalProblem | null {
  if (mode === 'EVERY_BILL') return null
  const text = value.trim()
  if (text === '') return 'thresholdRequired'
  if (!/^\d*(\.\d*)?$/.test(text)) return 'thresholdPositive'
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) return 'thresholdPositive'
  const [whole, fraction = ''] = text.split('.')
  if (fraction.length > THRESHOLD_DECIMALS) return 'thresholdDecimals'
  if (whole.replace(/^0+/, '').length > THRESHOLD_INTEGER_DIGITS) return 'thresholdTooLarge'
  return null
}

/**
 * The policy this form would send, or null while it is not sendable.
 *
 * `EVERY_BILL` sends an explicit null: the PUT replaces the policy whole, so this is what removes
 * a threshold that is already stored.
 */
export function policyOf(form: ApprovalPolicyForm): ApprovalPolicyDto | null {
  if (approversProblem(form.requiredApprovals) !== null) return null
  if (thresholdProblem(form.threshold, form.mode) !== null) return null
  return {
    requiredApprovals: Number(form.requiredApprovals.trim()),
    autoApproveBelow: form.mode === 'EVERY_BILL' ? null : Number(form.threshold.trim()),
  }
}

export function policyChanged(saved: ApprovalPolicyDto, next: ApprovalPolicyDto): boolean {
  return saved.requiredApprovals !== next.requiredApprovals || saved.autoApproveBelow !== next.autoApproveBelow
}

/**
 * Whether removing a stored threshold is what this save does.
 *
 * Worth saying out loud before it happens: bills that needed no approval yesterday will need one
 * today, and nothing else on the screen would tell the reader that.
 */
export function clearsThreshold(saved: ApprovalPolicyDto, next: ApprovalPolicyDto): boolean {
  return saved.autoApproveBelow !== null && next.autoApproveBelow === null
}

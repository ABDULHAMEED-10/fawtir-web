import { ApiError } from '../api'

/**
 * Our own sentence for each branch access refusal the people screens can meet (Business Rules
 * BA-1, OW-1, OW-3, RL-1, RL-5, LG-3), by the problem `type` slug the server names it with. The
 * server's English `detail` never reaches the screen. Null for anything else, so a screen falls
 * back to `describeApiFailure`.
 */
const KEYS: Record<string, string> = {
  'branch-required': 'branchAccess.refusal.branchRequired',
  'owner-protected': 'branchAccess.refusal.ownerProtected',
  'admin-has-all-branches': 'branchAccess.refusal.adminHasAllBranches',
  'admin-full-access': 'branchAccess.refusal.adminFullAccess',
  'reserved-permission': 'branchAccess.refusal.reservedPermission',
  'permission-escalation': 'branchAccess.refusal.permissionEscalation',
  'last-administrator': 'branchAccess.refusal.lastAdministrator',
  'one-role-only': 'branchAccess.refusal.oneRoleOnly',
  'not-owner': 'branchAccess.refusal.notOwner',
  'handover-target-not-administrator': 'branchAccess.refusal.handoverTargetNotAdministrator',
  'handover-target-self': 'branchAccess.refusal.handoverTargetSelf',
  // A branch the person is not assigned to, or a staff member changing where an item is sold.
  'branch-not-in-scope': 'branchAccess.refusal.branchNotInScope',
}

export function branchAccessRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  return error.problemType && Object.hasOwn(KEYS, error.problemType) ? KEYS[error.problemType] : null
}

import { useSession } from '../session/session'
import type { Entitlements } from './entitlements'

/**
 * Whether branch access (Business Rules BA-1) is switched on for this server, as far as the
 * session can tell. Every new branch screen (the branch question on the invitation, the Branches
 * column, the Owner mark, each person's page, who works in a branch) waits for it; while it is off
 * the screens stay exactly as they were, because nothing is limited by branch yet and an invitation
 * that names no branch is given every branch (BA-6, `BranchAssignmentService.checkNewPerson`).
 *
 * The server (`FAWTIR_IDENTITY_BRANCH_ACCESS_ENFORCED`, off in production) says so in
 * `GET /v1/me/entitlements` only indirectly: `allBranches` is false, and `branchAdministrator`
 * true, only while it is on. For the Owner and Administrators both read the same either way, and
 * `featureFlags` is always empty, so for them it reads as off.
 * TODO(backend): docs/backend-guides/SETTINGS.md row 7.6.
 */
export function branchAccessOn(session: Entitlements | null): boolean {
  if (!session) return false
  return session.branchAdministrator === true || session.allBranches === false
}

export function useBranchAccessOn(): boolean {
  return branchAccessOn(useSession())
}

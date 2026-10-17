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
 * `GET /v1/me/entitlements` as `branchAccessEnforced`, the same for every caller. A server older
 * than the field omits it, which reads as off, so the Owner and Administrators see the screens as
 * they were. `allBranches` false and `branchAdministrator` true are only ever sent while it is on,
 * so either still counts as on.
 */
export function branchAccessOn(session: Entitlements | null): boolean {
  if (!session) return false
  return (
    session.branchAccessEnforced === true ||
    session.branchAdministrator === true ||
    session.allBranches === false
  )
}

export function useBranchAccessOn(): boolean {
  return branchAccessOn(useSession())
}

import { useApiRead } from '../../hooks'
import { useCan, useSession } from '../../lib/session/session'
import {
  ADMIN_ROLE,
  ROLES_PATH,
  ROLES_PERMISSION,
  USERS_PERMISSION,
  loadRoles,
  type CompanyUser,
  type RoleDto,
} from '../../api/settings/people'
import {
  BRANCHES_OVERVIEW_PATH,
  loadBranchOverview,
  type BranchOverviewDto,
} from '../../api/settings/branches'
import { BRANCHES_PATH, loadBranches, type BranchDto } from '../../api/invoices/drafts'

/**
 * Role names for the codes a person holds, when the reader may list roles. Without that, or while
 * it loads, the code itself is shown: still the truth, just less friendly.
 */
export function useRoleNames(): (code: string) => string {
  const mayListRoles = useCan(ROLES_PERMISSION)
  const read = useApiRead<RoleDto[]>(mayListRoles ? ROLES_PATH : null, loadRoles).read
  const names = new Map(read.status === 'ready' ? read.data.map((role) => [role.code, role.name]) : [])
  return (code) => names.get(code) ?? code
}

export const TH = 'px-3 py-2 text-start text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary'
export const TD = 'px-3 py-3 align-top text-sm font-medium text-text-primary'

export function personStatus(person: Pick<CompanyUser, 'enabled' | 'locked'>): 'active' | 'locked' | 'disabled' {
  if (!person.enabled) return 'disabled'
  return person.locked ? 'locked' : 'active'
}

/** A branch as the people screens name it. */
export type NamedBranch = { id: string; name: string; active: boolean }

/**
 * The company's branches by name, for the people screens. The branches overview (`branch.manage`,
 * the Administrator's) names closed branches too and is the read the settings shell already makes;
 * anyone else, such as a branch administrator, gets the branch picker's list, which the server
 * keeps to their own open branches (BA-1). `enabled` false reads nothing (branch access off).
 */
export function useBranchNames(
  enabled = true,
): { branches: NamedBranch[]; ready: boolean; name: (id: string) => string | null } {
  const mayManageBranches = useCan('branch.manage')
  const overview = useApiRead<BranchOverviewDto>(
    enabled && mayManageBranches ? BRANCHES_OVERVIEW_PATH : null,
    () => loadBranchOverview(),
  ).read
  const directory = useApiRead<BranchDto[]>(
    enabled && !mayManageBranches ? BRANCHES_PATH : null,
    loadBranches,
  ).read
  const branches: NamedBranch[] = mayManageBranches
    ? overview.status === 'ready' && Array.isArray(overview.data.branches)
      ? overview.data.branches.map((row) => ({ id: row.id, name: row.name, active: row.active }))
      : []
    : directory.status === 'ready'
      ? directory.data.map((row) => ({ id: row.id, name: row.name, active: true }))
      : []
  // Settled either way: a failed read offers no branches rather than loading for ever.
  const ready = mayManageBranches ? overview.status !== 'loading' : directory.status !== 'loading'
  const names = new Map(branches.map((branch) => [branch.id, branch.name]))
  return { branches, ready, name: (id) => names.get(id) ?? null }
}

/** The Owner and Administrators see every branch without being assigned (BA-2). */
export function seesEveryBranch(person: Pick<CompanyUser, 'owner' | 'roles'>): boolean {
  return Boolean(person.owner) || person.roles.includes(ADMIN_ROLE)
}

/**
 * Whether the reader manages people: the Administrator (`admin.users.manage`), or a branch
 * administrator once branch access is on (LG-3), whose lists the server keeps to their branches.
 * Without a session (the guard is off) everything is offered, as `useCan` does.
 */
export function useManagesPeople(): boolean {
  const session = useSession()
  return !session || session.permissions.includes(USERS_PERMISSION) || session.branchAdministrator === true
}

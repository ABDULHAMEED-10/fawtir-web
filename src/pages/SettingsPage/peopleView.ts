import { useApiRead } from '../../hooks'
import { useCan } from '../../lib/session/session'
import { ROLES_PATH, ROLES_PERMISSION, loadRoles, type CompanyUser, type RoleDto } from '../../api/settings/people'

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

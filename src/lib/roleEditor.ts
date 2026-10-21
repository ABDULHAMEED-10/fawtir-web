import {
  isReservedInMatrix,
  type MatrixPermission,
  type MatrixRole,
  type RoleGrants,
  type RoleQualifier,
} from '../api/settings/roles'
import { roleKind, type RoleDto } from '../api/settings/people'

/**
 * The role maker's state and the rules it follows, kept apart from the screen so they can be
 * tested without one.
 */

/** A permission that is on: in full (`qualifier` null) or under a limit. */
export type Grant = { qualifier: RoleQualifier | null; value?: number }
export type Grants = Record<string, Grant>

/** The design's four headings (Figma 135:40069), in its order. */
export const EDITOR_GROUPS = ['selling', 'catalog', 'money', 'account'] as const
export type EditorGroup = (typeof EDITOR_GROUPS)[number]

/** Which of the design's headings a server permission sits under. */
export function editorGroupOf(code: string): EditorGroup {
  const resource = code.split('.')[0]
  if (code === 'invoice.payment.manage') return 'money'
  if (['invoice', 'creditnote', 'debitnote', 'customer', 'compliance'].includes(resource)) return 'selling'
  if (resource === 'product') return 'catalog'
  if (['bill', 'supplier', 'selfbilling', 'reports'].includes(resource)) return 'money'
  return 'account'
}

/**
 * What the picker offers: the server's grantable catalogue less what only the Administrator does
 * (RL-5), which is hidden entirely rather than shown switched off.
 */
export function offeredPermissions(catalogue: MatrixPermission[]): MatrixPermission[] {
  return catalogue.filter((permission) => !isReservedInMatrix(permission))
}

/** A role's column as switches, leaving out anything the picker does not offer. */
export function grantsOf(role: MatrixRole | undefined, offered: MatrixPermission[]): Grants {
  const grants: Grants = {}
  if (!role) return grants
  for (const permission of offered) {
    const cell = role.cells[permission.code]
    if (!cell || cell.state === 'NONE') continue
    if (cell.state === 'LIMITED' && cell.qualifier && permission.qualifiers.includes(cell.qualifier)) {
      grants[permission.code] =
        cell.qualifier === 'MAX_PERCENT' && cell.value !== null
          ? { qualifier: 'MAX_PERCENT', value: Number(cell.value) }
          : { qualifier: cell.qualifier }
    } else {
      grants[permission.code] = { qualifier: null }
    }
  }
  return grants
}

/** Codes a role holds that the picker hides, which saving it would take away. */
export function hiddenHeld(role: MatrixRole | undefined, offered: MatrixPermission[]): string[] {
  if (!role) return []
  const shown = new Set(offered.map((permission) => permission.code))
  return Object.entries(role.cells)
    .filter(([code, cell]) => cell.state !== 'NONE' && !shown.has(code))
    .map(([code]) => code)
    .sort()
}

/** The body the server takes for one role's column. */
export function toRoleGrants(grants: Grants): RoleGrants {
  const permissionCodes: string[] = []
  const qualifiedPermissions: RoleGrants['qualifiedPermissions'] = []
  for (const [code, grant] of Object.entries(grants).sort(([a], [b]) => a.localeCompare(b))) {
    if (grant.qualifier === null) permissionCodes.push(code)
    else if (grant.qualifier === 'MAX_PERCENT') {
      qualifiedPermissions.push({ code, qualifier: 'MAX_PERCENT', value: grant.value ?? 0 })
    } else qualifiedPermissions.push({ code, qualifier: grant.qualifier })
  }
  return { permissionCodes, qualifiedPermissions }
}

/** The ceilings offered for a percentage limit; a role saved with another keeps its own. */
export const PERCENT_CHOICES = [10, 20] as const

/** The picker's value for a grant: `FULL`, `OWN` or `MAX_PERCENT:10`. */
export function limitValueOf(grant: Grant): string {
  if (grant.qualifier === null) return 'FULL'
  if (grant.qualifier === 'MAX_PERCENT') return `MAX_PERCENT:${grant.value ?? 0}`
  return grant.qualifier
}

export function grantOfLimitValue(value: string): Grant {
  if (value === 'FULL') return { qualifier: null }
  if (value.startsWith('MAX_PERCENT:')) return { qualifier: 'MAX_PERCENT', value: Number(value.slice(12)) }
  return { qualifier: value as RoleQualifier }
}

/**
 * The roles a new one may start from: the built-in job roles other than the Administrator, whose
 * permissions a made role can never hold (RL-5). Approve and view only are permissions, not roles
 * (RL-2), and technical roles are not a person's job, so neither is offered.
 */
export function templateRoles(matrix: MatrixRole[], roles: RoleDto[]): MatrixRole[] {
  const jobRoles = new Set(
    roles
      .filter((role) => role.systemRole && roleKind(role) === 'ROLE')
      .map((role) => role.id),
  )
  return matrix.filter((role) => role.systemRole && role.code !== 'ADMIN' && jobRoles.has(role.id))
}


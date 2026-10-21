import { apiRequest } from '../client'
import type { RoleDto } from './people'

/**
 * Making, changing and deleting a company-built role (`RoleController`), and the catalogue a role
 * is built from (`GET /v1/roles/matrix`). Every write needs `admin.roles.manage`; reading the
 * matrix needs `role.list`. The server scopes all of it to the caller's company.
 */
export const ROLES_MANAGE_PERMISSION = 'admin.roles.manage'

export const ROLE_MATRIX_PATH = '/v1/roles/matrix'

/** The two limits a grant can carry (V162). `OWN` takes no value; `MAX_PERCENT` takes 0 to 100. */
export type RoleQualifier = 'OWN' | 'MAX_PERCENT'

/** One grantable permission. Platform permissions are already left out by the server. */
export type MatrixPermission = {
  code: string
  module: string | null
  /** English only: never shown, the screen names a permission in its own words. */
  description: string | null
  /** The limits it may be granted with; empty means on or off only. */
  qualifiers: RoleQualifier[]
  /**
   * What only the Administrator does (Business Rules RL-5), from the server's `ReservedPermissions`.
   * A server older than the field omits it; `isReservedInMatrix` then falls back to the list below.
   */
  reserved?: boolean
}

export type MatrixCell = {
  state: 'FULL' | 'LIMITED' | 'NONE'
  qualifier: RoleQualifier | null
  value: number | null
}

export type MatrixRole = {
  id: string
  code: string
  name: string
  systemRole: boolean
  enabled: boolean
  /** Only what the role holds; a permission absent from the map is not held. */
  cells: Record<string, MatrixCell>
}

export type RoleMatrixDto = { permissions: MatrixPermission[]; roles: MatrixRole[] }

export function loadRoleMatrix(): Promise<RoleMatrixDto> {
  return apiRequest<RoleMatrixDto>(ROLE_MATRIX_PATH)
}

export type QualifiedGrant = { code: string; qualifier: RoleQualifier; value?: number }

/** One matrix column as the server takes it: grants in full, and grants under a limit. */
export type RoleGrants = { permissionCodes: string[]; qualifiedPermissions: QualifiedGrant[] }

export type CreateRoleBody = RoleGrants & { code: string; name: string; description?: string }

export function createRole(body: CreateRoleBody): Promise<RoleDto> {
  return apiRequest<RoleDto>('/v1/roles', { method: 'POST', body })
}

/**
 * Both grant lists are replaced together (the server clears the one not sent), so both are always
 * sent. An empty description clears it.
 */
export function updateRole(id: string, body: RoleGrants & { name: string; description: string }): Promise<RoleDto> {
  return apiRequest<RoleDto>(`/v1/roles/${encodeURIComponent(id)}`, { method: 'PATCH', body })
}

/** A soft delete. Refused while anyone holds the role (409) and for built-in roles (403). */
export function deleteRole(id: string): Promise<void> {
  return apiRequest<void>(`/v1/roles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * What only the Administrator does (Business Rules RL-5): never part of a company-built role.
 *
 * The matrix marks these `reserved`, and `isReservedInMatrix` reads that first. This list is the
 * fallback for a server older than the field, mirroring the server's `ReservedPermissions`: the
 * codes below, and every `erp.*` code except the two reads. A code the server reserves beyond
 * these is still refused on save (403 reserved-permission), and the screen says so.
 */
const ADMINISTRATOR_ONLY = new Set([
  'admin.users.manage',
  'admin.roles.manage',
  'admin.settings.manage',
  'branch.manage',
  'tenant.plan.manage',
  // The company's outside connections: its Peppol listing, ERP field mapping and webhooks.
  'smp.participant.manage',
  'mapping.manage',
  'mapping.certify',
  'webhooks.manage',
])
const ERP_READS = new Set(['erp.connection.read', 'erp.audit.read'])

export function isAdministratorOnly(code: string): boolean {
  const normalized = code.trim().toLowerCase()
  return (
    ADMINISTRATOR_ONLY.has(normalized) ||
    (normalized.startsWith('erp.') && !ERP_READS.has(normalized))
  )
}

/** The server's `reserved` flag when it sends one, otherwise the list above. */
export function isReservedInMatrix(permission: Pick<MatrixPermission, 'code' | 'reserved'>): boolean {
  return typeof permission.reserved === 'boolean' ? permission.reserved : isAdministratorOnly(permission.code)
}

/**
 * The role's code, which the server requires and never shows: lower case, digits and underscores,
 * starting with a letter, at most 50 characters. Made from the name where it has Latin letters,
 * with a random ending so two roles named alike (or two Arabic names) never collide.
 */
export function roleCodeFor(name: string, random: () => number = Math.random): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, 36)
    .replace(/_+$/, '')
  const ending = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')
  return `${slug || 'role'}_${ending}`
}

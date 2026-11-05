import { apiRequest } from '../client'
import type { CompanyUser } from './people'

/**
 * Who works in which branch, the Owner, one role per person and a person's own permissions
 * (Business Rules BA-1, OW-1, OW-4, RL-1, RL-2, RL-3, LG-3): `UserBranchesController`,
 * `UserPermissionsController`, `RoleAssignmentController` and `CompanyOwnerController`.
 *
 * Every refusal is a problem `type` the screens map to their own sentences: `owner-protected`,
 * `admin-has-all-branches`, `branch-required`, `admin-full-access`, `reserved-permission`,
 * `permission-escalation`, `last-administrator`, `one-role-only`, `not-owner`,
 * `handover-target-not-administrator`, `handover-target-self`.
 */

export const personPath = (userId: string) => `/v1/users/${encodeURIComponent(userId)}`
export const personBranchesPath = (userId: string) => `${personPath(userId)}/branches`
export const personPermissionsPath = (userId: string) => `${personPath(userId)}/permissions`
export const branchPeoplePath = (branchId: string) =>
  `/v1/branches/${encodeURIComponent(branchId)}/people`
export const OWNER_PATH = '/v1/settings/owner'
export const PERMISSION_CATALOGUE_PATH = '/v1/permissions'

export function loadPerson(userId: string): Promise<CompanyUser> {
  return apiRequest<CompanyUser>(personPath(userId))
}

/** `PersonBranches`: `allBranches` is true for the Owner and Administrators (BA-2). */
export type PersonBranchesDto = { userId: string; allBranches: boolean; branchIds: string[] }

export function savePersonBranches(
  userId: string,
  branchIds: string[],
): Promise<PersonBranchesDto> {
  return apiRequest<PersonBranchesDto>(personBranchesPath(userId), {
    method: 'PUT',
    body: { branchIds },
  })
}

/** One person on a branch's roster ("Who works there"). */
export type RosterEntryDto = {
  userId: string
  name: string
  owner: boolean
  allBranches: boolean
  assigned: boolean
  otherBranchCount: number
}

export function loadBranchPeople(branchId: string): Promise<RosterEntryDto[]> {
  return apiRequest<RosterEntryDto[]>(branchPeoplePath(branchId))
}

/** Full state: the people who should work in this branch. Owner and Administrators are ignored. */
export function saveBranchPeople(branchId: string, userIds: string[]): Promise<RosterEntryDto[]> {
  return apiRequest<RosterEntryDto[]>(branchPeoplePath(branchId), {
    method: 'PUT',
    body: { userIds },
  })
}

export type PermissionLimit = 'OWN' | 'MAX_PERCENT'

/** `PermissionGrant`: a grant may carry the limit its permission offers; it replaces the role's. */
export type PersonGrant = { code: string; qualifier: PermissionLimit | null; value: number | null }

/**
 * `CarriedLimit` (backend 37b2fedca, review FR2-1): an own grant a role collapse carried from a
 * company role that set no limit, held at MAX_PERCENT 0. Read-only: the server refuses a 0 sent as a
 * grant, keeps the limit through a save that does not name its code, and replaces it when one does. It
 * follows the person into any later role (review FR2-3), so the screen says so.
 */
export type CarriedLimit = { code: string; qualifier: PermissionLimit; value: number }

/** `PersonPermissions`: `effective` is the role's permissions plus the grants minus the denials. */
export type PersonPermissionsDto = {
  userId: string
  role: string | null
  roleCodes: string[]
  grants: PersonGrant[]
  denials: string[]
  effective: string[]
  /** Absent from a server before 37b2fedca. */
  carriedLimits?: CarriedLimit[]
}

export function loadPersonPermissions(userId: string): Promise<PersonPermissionsDto> {
  return apiRequest<PersonPermissionsDto>(personPermissionsPath(userId))
}

/** Full replacement of the person's own grants and denials. */
export function savePersonPermissions(
  userId: string,
  grants: PersonGrant[],
  denials: string[],
): Promise<PersonPermissionsDto> {
  return apiRequest<PersonPermissionsDto>(personPermissionsPath(userId), {
    method: 'PUT',
    body: {
      grants: grants.map((grant) =>
        grant.qualifier
          ? { code: grant.code, qualifier: grant.qualifier, value: grant.value }
          : { code: grant.code },
      ),
      denials,
    },
  })
}

/** Replaces the person's one role (RL-1). Answers the person's roles. */
export function replaceRole(
  userId: string,
  roleCode: string,
  branchIds?: string[],
): Promise<unknown> {
  return apiRequest<unknown>(`${personPath(userId)}/role`, {
    method: 'PUT',
    body: branchIds && branchIds.length ? { roleCode, branchIds } : { roleCode },
  })
}

/** `OwnerView`: both null while the company has no Owner recorded. */
export type OwnerDto = { userId: string | null; name: string | null }

export function loadOwner(): Promise<OwnerDto> {
  return apiRequest<OwnerDto>(OWNER_PATH)
}

export function handOverOwnership(
  toUserId: string,
  currentPassword: string,
  confirmCompanyName: string,
): Promise<OwnerDto> {
  return apiRequest<OwnerDto>(`${OWNER_PATH}/handover`, {
    method: 'POST',
    body: { toUserId, currentPassword, confirmCompanyName },
  })
}

/** `PermissionCatalogueEntry` (`role.read`): every permission, and whether a company may hold it. */
export type PermissionEntryDto = {
  code: string
  module: string
  description: string
  assignable: boolean
}

export function loadPermissionCatalogue(): Promise<PermissionEntryDto[]> {
  return apiRequest<PermissionEntryDto[]>(PERMISSION_CATALOGUE_PATH)
}

/**
 * Codes only the Administrator holds (RL-5): never a person's own grant. The server refuses them
 * (`reserved-permission`); the screens do not offer them. Every ERP change is reserved, the two
 * reads are not.
 */
const RESERVED = new Set([
  'admin.users.manage',
  'admin.roles.manage',
  'admin.settings.manage',
  'branch.manage',
  'tenant.plan.manage',
  'smp.participant.manage',
  'mapping.manage',
  'mapping.certify',
  'webhooks.manage',
])
const ERP_READS = new Set(['erp.connection.read', 'erp.audit.read'])

export function isReservedPermission(code: string): boolean {
  const normalized = code.trim().toLowerCase()
  return RESERVED.has(normalized) || (normalized.startsWith('erp.') && !ERP_READS.has(normalized))
}

/** Made a branch administrator by this grant (decided 16 Oct: a person's grant, not a role). */
export const BRANCH_ADMINISTRATOR_GRANT = 'branch.users.manage'

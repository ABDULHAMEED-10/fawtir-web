import { apiRequest } from '../client'

/**
 * The company's own people, invitations and roles (`UserController`, `UserInvitationController`,
 * `RoleController`). Every one of these is scoped by the server to the caller's tenant, so a screen
 * never names a tenant. Reading people and invitations needs `admin.users.manage`; reading roles
 * needs `role.list`.
 */
export const USERS_PERMISSION = 'admin.users.manage'
export const ROLES_PERMISSION = 'role.list'

/** The part of `RecordUserResponse` the settings screens read. */
export type CompanyUser = {
  id: string
  username: string
  email: string
  firstName: string | null
  lastName: string | null
  enabled: boolean
  /** An authenticator app is set up. A one-time code by email needs no enrolment, so it is not counted here. */
  mfaEnabled: boolean
  /** Role codes of the person's active assignments. */
  roles: string[]
  createdAt: string
  locked: boolean
  lockedUntil: string | null
}

export type UserPage = { content: CompanyUser[]; totalElements: number; totalPages: number; number: number; size: number }

/** One page large enough for a company's team; the footer says when there are more. */
export const PEOPLE_PAGE_SIZE = 100
export const PEOPLE_PATH = `/v1/users?page=0&size=${PEOPLE_PAGE_SIZE}&sort=createdAt,asc`

export function loadPeople(): Promise<UserPage> {
  return apiRequest<UserPage>(PEOPLE_PATH)
}

export function displayName(user: Pick<CompanyUser, 'firstName' | 'lastName' | 'username'>): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

export type InvitationDto = {
  id: string
  email: string
  roleCodes: string[]
  status: InvitationStatus
  expiresAt: string
  sentCount: number
  lastSentAt: string | null
  createdAt: string
}

export const PENDING_INVITATIONS_PATH = '/v1/users/invitations?status=PENDING&page=0&size=50'

export function loadPendingInvitations(): Promise<InvitationDto[]> {
  return apiRequest<InvitationDto[]>(PENDING_INVITATIONS_PATH)
}

/** `InviteUserRequest`: an empty role list means the server's default role. */
export function inviteUser(email: string, roleCodes: string[]): Promise<InvitationDto> {
  return apiRequest<InvitationDto>('/v1/users/invitations', {
    method: 'POST',
    body: { email, roleCodes },
  })
}

export type RoleDto = {
  id: string
  code: string
  name: string
  description: string | null
  enabled: boolean
  systemRole: boolean
  permissionCodes: string[]
}

export const ROLES_PATH = '/v1/roles'

export function loadRoles(): Promise<RoleDto[]> {
  return apiRequest<RoleDto[]>(ROLES_PATH)
}

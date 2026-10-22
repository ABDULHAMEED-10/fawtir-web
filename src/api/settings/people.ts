import { apiRequest } from '../client'
import { ApiError } from '../errors'

/**
 * The company's own people, invitations and roles (`UserController`, `UserInvitationController`,
 * `RoleController`). Every one of these is scoped by the server to the caller's tenant, so a screen
 * never names a tenant. Reading people and invitations needs `admin.users.manage`; reading roles
 * needs `role.list`.
 */
export const USERS_PERMISSION = 'admin.users.manage'
export const ROLES_PERMISSION = 'role.list'
/**
 * A branch administrator's code (Business Rules LG-3, RL-5): with branch access on, they manage the
 * people of their own branches. The server filters every list to them.
 */
export const BRANCH_USERS_PERMISSION = 'branch.users.manage'

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
  /** The company's stored Owner (OW-1). Absent from older servers. */
  owner?: boolean
  /**
   * The branches the person is assigned to (BA-1). The Owner and Administrators see every branch
   * whatever is assigned (BA-2), so a screen shows "every branch" for them instead.
   */
  branchIds?: string[]
  /**
   * Switched-off people only (`status=DEACTIVATED`, backend #683): when, by whom (null when
   * unknown), and the role codes they held, so "Switch back on" can preselect it (the list reports
   * a switched-off person's `roles` empty). Null on every other read; absent from an older server,
   * which reads as unknown.
   */
  deactivatedAt?: string | null
  deactivatedByName?: string | null
  previousRoles?: string[]
}

export type UserPage = {
  content: CompanyUser[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

/** One page large enough for a company's team; the footer says when there are more. */
export const PEOPLE_PAGE_SIZE = 100
export const PEOPLE_PATH = `/v1/users?page=0&size=${PEOPLE_PAGE_SIZE}&sort=createdAt,asc`

export function loadPeople(): Promise<UserPage> {
  return apiRequest<UserPage>(PEOPLE_PATH)
}

export function displayName(
  user: Pick<CompanyUser, 'firstName' | 'lastName' | 'username'>,
): string {
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

/**
 * `InviteUserRequest`: an empty role list means the server's default role. `branchIds` are the
 * branches the person will work in (BA-1, LG-1); sent only when chosen, so an Administrator
 * invitation, which sees every branch, carries none.
 */
export function inviteUser(
  email: string,
  roleCodes: string[],
  branchIds?: string[],
): Promise<InvitationDto> {
  return apiRequest<InvitationDto>('/v1/users/invitations', {
    method: 'POST',
    body: branchIds && branchIds.length ? { email, roleCodes, branchIds } : { email, roleCodes },
  })
}

const invitationPath = (id: string) => `/v1/users/invitations/${encodeURIComponent(id)}`

/** Mails a fresh link (`POST /v1/users/invitations/{id}/resend`); the previous one stops working. */
export function resendInvitation(invitationId: string): Promise<InvitationDto> {
  return apiRequest<InvitationDto>(`${invitationPath(invitationId)}/resend`, { method: 'POST' })
}

/** Takes the invitation back (`POST /v1/users/invitations/{id}/revoke`); its link stops working. */
export function revokeInvitation(invitationId: string): Promise<InvitationDto> {
  return apiRequest<InvitationDto>(`${invitationPath(invitationId)}/revoke`, { method: 'POST' })
}

/** 409 `invitation-already-open`: the address already has an invitation waiting. */
export function invitationAlreadyOpen(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'invitation-already-open'
}

/** 409 `invitation-closed`: the invitation was accepted, revoked or expired before the action. */
export function invitationClosed(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'invitation-closed'
}

/** Where the waiting invitations are listed, with their Resend and Revoke actions. */
export const WAITING_INVITATIONS_ROUTE = '/settings/team?tab=waiting'

export type RoleDto = {
  id: string
  code: string
  name: string
  description: string | null
  enabled: boolean
  systemRole: boolean
  permissionCodes: string[]
  /**
   * ROLE, PERMISSION_SET (approval or view only), TECHNICAL (mobile, integration) or CUSTOM. Only
   * ROLE and CUSTOM are a person's one role (RL-1). Absent from older servers: see `roleKind`.
   */
  catalogueKind?: 'ROLE' | 'PERMISSION_SET' | 'TECHNICAL' | 'CUSTOM'
}

/** The role's kind, from the server, or worked out the way the server works it out. */
export function roleKind(
  role: Pick<RoleDto, 'code' | 'systemRole' | 'catalogueKind'>,
): NonNullable<RoleDto['catalogueKind']> {
  if (role.catalogueKind) return role.catalogueKind
  if (!role.systemRole) return 'CUSTOM'
  if (role.code === 'APPROVER' || role.code === 'VIEWER') return 'PERMISSION_SET'
  if (
    role.code === 'MOBILE_USER' ||
    role.code === 'INTEGRATION' ||
    role.code === 'PLATFORM_OPERATOR'
  )
    return 'TECHNICAL'
  return 'ROLE'
}

/** A job role: one a person holds as their one role (RL-1). */
export function isJobRole(role: Pick<RoleDto, 'code' | 'systemRole' | 'catalogueKind'>): boolean {
  const kind = roleKind(role)
  return kind === 'ROLE' || kind === 'CUSTOM'
}

export const ADMIN_ROLE = 'ADMIN'

export const ROLES_PATH = '/v1/roles'

export function loadRoles(): Promise<RoleDto[]> {
  return apiRequest<RoleDto[]>(ROLES_PATH)
}

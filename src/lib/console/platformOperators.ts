import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * The platform team and its roles (`PlatformOperatorRoleController`, `UserController`).
 *
 * Reading the team is `GET /users` — the ordinary user list, which the backend scopes to the
 * caller's own tenant, here the platform tenant — so it needs `admin.users.manage`. Changing a
 * role needs `platform.operators.manage`. Only `PLATFORM_TENANT_ADMIN` holds either, so the screen
 * asks for both; the backend decides every request regardless.
 */
export const USERS_PERMISSION = 'admin.users.manage'
export const OPERATORS_PERMISSION = 'platform.operators.manage'
export const OPERATORS_PERMISSIONS = [USERS_PERMISSION, OPERATORS_PERMISSION] as const

/**
 * `PlatformRoleCatalogue.ASSIGNABLE_PRODUCTION_ROLES`: the only codes the grant endpoint accepts.
 * Anything else answers 500 (`IllegalArgumentException`), so no other code is ever sent. Kept
 * here rather than read from `GET /roles`, which lists every role of the tenant and does not say
 * which ones this endpoint will take.
 *
 * `PLATFORM_PARTICIPANT_OWNERSHIP` (V386) holds only `platform.smp.participant.transfer`.
 * Bootstrap never confers it, so it reaches a person only through this screen, one grant at a time.
 */
export const PLATFORM_ROLES = ['PLATFORM_TENANT_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_PARTICIPANT_OWNERSHIP'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

/** Every reason an operator change asks for is `@NotBlank @Size(max = 280)` on the backend. */
export const OPERATOR_REASON_MAX = 280

/** Holds `platform.operators.manage`, so the platform must never be left without one. */
export const TENANT_ADMIN: PlatformRole = 'PLATFORM_TENANT_ADMIN'

export function isPlatformRole(code: string): code is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(code)
}

/** The part of `RecordUserResponse` this screen reads. */
export type PlatformUser = {
  id: string
  username: string
  email: string
  firstName: string | null
  lastName: string | null
  enabled: boolean
  /** Active assignments only; revoked ones are not listed. May include non-platform roles. */
  roles: string[]
  createdAt: string
  /** An authenticator app is set up. Sign-in codes by email need no enrolment and are not counted. */
  mfaEnabled: boolean
  /** Sign-in refused: an administrator's lock, or a lockout after failed sign-ins still running (P9). */
  locked: boolean
  /** When a failed-sign-in lockout lifts by itself; `null` for an administrator's lock, which only an unlock ends. */
  lockedUntil: string | null
}

/** Locked by an administrator. The backend counts such a person as unable to act (P4). */
export function isAdminLocked(user: Pick<PlatformUser, 'locked' | 'lockedUntil'>): boolean {
  return user.locked && user.lockedUntil === null
}

/** Spring Data's `Page` as serialised by `GET /users`. */
export type UserPage = {
  content: PlatformUser[]
  totalElements: number
  totalPages: number
  /** Zero-based. */
  number: number
  size: number
}

// Enough for the whole platform team on one page, which is what lets the screen know who the
// last tenant administrator is. Ordered by creation rather than name: names are stored only as
// ciphertext (the PII protection empties the plain columns), so ordering by them orders by nothing
// and a page boundary could move between requests.
export const OPERATORS_PAGE_SIZE = 50
export const OPERATORS_ROUTE = '/console/operators'

export function operatorsPath(page: number): string {
  return `/v1/users?page=${page}&size=${OPERATORS_PAGE_SIZE}&sort=createdAt,asc`
}

export function displayName(user: PlatformUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
}

export type RoleChange = { user: PlatformUser; role: PlatformRole; action: 'grant' | 'revoke' }

/** `PlatformRolesResponse`: the person's platform roles after the change. */
export type PlatformRolesResponse = { userId: string; platformRoles: string[] }

export function changePlatformRole({ user, role, action }: RoleChange): Promise<PlatformRolesResponse> {
  return apiRequest<PlatformRolesResponse>(
    `/v1/platform/operators/${encodeURIComponent(user.id)}/roles/${role}`,
    { method: action === 'grant' ? 'POST' : 'DELETE', credentials: 'same-origin' },
  )
}

/**
 * The platform roles after a change the backend accepted.
 *
 * Its answer cannot be taken as it stands: a role granted to someone who has never held it is
 * missing from the reply, because the reply is read from the user entity the service loaded
 * before the grant, and only a revived assignment row is visible to that entity (proven against
 * the local backend, 2026-09-12; the database and a fresh read both have the role). A 200 means
 * the change was made, so it is applied on top of the answer; everything else in the answer is
 * the backend's.
 */
export function rolesAfter({ role, action }: Pick<RoleChange, 'role' | 'action'>, answered: readonly string[]): string[] {
  const others = answered.filter((code) => code !== role)
  return action === 'grant' ? [...others, role] : others
}

/**
 * The person as the list would now show them. The response names only platform roles — any other
 * role they hold is deliberately not its business — so those are kept from the list.
 */
export function withPlatformRoles(user: PlatformUser, platformRoles: readonly string[]): PlatformUser {
  return {
    ...user,
    roles: [...(user.roles ?? []).filter((code) => !isPlatformRole(code)), ...platformRoles.filter(isPlatformRole)],
  }
}

/**
 * Whether removing `user`'s tenant administration would leave nobody who can act holding it —
 * which the backend refuses (`LastAdministratorGuard`, P4). Only a holder who can act counts, as
 * the backend counts them: not a disabled one, and not one an administrator locked. A lockout
 * after failed sign-ins still counts — it lifts by itself. Knowable only when the whole team is on
 * screen; otherwise the backend decides.
 */
export function isLastTenantAdmin(user: PlatformUser, team: readonly PlatformUser[], wholeTeam: boolean): boolean {
  if (!wholeTeam || !(user.roles ?? []).includes(TENANT_ADMIN)) return false
  return !team.some(
    (other) => other.id !== user.id && other.enabled && !isAdminLocked(other) && (other.roles ?? []).includes(TENANT_ADMIN),
  )
}

/**
 * What a refused change means. A self-grant and a last-administrator revoke carry their own
 * problem types (`RefusalType`); any other 403, a missing permission among them, keeps the general
 * message. The screen stops the first two before sending, so they arrive only when its view of the
 * team was stale.
 *
 * A grant outside the production platform realm is refused with `IllegalArgumentException`, which
 * the backend answers as `500 internal-error`, so here it cannot be told apart from a fault.
 */
export function describeRoleChangeFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      if (error.problemType === 'own-account-refused') return { key: 'console.operators.selfGive' }
      if (error.problemType === 'last-administrator') return { key: 'console.operators.lastAdmin' }
      return { key: 'console.operators.error.refused' }
    }
    if (error.status === 404) return { key: 'console.operators.error.gone' }
  }
  return commonFailureMessage(error)
}

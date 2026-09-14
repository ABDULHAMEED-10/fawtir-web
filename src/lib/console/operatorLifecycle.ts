import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import type { PlatformUser } from './platformOperators'

/**
 * Locking, unlocking and deactivating an operator.
 *
 * `POST /platform/operators/{id}/lock|unlock|deactivate`, each with a reason: the same boundary as
 * every other change to an operator's standing — `platform.operators.manage`, an MFA-verified
 * session, the production realm, never from impersonation. The generic `/users` lifecycle refuses
 * platform tenants (`platform-operator-path-required`). Each answers 204, so the screen applies what
 * it asked for.
 * - **Lock** is an administrator's lock: every session and pending sign-in ends, and only an unlock
 *   lifts it.
 * - **Unlock** lifts that, and also a lockout after failed sign-ins.
 * - **Deactivate** ends sessions and devices and revokes the invitations the person left open; they
 *   leave the team for the deactivated list, from where only a reactivation — with no role — brings
 *   them back.
 *
 * The backend refuses taking away the last tenant administrator who can act, and the caller's own
 * account (`own-account-refused`); the screen never offers these on your own row either.
 */
export type LifecycleAction = 'lock' | 'unlock' | 'deactivate'

export function changeOperatorLifecycle(
  user: Pick<PlatformUser, 'id'>,
  action: LifecycleAction,
  reason: string,
): Promise<void> {
  return apiRequest<void>(`/v1/platform/operators/${encodeURIComponent(user.id)}/${action}`, {
    method: 'POST',
    body: { reason },
    credentials: 'same-origin',
  })
}

/** The person as the screen should now show them; the backend answered 204 with nothing to read. */
export function afterLifecycle(user: PlatformUser, action: LifecycleAction): PlatformUser {
  if (action === 'lock') return { ...user, locked: true, lockedUntil: null }
  if (action === 'unlock') return { ...user, locked: false, lockedUntil: null }
  // As `GET /users?status=DEACTIVATED` reports them: signed-in off, and no role in effect.
  return { ...user, enabled: false, roles: [], locked: false, lockedUntil: null }
}

/**
 * Why a change was refused. `last-administrator` is the backend's stable problem type (P12) for
 * taking away the last tenant administrator who can act; any other 403 is the caller's access (or
 * their own account, which the screen does not offer).
 */
export function describeLifecycleFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.problemType === 'last-administrator') return { key: 'console.operators.lastAdmin' }
    if (error.status === 403) return { key: 'console.operators.lifecycle.error.refused' }
    if (error.status === 404) return { key: 'console.operators.error.gone' }
    if (error.status === 400) return { key: 'console.operators.reason.invalid' }
  }
  return commonFailureMessage(error)
}

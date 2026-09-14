import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import type { PlatformUser } from './platformOperators'

/**
 * Bringing a deactivated operator back (backend P9).
 *
 * The list is the generic `GET /users?status=DEACTIVATED` (`admin.users.manage`); reactivating is
 * `POST /platform/operators/{id}/reactivate` (`platform.operators.manage`, with a reason), the only
 * path the backend accepts for an operator — the generic customer endpoint refuses the platform
 * tenant. The person comes back with no role at all: the backend retires every role they held, so
 * authority returns only through the Roles dialog.
 */

// Most recently deactivated first: the person just deactivated by mistake is the likely one to
// bring back. `deletedAt` is not in the response but is a sortable column of the user table.
export const DEACTIVATED_PAGE_SIZE = 50
export const DEACTIVATED_OPERATORS_PATH = `/v1/users?status=DEACTIVATED&page=0&size=${DEACTIVATED_PAGE_SIZE}&sort=deletedAt,desc`

export function reactivateOperator(user: Pick<PlatformUser, 'id'>, reason: string): Promise<PlatformUser> {
  return apiRequest<PlatformUser>(`/v1/platform/operators/${encodeURIComponent(user.id)}/reactivate`, {
    method: 'POST',
    body: { reason },
    credentials: 'same-origin',
  })
}

/**
 * The team with the people reactivated on this screen. Someone already listed — deactivated and
 * brought back here — is replaced by the answer, which is what they are now (no role). Someone not
 * listed is placed where the backend would list them, by creation, but only when the whole team is
 * on screen (`placeNew`): on a paged team they belong on whichever page their creation date puts
 * them, which only a fresh read can say.
 */
export function withReactivated(
  team: readonly PlatformUser[],
  returned: readonly PlatformUser[],
  placeNew = true,
): PlatformUser[] {
  const answers = new Map(returned.map((user) => [user.id, user]))
  const listed = team.map((user) => answers.get(user.id) ?? user)
  const added = placeNew ? returned.filter((user) => !team.some((other) => other.id === user.id)) : []
  if (added.length === 0) return listed
  // Parsed, not compared as text: Instants serialise with a varying number of fraction digits.
  return [...listed, ...added].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
}

/**
 * Why a reactivation was refused. `409` is the account already being active — someone else
 * reactivated it — and `404` it no longer being a deactivated operator here; `403` is the backend
 * refusing the caller (permission, impersonation), told apart only in English prose.
 */
export function describeReactivateFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 400) return { key: 'console.operators.reason.invalid' }
    if (error.status === 409) return { key: 'console.operators.reactivate.error.active' }
    if (error.status === 404) return { key: 'console.operators.reactivate.error.gone' }
    if (error.status === 403) return { key: 'console.operators.error.refused' }
  }
  return commonFailureMessage(error)
}

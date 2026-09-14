import { ApiError, apiRequest } from '../../api'
import { forgetEntitlements } from './entitlements'

export const LOGOUT_PATH = '/v1/auth/logout'

/**
 * Resolves only when the backend says no session remains, and rejects otherwise.
 *
 * `204`: this session and its refresh tokens are revoked and the cookies cleared. `401`: there was
 * no live session to end — no cookie, expired, or already revoked — so the user is already signed
 * out. Everything else (`403` CSRF refusal, `429`, `5xx`, offline, timeout) leaves the HttpOnly
 * session usable, and the browser cannot delete it, so reporting success there would be a lie.
 */
export async function signOut(): Promise<void> {
  try {
    await apiRequest<void>(LOGOUT_PATH, { method: 'POST', credentials: 'same-origin' })
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) throw error
  }
  // Only once the backend confirms no session remains: a failed sign-out keeps its session, and
  // with it everything that described that session.
  forgetEntitlements()
}

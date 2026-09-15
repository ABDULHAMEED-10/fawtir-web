import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from './errors'

export const FORGOT_PASSWORD_PATH = '/v1/auth/forgot-password'
export const RESET_PASSWORD_PATH = '/v1/auth/reset-password'
export const FORGOT_PASSWORD_ROUTE = '/forgot-password'
export const NEW_PASSWORD_ROUTE = '/new-password'

/** The reset link is valid this long (`AccountRecoveryService`), stated in the copy. */
export const RESET_LINK_MINUTES = 30

/**
 * Client-side only, like the sign-in code: the server's limit is per client IP (5 a minute).
 * A minute keeps a user from replacing the link that is about to arrive with one that has not.
 */
export const RESEND_DELAY_MS = 60_000

/** `ForgotPasswordRequest`: 3–255 characters server-side, with no shape rule, as on login. */
export const RECOVERY_USERNAME_MAX_LENGTH = 255

/**
 * The token from `<new-password URL>#token=<token>`, the link the reset mail carries.
 *
 * It travels in the fragment so it never reaches a server log or a `Referer` header. The page reads
 * it once and then removes it from the address bar and history.
 */
export function readResetToken(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const token = new URLSearchParams(fragment).get('token')
  return token && token.trim() ? token.trim() : null
}

/**
 * `202` whatever the username is, so the answer cannot be used to learn which accounts exist.
 * No cookies are sent: recovery must not depend on, or be confused by, a session already in this
 * browser.
 */
export async function requestPasswordReset(username: string, signal?: AbortSignal): Promise<void> {
  await apiRequest<void>(FORGOT_PASSWORD_PATH, {
    method: 'POST',
    body: { username: username.trim() },
    signal,
    credentials: 'omit',
  })
}

/** `204` on success; the server also signs the account out everywhere else. */
export async function resetPassword(token: string, newPassword: string, signal?: AbortSignal): Promise<void> {
  await apiRequest<void>(RESET_PASSWORD_PATH, {
    method: 'POST',
    body: { token, newPassword },
    signal,
    credentials: 'omit',
  })
}

/**
 * A `401` from reset-password means the token is unknown, expired, already used, or replaced by a
 * newer request; the server does not say which, and neither does this. A `400` is the password
 * itself: the policy, the reuse history, or the same as the current one.
 */
export function describeResetFailure(error: unknown): FormMessage {
  if (error instanceof ApiError && error.status === 401) return { key: 'newPassword.linkInvalid' }
  if (error instanceof ApiError && error.status === 400) return { key: 'newPassword.passwordRejected' }
  return commonFailureMessage(error)
}

export function isResetLinkSpent(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

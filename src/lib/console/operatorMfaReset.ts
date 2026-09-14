import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import type { PlatformUser } from './platformOperators'

/**
 * Resetting another operator's two-step sign-in (backend P10).
 *
 * `POST /platform/operators/{id}/mfa-reset` (`platform.operators.manage`, with a reason) is the
 * only way an operator's factor is cleared by someone else: the generic `DELETE /users/{id}/mfa`
 * refuses the platform tenant. It removes the authenticator app and recovery codes, ends every
 * session the person has, and emails them. Sign-in codes by email need no enrolment, so the
 * person signs in again with one. The backend refuses a reset of your own account.
 */

/** `PlatformOperatorMfaController.MfaResetResponse`. */
export type MfaResetResponse = {
  userId: string
  username: string
  revokedSessions: number
  resetAt: string
  resetBy: string
}

export function resetOperatorMfa(user: Pick<PlatformUser, 'id'>, reason: string): Promise<MfaResetResponse> {
  return apiRequest<MfaResetResponse>(`/v1/platform/operators/${encodeURIComponent(user.id)}/mfa-reset`, {
    method: 'POST',
    body: { reason },
    credentials: 'same-origin',
  })
}

/**
 * Why a reset was refused. A `403` is your own account, a missing permission or an impersonation
 * session — told apart only in English prose, so one message covers them — and a `404` the person
 * no longer being on the team.
 */
export function describeMfaResetFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 400) return { key: 'console.operators.reason.invalid' }
    if (error.status === 403) return { key: 'console.operators.mfaReset.error.refused' }
    if (error.status === 404) return { key: 'console.operators.error.gone' }
  }
  return commonFailureMessage(error)
}

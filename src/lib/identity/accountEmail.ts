import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from './errors'

/**
 * Confirming a change of your own sign-in email (backend P8), the operator's half.
 *
 * `POST /platform/operators/me/email/confirm` takes the code mailed to the new address. It needs
 * only a signed-in session — no platform role — because the one change it can apply is the
 * caller's own. Applying it ends every session, this one included.
 */
export const ACCOUNT_EMAIL_CONFIRM_ROUTE = '/account/email/confirm'

/** `PlatformOperatorEmailController.EmailChangeResponse`, the part this page reads. */
export type EmailChangeResult = {
  newEmail: string
  alreadyApplied: boolean
  revokedSessions: number
}

export function confirmOwnEmailChange(token: string): Promise<EmailChangeResult> {
  return apiRequest<EmailChangeResult>('/v1/platform/operators/me/email/confirm', {
    method: 'POST',
    body: { token },
    credentials: 'same-origin',
  })
}

export type ConfirmFailure = { kind: 'signedOut' } | { kind: 'code' } | { kind: 'form'; message: FormMessage }

/**
 * A `401` means two different things here, told apart by the problem type the backend documents
 * as stable: `authentication-failed` is the code being refused — wrong, expired, used, replaced
 * or someone else's — while any other `401` is the session itself being gone. Treating the first
 * as the second would sign someone out for a typo.
 */
export function describeConfirmFailure(error: unknown): ConfirmFailure {
  if (error instanceof ApiError) {
    if (error.status === 401) return error.problemType === 'authentication-failed' ? { kind: 'code' } : { kind: 'signedOut' }
    if (error.status === 400) return { kind: 'code' }
    if (error.status === 403) return { kind: 'form', message: { key: 'accountEmail.error.notOperator' } }
  }
  return { kind: 'form', message: commonFailureMessage(error) }
}

import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'
import type { PlatformUser } from './platformOperators'

/**
 * Changing an operator's sign-in email, the administrator's half (backend P8).
 *
 * `PUT /platform/operators/{id}/email` moves nothing: the address is where sign-in codes and
 * password resets go, so it only records the change, mails a confirmation code to the new
 * address and tells the current one. The operator applies it themselves, signed in to their own
 * account (`/account/email/confirm`). A later request replaces a pending one; there is no way to
 * read or cancel a pending change, so the screen can say what it asked for only at the time.
 */

export type EmailChangeStatus = 'PENDING_CONFIRMATION' | 'ALREADY_APPLIED'

/** `PlatformOperatorEmailController.EmailChangeRequestResponse`, the part this screen reads. */
export type EmailChangeRequest = {
  userId: string
  currentEmail: string
  requestedEmail: string
  status: EmailChangeStatus
  /** When the confirmation code stops working; `null` when nothing was pending. */
  expiresAt: string | null
}

export function requestOperatorEmailChange(
  user: Pick<PlatformUser, 'id' | 'email'>,
  newEmail: string,
  reason: string,
): Promise<EmailChangeRequest> {
  return apiRequest<EmailChangeRequest>(`/v1/platform/operators/${encodeURIComponent(user.id)}/email`, {
    method: 'PUT',
    // The address this screen shows is sent as the one being replaced: if someone changed it
    // meanwhile, the backend refuses rather than moving the wrong account's sign-in factor.
    body: { expectedCurrentEmail: user.email, newEmail, reason },
    credentials: 'same-origin',
  })
}

/** The backend compares addresses trimmed and case-insensitively. */
export function isSameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Why a request was refused. A `409` is either the address belonging to another operator or the
 * person's email having changed since the list was read; the backend tells the two apart only in
 * English, so one message covers both and asks for a reload.
 */
export function describeEmailChangeFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409) return { key: 'console.operators.emailChange.error.conflict' }
    if (error.status === 400) return { key: 'console.operators.emailChange.error.rejected' }
    if (error.status === 403) return { key: 'console.operators.emailChange.error.refused' }
    if (error.status === 404) return { key: 'console.operators.error.gone' }
  }
  return commonFailureMessage(error)
}

import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, mapServerFieldErrors, type FormMessage, type ServerFieldMap } from './errors'

/**
 * Accepting a platform operator invitation (backend P7), from the link the invitation mail
 * carries: `<acceptance page>#token=<token>`.
 *
 * The token lives in the fragment so it never reaches a server log, analytics or a `Referer`;
 * the page reads it once, removes it from the address bar and holds it only in memory.
 */
export const OPERATOR_INVITATION_ROUTE = '/operator-invitation'

/** `AcceptInvitationRequest`: the token plus what the invitee chooses. The email is the invitation's. */
export type AcceptInvitationRequest = {
  token: string
  username: string
  password: string
  firstName?: string
  lastName?: string
}

/** The token from a `#token=…` fragment, or `null` when the link carries none. */
export function tokenFromFragment(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const value = new URLSearchParams(fragment).get('token')
  return value && value.trim() ? value.trim() : null
}

/**
 * Creates the account. No session comes back — the new operator signs in normally afterwards.
 *
 * Sent without cookies: the endpoint is public, and a portal session left in the same browser
 * (an administrator testing the link, say) would otherwise make it a CSRF-checked request.
 */
export function acceptOperatorInvitation(request: AcceptInvitationRequest): Promise<unknown> {
  return apiRequest<unknown>('/v1/auth/invitations/accept', {
    method: 'POST',
    body: request,
    credentials: 'omit',
  })
}

export type AcceptField = 'username' | 'password' | 'firstName' | 'lastName'

const SERVER_FIELDS: ServerFieldMap<AcceptField> = new Map([
  ['username', { field: 'username', key: 'operatorInvitation.error.usernameRejected' }],
  ['password', { field: 'password', key: 'operatorInvitation.error.passwordRejected' }],
  ['firstName', { field: 'firstName', key: 'operatorInvitation.error.nameRejected' }],
  ['lastName', { field: 'lastName', key: 'operatorInvitation.error.nameRejected' }],
])

export type AcceptFailure =
  /** The link can never work: invalid, expired, already used or revoked. */
  | { kind: 'link' }
  | { kind: 'form'; fieldErrors: Partial<Record<AcceptField, string>>; formError: FormMessage | null }

/**
 * What a refused acceptance means.
 *
 * - `401` is the backend's one answer for every token problem, deliberately indistinguishable,
 *   so the link is treated as spent.
 * - `409` is a username (or, rarely, the invited address) already in use. The backend says
 *   which only in English, and the username is the one the invitee can change.
 * - A username taken in another tenant is still a `500` until the error-contract cleanup
 *   (backend P12), so it reads as a service fault.
 */
export function describeAcceptFailure(error: unknown): AcceptFailure {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return { kind: 'link' }
    if (error.status === 409) {
      return { kind: 'form', fieldErrors: { username: 'operatorInvitation.error.usernameTaken' }, formError: null }
    }
    if (error.status === 400) {
      const { fieldErrors, unattributed } = mapServerFieldErrors(error, SERVER_FIELDS)
      return {
        kind: 'form',
        fieldErrors,
        formError: unattributed || Object.keys(fieldErrors).length === 0 ? { key: 'operatorInvitation.error.rejected' } : null,
      }
    }
  }
  return { kind: 'form', fieldErrors: {}, formError: commonFailureMessage(error) }
}

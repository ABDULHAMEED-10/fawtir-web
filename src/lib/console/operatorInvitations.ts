import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * Platform operator invitations (backend P7).
 *
 * Sending and resending live on `/platform/operators/invitations` and need
 * `platform.operators.manage`: adding a person who may later hold platform authority belongs
 * with the power to grant it. Listing and revoking stay on the generic `/users/invitations`
 * (`admin.users.manage`), which lists every kind, so the screen keeps the operator ones.
 *
 * An invitation names no role and carries no password: the invitee chooses their own from the
 * emailed link and joins with no platform role; roles are then given on the Roles dialog.
 */
export const OPERATOR_INVITATIONS_PATH = '/v1/platform/operators/invitations'

// Both open states, read separately. An expired invitation is still "open" to the backend: it
// blocks a new invitation to the same address (409) and can be resent, so hiding it would leave
// that address stuck. The list is newest-first across all states, so one unfiltered read could
// lose an old open invitation behind history. The backend caps a page at 100.
export const PENDING_INVITATIONS_PATH = '/v1/users/invitations?status=PENDING&page=0&size=100'
export const EXPIRED_INVITATIONS_PATH = '/v1/users/invitations?status=EXPIRED&page=0&size=100'

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
export type InvitationKind = 'MEMBER' | 'PLATFORM_OPERATOR'

/** The part of `InvitationResponse` this screen reads. */
export type Invitation = {
  id: string
  email: string
  status: InvitationStatus
  expiresAt: string
  sentCount: number
  lastSentAt: string
  createdAt: string
  kind: InvitationKind
}

export function isOperatorInvitation(invitation: Invitation): boolean {
  return invitation.kind === 'PLATFORM_OPERATOR'
}

export function inviteOperator(email: string): Promise<Invitation> {
  return apiRequest<Invitation>(OPERATOR_INVITATIONS_PATH, {
    method: 'POST',
    body: { email },
    credentials: 'same-origin',
  })
}

/** Mails a fresh link; the previous one stops working at once. */
export function resendOperatorInvitation(invitation: Invitation): Promise<Invitation> {
  return apiRequest<Invitation>(`${OPERATOR_INVITATIONS_PATH}/${encodeURIComponent(invitation.id)}/resend`, {
    method: 'POST',
    credentials: 'same-origin',
  })
}

export function revokeInvitation(invitation: Invitation): Promise<Invitation> {
  return apiRequest<Invitation>(`/v1/users/invitations/${encodeURIComponent(invitation.id)}/revoke`, {
    method: 'POST',
    credentials: 'same-origin',
  })
}

export function isOpen(invitation: Invitation): boolean {
  return invitation.status === 'PENDING' || invitation.status === 'EXPIRED'
}

/**
 * The open operator invitations after a change: an open answer (a new or resent invitation)
 * goes on top in place of its old row; an accepted or revoked one leaves the list.
 */
export function withInvitation(current: readonly Invitation[], changed: Invitation): Invitation[] {
  const others = current.filter((invitation) => invitation.id !== changed.id)
  return isOpen(changed) ? [changed, ...others] : others
}

/** Newest first, as the backend orders each read. */
export function openOperatorInvitations(...reads: readonly (readonly Invitation[])[]): Invitation[] {
  return reads
    .flat()
    .filter((invitation) => isOperatorInvitation(invitation) && isOpen(invitation))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

/**
 * Why sending was refused. A `409` means the address already belongs to someone on the team
 * or already has an open invitation; the backend tells the two apart only in English, so one
 * message covers both. A `503` is the deployment having no acceptance page to link to.
 */
export function describeInviteFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409) return { key: 'console.operators.invite.error.conflict' }
    if (error.status === 503) return { key: 'console.operators.invite.error.unavailable' }
    if (error.status === 403) return { key: 'console.operators.error.refused' }
    if (error.status === 400) return { key: 'console.operators.invite.error.email' }
  }
  return commonFailureMessage(error)
}

/** Why a resend or revoke was refused: `409` and `404` both mean the invitation is no longer open. */
export function describeInvitationActionFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 409 || error.status === 404) return { key: 'console.operators.pending.error.closed' }
    if (error.status === 503) return { key: 'console.operators.invite.error.unavailable' }
    if (error.status === 403) return { key: 'console.operators.error.refused' }
  }
  return commonFailureMessage(error)
}
